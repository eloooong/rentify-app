-- B2.2: validated demo commands, private reads, public date availability and expiry.
begin;

alter table public.bookings
  add column request_key uuid,
  add column daily_price_amount integer check (daily_price_amount > 0),
  add column policy_version text,
  add column request_expires_at timestamptz,
  add column payment_expires_at timestamptz,
  add column accepted_at timestamptz,
  add column closed_by uuid references public.profiles(id) on delete restrict,
  add column status_reason text check (char_length(status_reason) between 3 and 500),
  add constraint bookings_request_key_unique unique (renter_id,request_key),
  add constraint bookings_command_snapshot check (
    request_key is null or (
      daily_price_amount is not null and policy_version is not null and policy_version='demo-booking-v1'
      and request_expires_at is not null and currency='PHP'
      and rental_amount::bigint=daily_price_amount::bigint*rental_days
    )
  );

create index bookings_request_expiry_idx on public.bookings(request_expires_at,listing_id)
  where status='requested' and request_expires_at is not null;
create index bookings_payment_expiry_idx on public.bookings(payment_expires_at,listing_id)
  where status='accepted' and payment_expires_at is not null;

create function public.booking_actor_eligible(actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=actor and u.email_confirmed_at is not null and p.account_status='active');
$$;

create function public.booking_reserves_dates(s public.booking_status,deadline timestamptz,at_time timestamptz)
returns boolean language sql immutable set search_path='' as $$
  select case when s='accepted' then deadline is null or deadline>at_time
    else s in ('paid','handed_over','returned','disputed') end;
$$;

create function public.booking_device_unavailable(listing uuid,at_time timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.bookings b where b.listing_id=listing
    and (b.status='disputed' or (b.status='handed_over'
      and upper(b.rental_period)<=(at_time at time zone 'Asia/Manila')::date)));
$$;

create function public.booking_payload(b public.bookings)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  at_time timestamptz := clock_timestamp();
  actions text[] := '{}';
  stale boolean := (b.status='requested' and b.request_expires_at<=at_time)
    or (b.status='accepted' and b.payment_expires_at<=at_time);
begin
  if b.request_key is not null and public.booking_actor_eligible(actor) then
    if b.status='requested' and b.request_expires_at>at_time then
      if actor=b.renter_id then actions:=array['cancel'];
      elsif actor=b.owner_id then
        actions:=array['decline'];
        if public.booking_actor_eligible(b.renter_id)
          and exists(select 1 from public.listings l where l.id=b.listing_id and l.status='published')
          and not public.booking_device_unavailable(b.listing_id,at_time)
          and not exists(select 1 from public.bookings other where other.listing_id=b.listing_id
            and other.id<>b.id and other.rental_period && b.rental_period
            and public.booking_reserves_dates(other.status,other.payment_expires_at,at_time)) then
          actions:=array['accept','decline'];
        end if;
      end if;
    elsif b.status='accepted' and b.payment_expires_at>at_time
      and actor in (b.owner_id,b.renter_id) then actions:=array['cancel'];
    end if;
  end if;
  return jsonb_build_object(
    'id',b.id,'listing_id',b.listing_id,'owner_id',b.owner_id,'renter_id',b.renter_id,
    'pickup_date',to_char(lower(b.rental_period),'YYYY-MM-DD'),
    'return_date',to_char(upper(b.rental_period)-1,'YYYY-MM-DD'),
    'rental_days',b.rental_days,'daily_price_amount',b.daily_price_amount,
    'rental_amount',b.rental_amount,'deposit_amount',b.deposit_amount,
    'total_amount',b.rental_amount::bigint+b.deposit_amount::bigint,'currency',b.currency,
    'status',b.status,'policy_version',b.policy_version,
    'request_expires_at',b.request_expires_at,'payment_expires_at',b.payment_expires_at,
    'accepted_at',b.accepted_at,'closed_by',b.closed_by,'status_reason',b.status_reason,
    'is_expired',coalesce(stale,false),'allowed_actions',to_jsonb(actions),
    'created_at',b.created_at,'updated_at',b.updated_at);
end;
$$;

-- Caller must already hold the listing row lock. All command paths use the same
-- listing-before-booking lock order; no expiry deadline is trusted to a browser.
create function public.expire_listing_booking_holds(listing uuid,at_time timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  with changed as (
    update public.bookings b set status='expired',closed_by=null,
      status_reason=case when b.status='requested' then 'Request deadline reached' else 'Payment deadline reached' end
    where b.listing_id=listing and (
      (b.status='requested' and b.request_expires_at<=at_time)
      or (b.status='accepted' and b.payment_expires_at<=at_time))
    returning b.id,b.status_reason
  ), logged as (
    insert into public.audit_log(action,target_table,target_id,details)
    select 'booking.expired','bookings',id,jsonb_build_object('reason',status_reason) from changed
    returning id
  ) select count(*) into affected from logged;
  return affected;
end;
$$;

create function public.expire_booking_holds(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare listing uuid; affected integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>500 then
    raise exception using errcode='P0001',message='invalid_query';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('rentify-booking-expiry',0)) then return 0; end if;
  for listing in
    select l.id from public.listings l where exists(select 1 from public.bookings b
      where b.listing_id=l.id and ((b.status='requested' and b.request_expires_at<=clock_timestamp())
      or (b.status='accepted' and b.payment_expires_at<=clock_timestamp())))
    order by l.id limit p_limit for update of l skip locked
  loop
    affected:=affected+public.expire_listing_booking_holds(listing,clock_timestamp());
  end loop;
  return affected;
end;
$$;

create function public.request_booking(p_listing uuid,p_pickup date,p_return date,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); l public.listings; b public.bookings;
  at_time timestamptz; start_time timestamptz; days integer; amount bigint;
begin
  if not public.booking_actor_eligible(actor) then
    raise exception using errcode='42501',message='profile_required';
  end if;
  if p_listing is null or p_pickup is null or p_return is null or p_request_key is null then
    raise exception using errcode='P0001',message='invalid_dates';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_key::text,0));
  select * into b from public.bookings where renter_id=actor and request_key=p_request_key;
  if found then
    if b.listing_id<>p_listing or lower(b.rental_period)<>p_pickup or upper(b.rental_period)-1<>p_return then
      raise exception using errcode='P0001',message='idempotency_conflict';
    end if;
    return jsonb_build_object('booking',public.booking_payload(b),'replayed',true);
  end if;
  select * into l from public.listings where id=p_listing for update;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  at_time:=clock_timestamp();
  if l.status<>'published' or not public.booking_actor_eligible(l.owner_id) then
    raise exception using errcode='P0001',message='not_found';
  end if;
  if actor=l.owner_id then raise exception using errcode='P0001',message='self_booking'; end if;
  if not public.booking_actor_eligible(actor) then raise exception using errcode='42501',message='profile_required'; end if;
  if not isfinite(p_pickup) or not isfinite(p_return) or p_return<p_pickup then
    raise exception using errcode='P0001',message='invalid_dates';
  end if;
  days:=p_return-p_pickup+1;
  start_time:=p_pickup::timestamp at time zone 'Asia/Manila';
  if days<1 or days>30 or start_time<at_time+interval '24 hours'
    or p_pickup>(at_time at time zone 'Asia/Manila')::date+90 then
    raise exception using errcode='P0001',message='invalid_dates';
  end if;
  if l.currency<>'PHP' then raise exception using errcode='P0001',message='unsupported_currency'; end if;
  amount:=l.daily_price_amount::bigint*days;
  if amount>2147483647 then raise exception using errcode='P0001',message='price_limit'; end if;
  perform public.expire_listing_booking_holds(l.id,at_time);
  begin
    insert into public.bookings(listing_id,owner_id,renter_id,rental_period,rental_amount,
      deposit_amount,currency,request_key,daily_price_amount,policy_version,request_expires_at,cancellation_terms)
    values(l.id,l.owner_id,actor,daterange(p_pickup,p_return+1,'[)'),amount::integer,
      l.deposit_amount,l.currency,p_request_key,l.daily_price_amount,'demo-booking-v1',
      least(at_time+interval '24 hours',start_time-interval '2 hours'),
      '{"version":"demo-booking-v1","paid_cancellation":"pending","live_payments":false}') returning * into b;
  exception when exclusion_violation then
    raise exception using errcode='P0001',message='duplicate_request';
  end;
  insert into public.audit_log(actor_id,action,target_table,target_id)
    values(actor,'booking.requested','bookings',b.id);
  return jsonb_build_object('booking',public.booking_payload(b),'replayed',false);
end;
$$;

create function public.act_on_booking(p_booking uuid,p_action text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); listing uuid; l public.listings; b public.bookings;
  at_time timestamptz; next_status public.booking_status;
begin
  if not public.booking_actor_eligible(actor) then raise exception using errcode='42501',message='profile_required'; end if;
  if p_action is null or p_action not in ('accept','decline','cancel')
    or (p_action='accept' and p_reason is not null)
    or (p_action<>'accept' and (p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 or p_reason ~ '[[:cntrl:]]')) then
    raise exception using errcode='P0001',message='invalid_action';
  end if;
  select listing_id into listing from public.bookings
    where id=p_booking and actor in (owner_id,renter_id);
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  select * into l from public.listings where id=listing for update;
  at_time:=clock_timestamp();
  perform public.expire_listing_booking_holds(listing,at_time);
  select * into b from public.bookings where id=p_booking for update;
  if not public.booking_actor_eligible(actor) then raise exception using errcode='42501',message='profile_required'; end if;
  if b.request_key is null then raise exception using errcode='P0001',message='legacy_booking'; end if;
  if p_action in ('accept','decline') and actor<>b.owner_id then
    raise exception using errcode='42501',message='forbidden';
  end if;
  next_status:=case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end;
  if b.status=next_status then
    if p_action='accept' or (b.closed_by=actor and b.status_reason=btrim(p_reason)) then
      return public.booking_payload(b);
    end if;
    raise exception using errcode='P0001',message='idempotency_conflict';
  end if;
  if b.status='expired' then raise exception using errcode='P0001',message='booking_expired'; end if;
  if p_action in ('accept','decline') and b.status<>'requested'
    or (p_action='cancel' and (b.status not in ('requested','accepted') or (b.status='requested' and actor<>b.renter_id))) then
    raise exception using errcode='P0001',message='invalid_transition';
  end if;
  if p_action='accept' then
    if l.status<>'published' or not public.booking_actor_eligible(b.renter_id) then
      raise exception using errcode='P0001',message='unavailable_listing';
    end if;
    if public.booking_device_unavailable(listing,at_time) then
      raise exception using errcode='P0001',message='device_unavailable';
    end if;
  end if;
  begin
    update public.bookings set status=next_status,
      accepted_at=case when p_action='accept' then at_time else accepted_at end,
      payment_expires_at=case when p_action='accept' then at_time+interval '30 minutes' else payment_expires_at end,
      closed_by=case when p_action='accept' then null else actor end,
      status_reason=case when p_action='accept' then null else btrim(p_reason) end
    where id=b.id returning * into b;
  exception when exclusion_violation then
    raise exception using errcode='P0001',message='booking_conflict';
  end;
  insert into public.audit_log(actor_id,action,target_table,target_id)
    values(actor,'booking.'||next_status::text,'bookings',b.id);
  return public.booking_payload(b);
end;
$$;

create function public.get_booking(p_booking uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id=p_booking and auth.uid() in (owner_id,renter_id);
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  return public.booking_payload(b);
end;
$$;

create function public.list_my_bookings(p_role text default 'all',p_status public.booking_status default null,
  p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); total bigint; items jsonb;
begin
  if actor is null then raise exception using errcode='42501',message='forbidden'; end if;
  if p_role is null or p_role not in ('all','owner','renter') or p_page is null or p_page_size is null
    or p_page<1 or p_page>10000 or p_page_size<1 or p_page_size>50 then
    raise exception using errcode='P0001',message='invalid_query';
  end if;
  select count(*) into total from public.bookings b
    where ((p_role='all' and actor in (b.owner_id,b.renter_id)) or (p_role='owner' and b.owner_id=actor) or (p_role='renter' and b.renter_id=actor))
    and (p_status is null or b.status=p_status);
  select coalesce(jsonb_agg(public.booking_payload(t::public.bookings) order by t.created_at desc,t.id),'[]') into items
    from (select b.* from public.bookings b
      where ((p_role='all' and actor in (b.owner_id,b.renter_id)) or (p_role='owner' and b.owner_id=actor) or (p_role='renter' and b.renter_id=actor))
      and (p_status is null or b.status=p_status)
      order by b.created_at desc,b.id offset (p_page-1)*p_page_size limit p_page_size) t;
  return jsonb_build_object('data',items,'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total));
end;
$$;

create function public.booking_availability(p_listing uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare at_time timestamptz:=clock_timestamp(); today date; earliest date; blocked boolean; ranges jsonb;
begin
  today:=(at_time at time zone 'Asia/Manila')::date;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_from<today or p_to<p_from or p_to>today+119 then
    raise exception using errcode='P0001',message='invalid_query';
  end if;
  if not exists(select 1 from public.listings l join public.profiles p on p.id=l.owner_id
    where l.id=p_listing and l.status='published' and p.account_status='active'
      and public.booking_actor_eligible(l.owner_id)) then
    raise exception using errcode='P0001',message='not_found';
  end if;
  earliest:=today+1;
  if (earliest::timestamp at time zone 'Asia/Manila')<at_time+interval '24 hours' then earliest:=earliest+1; end if;
  blocked:=public.booking_device_unavailable(p_listing,at_time);
  if blocked then ranges:=jsonb_build_array(jsonb_build_object('from',p_from::text,'to',p_to::text));
  else
    select coalesce(jsonb_agg(jsonb_build_object('from',greatest(lower(b.rental_period),p_from)::text,
      'to',least(upper(b.rental_period)-1,p_to)::text) order by lower(b.rental_period)),'[]') into ranges
    from public.bookings b where b.listing_id=p_listing and b.rental_period && daterange(p_from,p_to+1,'[)')
      and public.booking_reserves_dates(b.status,b.payment_expires_at,at_time);
  end if;
  return jsonb_build_object('listing_id',p_listing,'from',p_from::text,'to',p_to::text,'timezone','Asia/Manila',
    'earliest_pickup_date',earliest::text,'latest_pickup_date',(today+90)::text,'max_rental_days',30,
    'device_available',not blocked,'blocked_ranges',ranges);
end;
$$;

-- Definer helpers are not client RPCs. Only validated entry points are exposed.
revoke all on function public.booking_actor_eligible(uuid),
  public.booking_reserves_dates(public.booking_status,timestamptz,timestamptz),
  public.booking_device_unavailable(uuid,timestamptz),public.booking_payload(public.bookings),
  public.expire_listing_booking_holds(uuid,timestamptz),public.expire_booking_holds(integer),
  public.request_booking(uuid,date,date,uuid),public.act_on_booking(uuid,text,text),
  public.get_booking(uuid),public.list_my_bookings(text,public.booking_status,integer,integer),
  public.booking_availability(uuid,date,date) from public,anon,authenticated,service_role;
grant execute on function public.request_booking(uuid,date,date,uuid),public.act_on_booking(uuid,text,text),
  public.get_booking(uuid),public.list_my_bookings(text,public.booking_status,integer,integer) to authenticated;
grant execute on function public.booking_availability(uuid,date,date) to anon,authenticated,service_role;
grant execute on function public.expire_booking_holds(integer) to service_role;

-- Runs even when the Next.js app is offline; no HTTP credentials are stored.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('rentify-booking-expiry','* * * * *','select public.expire_booking_holds(100);');

commit;
