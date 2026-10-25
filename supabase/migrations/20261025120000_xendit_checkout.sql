-- Xendit test checkout. Preserve PayMongo history and isolate worker dispatch.
begin;
alter table public.checkout_attempts add column provider text not null default 'paymongo' check (provider in ('paymongo','xendit'));
alter table public.checkout_attempts drop constraint checkout_attempts_session_id_check;
alter table public.checkout_attempts drop constraint checkout_attempts_candidate_session_id_check;
alter table public.checkout_attempts drop constraint checkout_attempts_checkout_url_check;
alter table public.checkout_attempts add constraint checkout_attempts_session_id_check check (
  (provider='paymongo' and session_id ~ '^cs_[A-Za-z0-9]+$') or (provider='xendit' and session_id ~ '^ps-[a-f0-9]{24}$'));
alter table public.checkout_attempts add constraint checkout_attempts_candidate_session_id_check check (
  (provider='paymongo' and candidate_session_id ~ '^cs_[A-Za-z0-9]+$') or (provider='xendit' and candidate_session_id ~ '^ps-[a-f0-9]{24}$'));
alter table public.checkout_attempts add constraint checkout_attempts_checkout_url_check check (
  (provider='paymongo' and checkout_url ~ '^https://checkout[.]paymongo[.]com/') or
  (provider='xendit' and checkout_url ~ '^https://(dev[.]xen[.]to/[A-Za-z0-9_-]+|checkout-staging[.]xendit[.]co/sessions/ps-[a-f0-9]{24})$'));
alter table public.payment_receipts drop constraint payment_receipts_payment_id_check;
alter table public.payment_receipts add constraint payment_receipts_payment_id_check check (payment_id ~ '^(pay_[A-Za-z0-9]+|py-[a-f0-9-]{36})$');
alter table public.payment_events drop constraint payment_events_event_id_check;
alter table public.payment_events drop constraint payment_events_session_id_check;
alter table public.payment_events add constraint payment_events_event_id_check check (event_id ~ '^(evt_[A-Za-z0-9]+|xevt_[a-f0-9]{64})$');
alter table public.payment_events add constraint payment_events_session_id_check check (session_id ~ '^(cs_[A-Za-z0-9]+|ps-[a-f0-9]{24})$');
alter table public.refund_attempts drop constraint refund_attempts_provider_refund_id_check;
alter table public.refund_attempts add constraint refund_attempts_provider_refund_id_check check (provider_refund_id ~ '^(ref_[A-Za-z0-9]+|rfd-[a-f0-9-]{36})$');


create or replace function public.prepare_checkout(p_booking uuid,p_policy text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); listing uuid; b public.bookings; a public.checkout_attempts; l public.listings; at_time timestamptz;
begin
  if not public.booking_actor_eligible(actor) then raise exception using errcode='42501',message='profile_required'; end if;
  if p_policy is distinct from 'demo-payments-v1' then raise exception using errcode='P0001',message='payment_consent'; end if;
  select listing_id into listing from public.bookings where id=p_booking and renter_id=actor;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  select * into l from public.listings where id=listing for update;
  at_time:=clock_timestamp();
  perform public.expire_listing_booking_holds(listing,at_time);
  select * into b from public.bookings where id=p_booking for update;
  if b.status<>'accepted' or b.payment_expires_at is null or b.payment_expires_at<=at_time then
    raise exception using errcode='P0001',message='payment_closed';
  end if;
  if b.request_key is null or b.policy_version<>'demo-booking-v1' then raise exception using errcode='P0001',message='legacy_booking'; end if;
  if not public.booking_actor_eligible(actor) or not public.booking_actor_eligible(b.owner_id)
    or l.status<>'published' or public.booking_device_unavailable(listing,at_time) then
    raise exception using errcode='P0001',message='unavailable_listing';
  end if;
  if b.currency<>'PHP' or b.rental_amount::bigint+b.deposit_amount::bigint>2147483647
    or b.rental_amount::bigint+b.deposit_amount::bigint>10000000
    or b.rental_amount::bigint+b.deposit_amount::bigint<100 or b.deposit_amount between 1 and 99 then
    raise exception using errcode='P0001',message='payment_amount';
  end if;
  insert into public.checkout_attempts(booking_id,renter_id,rental_amount,deposit_amount,policy_version,provider)
    values(b.id,actor,b.rental_amount,b.deposit_amount,p_policy,'xendit') on conflict(booking_id) do nothing returning * into a;
  if found then
    insert into public.audit_log(actor_id,action,target_table,target_id) values(actor,'payment.consent','checkout_attempts',a.id);
  else select * into a from public.checkout_attempts where booking_id=b.id; end if;
  if a.provider<>'xendit' then raise exception using errcode='P0001',message='legacy_booking'; end if;
  return public.checkout_payload(a);
end;
$$;

create or replace function public.claim_payment_work(p_attempt uuid default null,p_limit integer default 10)
returns setof public.checkout_attempts language plpgsql security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception using errcode='P0001',message='invalid_query'; end if;
  return query with due as (
    select a.id from public.checkout_attempts a where a.provider='xendit' and (p_attempt is null or a.id=p_attempt)
      and a.next_check_at<=clock_timestamp() and (a.lease_until is null or a.lease_until<=clock_timestamp())
    order by a.next_check_at,a.id limit p_limit for update skip locked
  ) update public.checkout_attempts a set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
    from due where a.id=due.id returning a.*;
end;
$$;

create or replace function public.enqueue_payment_event(p_event text,p_session text,p_reference uuid,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.checkout_attempts; existing public.payment_events; result_state text;
begin
  if p_event !~ '^xevt_[a-f0-9]{64}$' or p_session !~ '^ps-[a-f0-9]{24}$' then
    raise exception using errcode='P0001',message='provider_invalid'; end if;
  -- Event receipt never locks a booking; it only schedules a provider read.
  select * into a from public.checkout_attempts where provider='xendit' and (session_id=p_session or id=p_reference) order by (session_id=p_session) desc nulls last limit 1;
  result_state:=case when a.id is not null and (a.session_id is null or a.session_id=p_session) then 'queued' else 'review' end;
  insert into public.payment_events(event_id,session_id,attempt_id,body_hash,state)
    values(p_event,p_session,a.id,p_hash,result_state) on conflict(event_id) do nothing;
  if not found then
    select * into existing from public.payment_events where event_id=p_event;
    if existing.body_hash<>p_hash or existing.session_id<>p_session then raise exception using errcode='P0001',message='event_conflict'; end if;
    return false;
  end if;
  if result_state='queued' then
    update public.checkout_attempts set candidate_session_id=coalesce(candidate_session_id,p_session),next_check_at=clock_timestamp() where id=a.id;
  end if;
  return true;
end;
$$;

create or replace function public.sync_checkout(p_attempt uuid,p_lease uuid,p_snapshot jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare a public.checkout_attempts; b public.bookings; l public.listings; listing uuid;
  at_time timestamptz; item jsonb; receipt uuid; outcome text; why text; paid_time timestamptz; existing public.payment_receipts;
begin
  select bk.listing_id into listing from public.checkout_attempts ca join public.bookings bk on bk.id=ca.booking_id where ca.id=p_attempt;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  select * into l from public.listings where id=listing for update;
  at_time:=clock_timestamp();
  perform public.expire_listing_booking_holds(listing,at_time);
  select bk.* into b from public.bookings bk join public.checkout_attempts ca on ca.booking_id=bk.id where ca.id=p_attempt for update of bk;
  select * into a from public.checkout_attempts where id=p_attempt for update;
  if p_lease is null or a.lease_token is distinct from p_lease or a.lease_until<=at_time then raise exception using errcode='P0001',message='payment_lease'; end if;
  if jsonb_typeof(p_snapshot)<>'object' or (p_snapshot->>'livemode') is distinct from 'false'
    or (p_snapshot->>'reference') is distinct from a.id::text or coalesce((p_snapshot->>'session_id') !~ case when a.provider='xendit' then '^ps-[a-f0-9]{24}$' else '^cs_[A-Za-z0-9]+$' end,true)
    or coalesce((p_snapshot->>'status') not in ('active','expired'),true) or jsonb_typeof(p_snapshot->'payments') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'payments')>1 then raise exception using errcode='P0001',message='provider_invalid'; end if;
  if a.session_id is not null and a.session_id<>p_snapshot->>'session_id' then raise exception using errcode='P0001',message='provider_invalid'; end if;
  if a.candidate_session_id is not null and a.candidate_session_id<>p_snapshot->>'session_id' then raise exception using errcode='P0001',message='provider_invalid'; end if;
  update public.checkout_attempts set session_id=p_snapshot->>'session_id',checkout_url=p_snapshot->>'checkout_url' where id=a.id;
  for item in select value from jsonb_array_elements(p_snapshot->'payments') loop
    if coalesce((item->>'id') !~ case when a.provider='xendit' then '^py-[a-f0-9-]{36}$' else '^pay_[A-Za-z0-9]+$' end,true) or coalesce((item->>'amount')::bigint<=0,true)
      or coalesce((item->>'currency') !~ '^[A-Z]{3}$',true) or item->>'method' is null or item->>'paid_at' is null then raise exception using errcode='P0001',message='provider_invalid'; end if;
    paid_time:=(item->>'paid_at')::timestamptz;
    select * into existing from public.payment_receipts where payment_id=item->>'id';
    if found then
      if existing.attempt_id<>a.id or existing.amount<>(item->>'amount')::bigint or existing.currency<>item->>'currency' then
        raise exception using errcode='P0001',message='provider_invalid';
      end if;
      continue;
    end if;
    outcome:='refund_due'; why:='reservation_closed';
    if (item->>'amount')::bigint<>a.total_amount or item->>'currency'<>'PHP' or item->>'method'<>'gcash'
      or paid_time<a.created_at-interval '5 minutes' or paid_time>at_time+interval '5 minutes' then
      outcome:='review'; why:='provider_mismatch';
    elsif b.status='accepted' and b.payment_expires_at>at_time and paid_time<b.payment_expires_at
      and l.status='published' and public.booking_actor_eligible(b.owner_id) and public.booking_actor_eligible(b.renter_id)
      and not public.booking_device_unavailable(listing,at_time)
      and not exists(select 1 from public.payment_receipts r where r.attempt_id=a.id and r.disposition='applied') then
      outcome:='applied'; why:='reservation_paid';
      update public.bookings set status='paid' where id=b.id returning * into b;
    end if;
    insert into public.payment_receipts(attempt_id,payment_id,amount,currency,method,paid_at,disposition,reason)
      values(a.id,item->>'id',(item->>'amount')::bigint,item->>'currency',item->>'method',paid_time,outcome,why) returning id into receipt;
    if outcome<>'review' then
      insert into public.payments(booking_id,type,amount,currency,status,gateway,gateway_reference,checkout_receipt_id)
        values(b.id,'rental',a.rental_amount,'PHP','succeeded',a.provider||'_test',item->>'id',receipt);
      if a.deposit_amount>0 then
        insert into public.payments(booking_id,type,amount,currency,status,gateway,gateway_reference,checkout_receipt_id)
          values(b.id,'deposit',a.deposit_amount,'PHP','succeeded',a.provider||'_test',item->>'id',receipt);
      end if;
    end if;
    insert into public.audit_log(action,target_table,target_id,details)
      values('payment.'||outcome,'payment_receipts',receipt,jsonb_build_object('attempt_id',a.id,'booking_id',b.id));
  end loop;
  select case when exists(select 1 from public.payment_receipts r where r.attempt_id=a.id and r.disposition='review') then 'review'
    when exists(select 1 from public.payment_receipts r where r.attempt_id=a.id and r.disposition='refund_due') then 'refund_due'
    when exists(select 1 from public.payment_receipts r where r.attempt_id=a.id and r.disposition='applied') then 'paid'
    when p_snapshot->>'status'='expired' then 'expired' else 'open' end into outcome;
  update public.checkout_attempts set state=outcome,last_error_code=null,
    next_check_at=case when outcome='open' then at_time+interval '1 minute' else null end,
    lease_token=null,lease_until=null where id=a.id;
  update public.payment_events set state='processed' where attempt_id=a.id and session_id=p_snapshot->>'session_id' and state='queued';
  return outcome;
end;
$$;

create or replace function public.claim_refund_work(p_refund uuid default null)
returns table(id uuid,receipt_id uuid,amount integer,lease_token uuid,provider_refund_id text,creation_started_at timestamptz,payment_id text,paid_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  return query with due as (
    select f.id from public.refund_attempts f join public.payment_receipts r on r.id=f.receipt_id join public.checkout_attempts a on a.id=r.attempt_id where a.provider='xendit' and (p_refund is null or f.id=p_refund) and f.next_check_at<=clock_timestamp()
      and (f.lease_until is null or f.lease_until<=clock_timestamp())
      order by f.next_check_at,f.id limit 1 for update of f skip locked
  ), claimed as (
    update public.refund_attempts f set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
      from due where f.id=due.id returning f.*
  ) select f.id,f.receipt_id,f.amount,f.lease_token,f.provider_refund_id,f.creation_started_at,r.payment_id,r.paid_at
      from claimed f join public.payment_receipts r on r.id=f.receipt_id;
end;
$$;

create or replace function public.sync_refund(p_refund uuid,p_lease uuid,p_snapshot jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare receipt uuid; f public.refund_attempts; r public.payment_receipts; outcome text;
begin
  select receipt_id into receipt from public.refund_attempts where id=p_refund;
  select * into r from public.payment_receipts where id=receipt for update;
  select * into f from public.refund_attempts where id=p_refund for update;
  if p_lease is null or f.id is null or f.lease_token is distinct from p_lease or f.lease_until<=clock_timestamp() then
    raise exception using errcode='P0001',message='refund_lease'; end if;
  outcome:=p_snapshot->>'status';
  if jsonb_typeof(p_snapshot) is distinct from 'object' or (p_snapshot->>'livemode') is distinct from 'false'
    or (p_snapshot->>'reference') is distinct from f.id::text or (p_snapshot->>'payment_id') is distinct from r.payment_id
    or (p_snapshot->>'currency') is distinct from 'PHP' or (p_snapshot->>'amount')::bigint is distinct from f.amount::bigint
    or coalesce((p_snapshot->>'id') !~ case when (select provider from public.checkout_attempts where id=r.attempt_id)='xendit' then '^rfd-[a-f0-9-]{36}$' else '^ref_[A-Za-z0-9]+$' end,true)
    or coalesce(outcome not in ('pending','processing','succeeded','failed'),true)
    or f.creation_started_at is null or f.state in ('succeeded','failed')
    or (f.provider_refund_id is not null and f.provider_refund_id<>p_snapshot->>'id')
    or (f.state='processing' and outcome='pending') then raise exception using errcode='P0001',message='provider_invalid'; end if;
  update public.refund_attempts set state=outcome,provider_refund_id=p_snapshot->>'id',last_error_code=null,
    next_check_at=case when outcome in ('pending','processing') then clock_timestamp()+interval '1 minute' else null end,
    lease_token=null,lease_until=null where id=f.id;
  if outcome<>f.state then
    insert into public.audit_log(action,target_table,target_id,details)
      values('refund.'||outcome,'refund_attempts',f.id,jsonb_build_object('receipt_id',r.id));
  end if;
  if outcome='failed' then perform public.queue_receipt_refund(r.id); end if;
  return outcome;
end;
$$;

commit;
