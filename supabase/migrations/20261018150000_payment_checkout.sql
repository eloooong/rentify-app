-- B2.3 test-only checkout. No client-controlled payment success or refund writes.
begin;

create table public.checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  renter_id uuid not null references public.profiles(id) on delete restrict,
  rental_amount integer not null check (rental_amount > 0),
  deposit_amount integer not null check (deposit_amount >= 0),
  total_amount bigint generated always as (rental_amount::bigint+deposit_amount::bigint) stored,
  policy_version text not null check (policy_version='demo-payments-v1'),
  consented_at timestamptz not null default clock_timestamp(),
  state text not null default 'creating' check (state in ('creating','open','paid','expired','refund_due','review')),
  session_id text unique check (session_id ~ '^cs_[A-Za-z0-9]+$'),
  candidate_session_id text check (candidate_session_id ~ '^cs_[A-Za-z0-9]+$'),
  checkout_url text check (checkout_url ~ '^https://checkout[.]paymongo[.]com/'),
  creation_started_at timestamptz,
  next_check_at timestamptz default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.checkout_attempts(id) on delete restrict,
  payment_id text not null unique check (payment_id ~ '^pay_[A-Za-z0-9]+$'),
  amount bigint not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method text not null,
  paid_at timestamptz not null,
  disposition text not null check (disposition in ('applied','refund_due','review')),
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);
create unique index payment_one_applied_receipt on public.payment_receipts(attempt_id) where disposition='applied';
create table public.payment_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  session_id text not null check (session_id ~ '^cs_[A-Za-z0-9]+$'),
  attempt_id uuid references public.checkout_attempts(id) on delete restrict,
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('queued','processed','review')),
  received_at timestamptz not null default clock_timestamp()
);
alter table public.payments add column checkout_receipt_id uuid references public.payment_receipts(id) on delete restrict;
create unique index payments_receipt_allocation on public.payments(checkout_receipt_id,type) where checkout_receipt_id is not null;
create index checkout_work_due on public.checkout_attempts(next_check_at) where next_check_at is not null;
create index payment_receipts_attempt on public.payment_receipts(attempt_id);
create index payment_events_attempt on public.payment_events(attempt_id);
alter table public.checkout_attempts enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.checkout_attempts,public.payment_receipts,public.payment_events from public,anon,authenticated,service_role;
grant select on public.checkout_attempts,public.payment_receipts,public.payment_events to service_role;
create trigger checkout_attempts_updated before update on public.checkout_attempts for each row execute function public.touch_updated_at();

create function public.checkout_payload(a public.checkout_attempts)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'booking_id',a.booking_id,'state',a.state,
    'rental_amount',a.rental_amount,'deposit_amount',a.deposit_amount,'total_amount',a.total_amount,
    'currency','PHP','method','gcash','test_mode',true,'policy_version',a.policy_version,
    'expires_at',b.payment_expires_at,'consented_at',a.consented_at,
    'checkout_url',case when auth.uid()=a.renter_id and a.state='open'
      and b.status='accepted' and b.payment_expires_at>statement_timestamp()
      and public.booking_actor_eligible(auth.uid()) then a.checkout_url else null end,
    'refund_due_amount',(select coalesce(sum(r.amount),0) from public.payment_receipts r where r.attempt_id=a.id and r.disposition='refund_due'))
  from public.bookings b where b.id=a.booking_id;
$$;

create function public.prepare_checkout(p_booking uuid,p_policy text)
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
    or b.rental_amount::bigint+b.deposit_amount::bigint<100 or b.deposit_amount between 1 and 99 then
    raise exception using errcode='P0001',message='payment_amount';
  end if;
  insert into public.checkout_attempts(booking_id,renter_id,rental_amount,deposit_amount,policy_version)
    values(b.id,actor,b.rental_amount,b.deposit_amount,p_policy) on conflict(booking_id) do nothing returning * into a;
  if found then
    insert into public.audit_log(actor_id,action,target_table,target_id) values(actor,'payment.consent','checkout_attempts',a.id);
  else select * into a from public.checkout_attempts where booking_id=b.id; end if;
  return public.checkout_payload(a);
end;
$$;

create function public.get_checkout(p_booking uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.checkout_attempts;
begin
  if not exists(select 1 from public.bookings b where b.id=p_booking and auth.uid() in (b.owner_id,b.renter_id)) then
    raise exception using errcode='P0001',message='not_found';
  end if;
  select * into a from public.checkout_attempts where booking_id=p_booking;
  if not found then return null; end if;
  return public.checkout_payload(a);
end;
$$;

-- Pure scheduling trigger: every booking cancellation/expiry durably wakes its checkout.
create function public.schedule_booking_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status in ('cancelled','expired') then
    update public.checkout_attempts set next_check_at=clock_timestamp() where booking_id=new.id
      and state in ('creating','open','review');
  end if;
  return new;
end;
$$;
create trigger booking_payment_schedule after update of status on public.bookings for each row execute function public.schedule_booking_payment();

create function public.claim_payment_work(p_attempt uuid default null,p_limit integer default 10)
returns setof public.checkout_attempts language plpgsql security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception using errcode='P0001',message='invalid_query'; end if;
  return query with due as (
    select a.id from public.checkout_attempts a where (p_attempt is null or a.id=p_attempt)
      and a.next_check_at<=clock_timestamp() and (a.lease_until is null or a.lease_until<=clock_timestamp())
    order by a.next_check_at,a.id limit p_limit for update skip locked
  ) update public.checkout_attempts a set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
    from due where a.id=due.id returning a.*;
end;
$$;

create function public.enqueue_payment_event(p_event text,p_session text,p_reference uuid,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.checkout_attempts; existing public.payment_events; result_state text;
begin
  -- Event receipt never locks a booking; it only schedules a provider read.
  select * into a from public.checkout_attempts where session_id=p_session or id=p_reference order by (session_id=p_session) desc nulls last limit 1;
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

-- This boundary accepts only authenticated server-side provider reads, never browser payloads.
create function public.sync_checkout(p_attempt uuid,p_lease uuid,p_snapshot jsonb)
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
    or (p_snapshot->>'reference') is distinct from a.id::text or coalesce((p_snapshot->>'session_id') !~ '^cs_[A-Za-z0-9]+$',true)
    or coalesce((p_snapshot->>'status') not in ('active','expired'),true) or jsonb_typeof(p_snapshot->'payments') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'payments')>1 then raise exception using errcode='P0001',message='provider_invalid'; end if;
  if a.session_id is not null and a.session_id<>p_snapshot->>'session_id' then raise exception using errcode='P0001',message='provider_invalid'; end if;
  if a.candidate_session_id is not null and a.candidate_session_id<>p_snapshot->>'session_id' then raise exception using errcode='P0001',message='provider_invalid'; end if;
  update public.checkout_attempts set session_id=p_snapshot->>'session_id',checkout_url=p_snapshot->>'checkout_url' where id=a.id;
  for item in select value from jsonb_array_elements(p_snapshot->'payments') loop
    if coalesce((item->>'id') !~ '^pay_[A-Za-z0-9]+$',true) or coalesce((item->>'amount')::bigint<=0,true)
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
        values(b.id,'rental',a.rental_amount,'PHP','succeeded','paymongo_test',item->>'id',receipt);
      if a.deposit_amount>0 then
        insert into public.payments(booking_id,type,amount,currency,status,gateway,gateway_reference,checkout_receipt_id)
          values(b.id,'deposit',a.deposit_amount,'PHP','succeeded','paymongo_test',item->>'id',receipt);
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

create function public.fail_payment_work(p_attempt uuid,p_lease uuid,p_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_code not in ('provider_unavailable','provider_invalid','creation_unknown','no_session') then raise exception using errcode='P0001',message='invalid_query'; end if;
  update public.checkout_attempts set last_error_code=p_code,
    state=case when p_code='creation_unknown' then 'review' when p_code='no_session' and creation_started_at is null and session_id is null then 'expired' else state end,
    next_check_at=case when p_code in ('creation_unknown','no_session') then null else clock_timestamp()+interval '1 minute' end,
    lease_token=null,lease_until=null where id=p_attempt and lease_token=p_lease;
end;
$$;

create function public.start_checkout_creation(p_attempt uuid,p_lease uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.checkout_attempts set creation_started_at=coalesce(creation_started_at,clock_timestamp())
    where id=p_attempt and lease_token=p_lease and lease_until>clock_timestamp() and session_id is null and candidate_session_id is null;
  if not found then raise exception using errcode='P0001',message='payment_lease'; end if;
end;
$$;

revoke all on function public.checkout_payload(public.checkout_attempts),public.prepare_checkout(uuid,text),public.get_checkout(uuid),
  public.schedule_booking_payment(),public.claim_payment_work(uuid,integer),public.enqueue_payment_event(text,text,uuid,text),
  public.sync_checkout(uuid,uuid,jsonb),public.fail_payment_work(uuid,uuid,text),public.start_checkout_creation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_checkout(uuid,text),public.get_checkout(uuid) to authenticated;
grant execute on function public.claim_payment_work(uuid,integer),public.enqueue_payment_event(text,text,uuid,text),
  public.sync_checkout(uuid,uuid,jsonb),public.fail_payment_work(uuid,uuid,text),public.start_checkout_creation(uuid,uuid) to service_role;
commit;
