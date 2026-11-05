-- Immediate public reviews, only after completed rentals; no lifecycle transition.
begin;

alter table public.reviews add constraint reviews_comment_length
  check (char_length(comment)<=2000);
revoke all on public.reviews from public,anon,authenticated,service_role;
grant select on public.reviews to service_role;

create function public.review_json(r public.reviews)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',r.id,'author_id',r.author_id,'subject_id',r.subject_id,
    'author_name',p.display_name,'subject_role',case when r.subject_id=b.owner_id then 'owner' else 'renter' end,
    'rating',r.rating,'comment',r.comment,'created_at',r.created_at)
  from public.bookings b join public.profiles p on p.id=r.author_id
  where b.id=r.booking_id and b.status='completed'
    and ((r.author_id=b.renter_id and r.subject_id=b.owner_id)
      or (r.author_id=b.owner_id and r.subject_id=b.renter_id));
$$;

create function public.submit_booking_review(p_booking uuid,p_rating integer,p_comment text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); b public.bookings; r public.reviews; body text:=btrim(p_comment); replayed boolean:=false;
begin
  if not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null) then
    raise exception using errcode='42501',message='sign_in'; end if;
  if p_booking is null or p_rating is null or p_rating not between 1 and 5 or body is null or char_length(body)>2000 then
    raise exception using errcode='22023',message='validation'; end if;
  select * into b from public.bookings where id=p_booking and actor in (renter_id,owner_id) for share;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  if not public.booking_actor_eligible(actor) then raise exception using errcode='42501',message='account_inactive'; end if;
  if b.status<>'completed' then raise exception using errcode='P0001',message='review_not_allowed'; end if;
  insert into public.reviews(booking_id,author_id,subject_id,rating,comment)
    values(b.id,actor,case when actor=b.renter_id then b.owner_id else b.renter_id end,p_rating,body)
    on conflict(booking_id,author_id) do nothing returning * into r;
  if not found then
    select * into r from public.reviews where booking_id=b.id and author_id=actor;
    if r.rating<>p_rating or r.comment<>body then raise exception using errcode='P0001',message='review_exists'; end if;
    replayed:=true;
  else
    insert into public.audit_log(actor_id,action,target_table,target_id)
      values(actor,'review.submitted','reviews',r.id);
  end if;
  return jsonb_build_object('data',public.review_json(r),'replayed',replayed);
end;
$$;

create function public.get_booking_review(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); b public.bookings; r public.reviews; why text;
begin
  if not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null) then
    raise exception using errcode='42501',message='sign_in'; end if;
  select * into b from public.bookings where id=p_booking and actor in (renter_id,owner_id);
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  select * into r from public.reviews where booking_id=b.id and author_id=actor;
  why:=case when r.id is not null then 'already_reviewed' when b.status<>'completed' then 'booking_incomplete'
    when not public.booking_actor_eligible(actor) then 'account_inactive' else null end;
  return jsonb_build_object('booking_id',b.id,'can_review',why is null,'reason',why,'review',public.review_json(r));
end;
$$;

create function public.list_profile_reviews(p_subject uuid,p_role text default null,p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint; average numeric;
begin
  if p_subject is null or (p_role is not null and p_role not in ('owner','renter')) or p_page is null or p_page not between 1 and 10000
    or p_page_size is null or p_page_size not between 1 and 50 then raise exception using errcode='22023',message='validation'; end if;
  select count(*),round(avg(r.rating),2) into total,average from public.reviews r join public.bookings b on b.id=r.booking_id
    where r.subject_id=p_subject and b.status='completed'
      and ((r.author_id=b.renter_id and r.subject_id=b.owner_id and (p_role is null or p_role='owner'))
        or (r.author_id=b.owner_id and r.subject_id=b.renter_id and (p_role is null or p_role='renter')));
  select coalesce(jsonb_agg(public.review_json(r) order by r.created_at desc,r.id desc),'[]'::jsonb) into result
    from (select r1.* from public.reviews r1 join public.bookings b on b.id=r1.booking_id
      where r1.subject_id=p_subject and b.status='completed'
        and ((r1.author_id=b.renter_id and r1.subject_id=b.owner_id and (p_role is null or p_role='owner'))
          or (r1.author_id=b.owner_id and r1.subject_id=b.renter_id and (p_role is null or p_role='renter')))
      order by r1.created_at desc,r1.id desc limit p_page_size offset(p_page-1)*p_page_size)r;
  return jsonb_build_object('data',result,'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total),
    'summary',jsonb_build_object('count',total,'average',average));
end;
$$;

revoke all on function public.review_json(public.reviews),public.submit_booking_review(uuid,integer,text),
  public.get_booking_review(uuid),public.list_profile_reviews(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.submit_booking_review(uuid,integer,text),public.get_booking_review(uuid) to authenticated;
grant execute on function public.list_profile_reviews(uuid,text,integer,integer) to anon,authenticated;
commit;
