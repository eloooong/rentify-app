-- Make PL/pgSQL conversions explicit for strict database lint.
-- Preserve the applied command migration and existing function grants.
begin;

create or replace function public.booking_payload(b public.bookings)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  at_time timestamptz := clock_timestamp();
  actions text[] := array[]::text[];
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

create or replace function public.act_on_booking(p_booking uuid,p_action text,p_reason text default null)
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
  next_status:=(case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end)::public.booking_status;
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

commit;
