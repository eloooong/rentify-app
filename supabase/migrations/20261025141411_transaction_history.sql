-- Participant-only read model. Underlying financial tables stay private.
begin;

create function public.list_payment_history(
  p_type text default null,
  p_role text default 'all',
  p_from date default null,
  p_to date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if actor is null then raise exception using errcode='42501',message='forbidden'; end if;
  if (p_type is not null and p_type not in ('payment','refund'))
    or p_role is null or p_role not in ('all','renter','owner')
    or p_page is null or p_page not between 1 and 10000
    or p_page_size is null or p_page_size not between 1 and 50
    or (p_from is not null and not isfinite(p_from))
    or (p_to is not null and not isfinite(p_to))
    or (p_from is not null and p_to is not null and p_from>p_to) then
    raise exception using errcode='P0001',message='invalid_query';
  end if;
  with participant_bookings as (
    select b.id,b.listing_id,case when b.renter_id=actor then 'renter' else 'owner' end as participant_role
    from public.bookings b
    where (b.renter_id=actor or b.owner_id=actor)
      and (p_role='all' or (p_role='renter' and b.renter_id=actor) or (p_role='owner' and b.owner_id=actor))
  ), transactions as (
    select 'payment:'||r.id::text as id,b.id as booking_id,b.listing_id,b.participant_role,
      'payment'::text as type,case when r.disposition='review' then 'review' else 'captured' end as state,
      r.amount,r.currency,a.provider,r.paid_at as occurred_at,r.created_at as updated_at,
      case when r.amount=a.total_amount and r.currency='PHP' and r.method='gcash' then a.rental_amount else null end as rental_amount,
      case when r.amount=a.total_amount and r.currency='PHP' and r.method='gcash' then a.deposit_amount else null end as deposit_amount
    from participant_bookings b join public.checkout_attempts a on a.booking_id=b.id
      join public.payment_receipts r on r.attempt_id=a.id
    union all
    select 'refund:'||f.id::text,b.id,b.listing_id,b.participant_role,'refund',f.state,
      f.amount::bigint,'PHP',a.provider,f.created_at,f.updated_at,null::integer,null::integer
    from participant_bookings b join public.checkout_attempts a on a.booking_id=b.id
      join public.payment_receipts r on r.attempt_id=a.id join public.refund_attempts f on f.receipt_id=r.id
  ), filtered as (
    select * from transactions t
    where (p_type is null or t.type=p_type)
      and (p_from is null or t.occurred_at>=(p_from::timestamp at time zone 'Asia/Manila'))
      and (p_to is null or t.occurred_at<((p_to+1)::timestamp at time zone 'Asia/Manila'))
  ), paged as (
    select * from filtered order by occurred_at desc,type desc,id desc
    limit p_page_size offset (p_page-1)*p_page_size
  )
  select jsonb_build_object(
    'data',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'booking_id',t.booking_id,'listing_id',t.listing_id,'role',t.participant_role,
      'type',t.type,'state',t.state,'amount',t.amount,'currency',t.currency,'provider',t.provider,
      'test_mode',true,'occurred_at',t.occurred_at,'updated_at',t.updated_at,
      'rental_amount',t.rental_amount,'deposit_amount',t.deposit_amount
    ) order by t.occurred_at desc,t.type desc,t.id desc) from paged t),'[]'::jsonb),
    'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',(select count(*) from filtered)),
    'timezone','Asia/Manila'
  ) into result;
  return result;
end;
$$;
revoke all on function public.list_payment_history(text,text,date,date,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_payment_history(text,text,date,date,integer,integer) to authenticated;
comment on function public.list_payment_history(text,text,date,date,integer,integer) is
  'Private participant history: one row per capture/refund attempt; no client ledger grants or money movement.';
commit;
