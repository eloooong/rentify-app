-- B2.4: test-only full-refund obligations, fenced workers and paid cancellation.
begin;

create table public.refund_attempts (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.payment_receipts(id) on delete restrict,
  amount integer not null check (amount between 100 and 2147483647),
  generation integer not null check (generation between 1 and 3),
  state text not null default 'queued' check (state in ('queued','submitting','pending','processing','succeeded','failed','review')),
  provider_refund_id text unique check (provider_refund_id ~ '^ref_[A-Za-z0-9]+$'),
  creation_started_at timestamptz,
  next_check_at timestamptz default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(receipt_id,generation)
);
create unique index refund_one_unresolved on public.refund_attempts(receipt_id)
  where state in ('queued','submitting','pending','processing','review');
create index refund_work_due on public.refund_attempts(next_check_at) where next_check_at is not null;
alter table public.refund_attempts enable row level security;
revoke all on public.refund_attempts from public,anon,authenticated,service_role;
grant select on public.refund_attempts to service_role;
create trigger refund_attempts_updated before update on public.refund_attempts for each row execute function public.touch_updated_at();

-- All ledger writers lock the receipt before its refund rows. Unknown and review
-- outcomes reserve their full amount, just like pending or succeeded refunds.
create function public.queue_receipt_refund(p_receipt uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.payment_receipts; remaining bigint; generation integer;
begin
  select * into r from public.payment_receipts where id=p_receipt for update;
  if not found or r.disposition<>'refund_due' or r.currency<>'PHP' or r.method<>'gcash' then return; end if;
  if exists(select 1 from public.refund_attempts f where f.receipt_id=r.id and f.state in ('queued','submitting','pending','processing','review')) then return; end if;
  select r.amount-coalesce(sum(f.amount) filter(where f.state<>'failed'),0),coalesce(max(f.generation),0)+1
    into remaining,generation from public.refund_attempts f where f.receipt_id=r.id;
  if remaining<100 or remaining>2147483647 or generation>3 then return; end if;
  insert into public.refund_attempts(receipt_id,amount,generation,state,next_check_at,last_error_code)
    values(r.id,remaining::integer,generation,
      case when r.paid_at+interval '180 days'<=clock_timestamp() then 'review' else 'queued' end,
      case when r.paid_at+interval '180 days'<=clock_timestamp() then null
        when generation>1 then clock_timestamp()+interval '1 minute' else clock_timestamp() end,
      case when r.paid_at+interval '180 days'<=clock_timestamp() then 'refund_window' else null end);
end;
$$;
create function public.schedule_receipt_refund()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.disposition='refund_due' then perform public.queue_receipt_refund(new.id); end if;
  return new;
end;
$$;
create trigger receipt_refund_schedule after insert or update of disposition on public.payment_receipts
  for each row execute function public.schedule_receipt_refund();

create function public.paid_cancellation_allowed(b public.bookings,actor uuid,at_time timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select b.status='paid' and actor in (b.owner_id,b.renter_id) and public.booking_actor_eligible(actor)
    and b.request_key is not null and b.policy_version='demo-booking-v1'
    and at_time<(lower(b.rental_period)::timestamp at time zone 'Asia/Manila')
    and exists(select 1 from public.checkout_attempts a join public.payment_receipts r on r.attempt_id=a.id
      where a.booking_id=b.id and a.policy_version='demo-payments-v1' and r.disposition='applied'
        and r.currency='PHP' and r.method='gcash' and r.amount=a.total_amount);
$$;
create function public.refund_payload(b public.bookings)
returns jsonb language sql stable security definer set search_path='' as $$
  with receipts as (
    select r.* from public.payment_receipts r join public.checkout_attempts a on a.id=r.attempt_id
      where a.booking_id=b.id and r.disposition='refund_due'
  ), refunds as (select f.* from public.refund_attempts f join receipts r on r.id=f.receipt_id),
  totals as (select coalesce(sum(r.amount),0) as owed from receipts r),
  settled as (select coalesce(sum(f.amount) filter(where f.state='succeeded'),0) as refunded,
    coalesce(sum(f.amount) filter(where f.state not in ('succeeded','failed')),0) as pending from refunds f)
  select jsonb_build_object('booking_id',b.id,'currency','PHP','test_mode',true,
    'can_cancel_paid',public.paid_cancellation_allowed(b,auth.uid(),statement_timestamp()),
    'refund_due_amount',totals.owed-settled.refunded,'refund_pending_amount',settled.pending,
    'refunded_amount',settled.refunded,
    'review_required',exists(select 1 from refunds f where f.state='review') or exists(
      select 1 from receipts r where r.amount>(select coalesce(sum(f.amount),0) from refunds f where f.receipt_id=r.id and f.state='succeeded')
        and not exists(select 1 from refunds f where f.receipt_id=r.id and f.state not in ('failed','succeeded'))),
    'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'amount',f.amount,'state',f.state,
      'created_at',f.created_at,'updated_at',f.updated_at) order by f.created_at,f.id) from refunds f),'[]'::jsonb))
  from totals,settled;
$$;
create function public.get_booking_refunds(p_booking uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id=p_booking and auth.uid() in (owner_id,renter_id);
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  return public.refund_payload(b);
end;
$$;
create function public.cancel_paid_booking(p_booking uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); listing uuid; b public.bookings; a public.checkout_attempts; at_time timestamptz;
begin
  if not public.booking_actor_eligible(actor) then raise exception using errcode='42501',message='profile_required'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 or p_reason ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='invalid_action'; end if;
  select listing_id into listing from public.bookings where id=p_booking and actor in (owner_id,renter_id);
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  perform 1 from public.listings where id=listing for update;
  select * into b from public.bookings where id=p_booking for update;
  select * into a from public.checkout_attempts where booking_id=b.id for update;
  at_time:=clock_timestamp();
  -- A retry is read-only, even after the pickup cutoff. Other actors/reasons conflict.
  if b.status='cancelled' and exists(select 1 from public.payment_receipts r where r.attempt_id=a.id and r.reason='paid_cancellation') then
    if b.closed_by is distinct from actor or b.status_reason is distinct from btrim(p_reason) then
      raise exception using errcode='P0001',message='idempotency_conflict'; end if;
  else
    if not public.paid_cancellation_allowed(b,actor,at_time) then
      raise exception using errcode='P0001',message='paid_cancellation_closed'; end if;
    update public.bookings set status='cancelled',closed_by=actor,status_reason=btrim(p_reason) where id=b.id returning * into b;
    -- The receipt trigger creates the refund reservation in this same transaction.
    update public.payment_receipts set disposition='refund_due',reason='paid_cancellation' where attempt_id=a.id and disposition='applied';
    update public.checkout_attempts set state='refund_due',next_check_at=null where id=a.id;
    insert into public.audit_log(actor_id,action,target_table,target_id) values(actor,'booking.paid_cancelled','bookings',b.id);
  end if;
  return jsonb_build_object('booking',public.booking_payload(b),'refunds',public.refund_payload(b));
end;
$$;

create function public.claim_refund_work(p_refund uuid default null)
returns table(id uuid,receipt_id uuid,amount integer,lease_token uuid,provider_refund_id text,creation_started_at timestamptz,payment_id text,paid_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  return query with due as (
    select f.id from public.refund_attempts f where (p_refund is null or f.id=p_refund) and f.next_check_at<=clock_timestamp()
      and (f.lease_until is null or f.lease_until<=clock_timestamp())
      order by f.next_check_at,f.id limit 1 for update skip locked
  ), claimed as (
    update public.refund_attempts f set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
      from due where f.id=due.id returning f.*
  ) select f.id,f.receipt_id,f.amount,f.lease_token,f.provider_refund_id,f.creation_started_at,r.payment_id,r.paid_at
      from claimed f join public.payment_receipts r on r.id=f.receipt_id;
end;
$$;
create function public.start_refund_creation(p_refund uuid,p_lease uuid)
returns void language plpgsql security definer set search_path='' as $$
declare receipt uuid; f public.refund_attempts; r public.payment_receipts;
begin
  select receipt_id into receipt from public.refund_attempts where id=p_refund;
  select * into r from public.payment_receipts where id=receipt for update;
  select * into f from public.refund_attempts where id=p_refund for update;
  if p_lease is null or f.id is null or f.lease_token is distinct from p_lease or f.lease_until<=clock_timestamp()
    or f.state<>'queued' or f.creation_started_at is not null then raise exception using errcode='P0001',message='refund_lease'; end if;
  if r.disposition<>'refund_due' or r.currency<>'PHP' or r.method<>'gcash'
    or r.paid_at+interval '180 days'<=clock_timestamp()
    or (select coalesce(sum(amount),0) from public.refund_attempts where receipt_id=r.id and state<>'failed')>r.amount then
    raise exception using errcode='P0001',message='refund_review'; end if;
  update public.refund_attempts set state='submitting',creation_started_at=clock_timestamp() where id=f.id;
end;
$$;
create function public.sync_refund(p_refund uuid,p_lease uuid,p_snapshot jsonb)
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
    or coalesce((p_snapshot->>'id') !~ '^ref_[A-Za-z0-9]+$',true)
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
create function public.fail_refund_work(p_refund uuid,p_lease uuid,p_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_code is null or p_code not in ('provider_unavailable','provider_invalid','refund_unknown','refund_review') then
    raise exception using errcode='P0001',message='invalid_query'; end if;
  update public.refund_attempts set last_error_code=p_code,
    state=case when p_code in ('refund_unknown','refund_review','provider_invalid') then 'review' else state end,
    next_check_at=case when p_code in ('refund_review','provider_invalid') then null else clock_timestamp()+interval '1 minute' end,
    lease_token=null,lease_until=null where id=p_refund and lease_token=p_lease and lease_until>clock_timestamp();
  if not found then raise exception using errcode='P0001',message='refund_lease'; end if;
end;
$$;

-- Preserve the checkout DTO, with outstanding obligations reduced only by success.
create or replace function public.checkout_payload(a public.checkout_attempts)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'booking_id',a.booking_id,'state',a.state,
    'rental_amount',a.rental_amount,'deposit_amount',a.deposit_amount,'total_amount',a.total_amount,
    'currency','PHP','method','gcash','test_mode',true,'policy_version',a.policy_version,
    'expires_at',b.payment_expires_at,'consented_at',a.consented_at,
    'checkout_url',case when auth.uid()=a.renter_id and a.state='open' and public.checkout_can_pay(b.id) then a.checkout_url else null end,
    'refund_due_amount',(select coalesce(sum(r.amount-(select coalesce(sum(f.amount),0) from public.refund_attempts f
      where f.receipt_id=r.id and f.state='succeeded')),0) from public.payment_receipts r where r.attempt_id=a.id and r.disposition='refund_due'))
  from public.bookings b where b.id=a.booking_id;
$$;

revoke all on function public.queue_receipt_refund(uuid),public.schedule_receipt_refund(),
  public.paid_cancellation_allowed(public.bookings,uuid,timestamptz),public.refund_payload(public.bookings),
  public.get_booking_refunds(uuid),public.cancel_paid_booking(uuid,text),public.claim_refund_work(uuid),
  public.start_refund_creation(uuid,uuid),public.sync_refund(uuid,uuid,jsonb),public.fail_refund_work(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_booking_refunds(uuid),public.cancel_paid_booking(uuid,text) to authenticated;
grant execute on function public.claim_refund_work(uuid),public.start_refund_creation(uuid,uuid),
  public.sync_refund(uuid,uuid,jsonb),public.fail_refund_work(uuid,uuid,text) to service_role;

-- Backfill only durable B2.3 obligations; never infer a refund from rental dates.
do $$ declare receipt uuid; begin
  for receipt in select id from public.payment_receipts where disposition='refund_due' order by id loop
    perform public.queue_receipt_refund(receipt);
  end loop;
end $$;
commit;
