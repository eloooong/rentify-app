begin;

create table public.booking_email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  template text not null check (template in (
    'booking_requested_v1', 'booking_accepted_v1', 'booking_paid_v1',
    'booking_cancelled_v1', 'booking_pickup_reminder_v1', 'booking_return_reminder_v1'
  )),
  event_key text not null unique,
  state text not null default 'queued' check (state in ('queued','leased','captured','skipped','failed','needs_review')),
  due_at timestamptz not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_token uuid,
  lease_until timestamptz,
  capture_id text,
  check ((state = 'leased') = (lease_token is not null and lease_until is not null))
);
create index booking_email_due on public.booking_email_outbox(due_at, id) where state = 'queued';
create index booking_email_leases on public.booking_email_outbox(lease_until) where state = 'leased';
create index booking_email_booking on public.booking_email_outbox(booking_id);
create index booking_email_recipient on public.booking_email_outbox(recipient_id);
alter table public.booking_email_outbox enable row level security;
revoke all on public.booking_email_outbox from public, anon, authenticated, service_role;

create function public.enqueue_booking_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  template_name text;
  booking public.bookings;
  deadline timestamptz;
begin
  template_name := case new.payload->>'status'
    when 'requested' then 'booking_requested_v1'
    when 'accepted' then 'booking_accepted_v1'
    when 'paid' then 'booking_paid_v1'
    when 'cancelled' then 'booking_cancelled_v1'
  end;
  if template_name is null or new.type not in ('booking.requested', 'booking.status') then return new; end if;
  select * into booking from public.bookings where id = (new.payload->>'booking_id')::uuid;
  if not found or (case template_name
    when 'booking_requested_v1' then new.user_id <> booking.owner_id
    when 'booking_accepted_v1' then new.user_id <> booking.renter_id
    else new.user_id not in (booking.owner_id, booking.renter_id)
  end) then return new; end if;
  deadline := least(new.created_at + interval '24 hours', case template_name
    when 'booking_requested_v1' then booking.request_expires_at
    when 'booking_accepted_v1' then booking.payment_expires_at
  end);
  insert into public.booking_email_outbox (booking_id, recipient_id, template, event_key, due_at, expires_at)
  values (booking.id, new.user_id, template_name, 'notification:' || new.id, new.created_at, deadline)
  on conflict (event_key) do nothing;
  return new;
end;
$$;
create trigger booking_email_from_notification after insert on public.notifications
for each row when (new.type in ('booking.requested', 'booking.status'))
execute function public.enqueue_booking_email();

create function public.enqueue_booking_email_reminders()
returns integer language plpgsql set search_path = '' as $$
declare
  local_day date := (statement_timestamp() at time zone 'Asia/Manila')::date;
  opens_at timestamptz := (local_day + time '09:00') at time zone 'Asia/Manila';
  closes_at timestamptz := ((local_day + 1)::timestamp at time zone 'Asia/Manila');
  affected integer;
begin
  if statement_timestamp() < opens_at then return 0; end if;
  insert into public.booking_email_outbox (booking_id, recipient_id, template, event_key, due_at, expires_at)
  select b.id, recipient, reminder.template_name, keys.key, opens_at, closes_at
  from public.bookings b
  cross join lateral (values (b.owner_id), (b.renter_id)) recipients(recipient)
  cross join lateral (select case b.status
    when 'paid' then 'booking_pickup_reminder_v1'
    when 'handed_over' then 'booking_return_reminder_v1'
  end as template_name) reminder
  cross join lateral (select b.id::text || ':' || recipient::text || ':' || reminder.template_name || ':' || local_day::text as key) keys
  where ((b.status = 'paid' and lower(b.rental_period) = local_day + 1)
      or (b.status = 'handed_over' and upper(b.rental_period) = local_day + 2
        and upper(b.rental_period) - lower(b.rental_period) > 1))
    and not exists (select 1 from public.booking_email_outbox o where o.event_key = keys.key)
  order by b.id, recipient
  limit 200
  on conflict (event_key) do nothing;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function public.claim_booking_email()
returns table (id uuid, booking_id uuid, template text, lease_token uuid)
language plpgsql set search_path = '' as $$
declare
  job public.booking_email_outbox;
  booking public.bookings;
  eligible boolean;
  local_day date := (statement_timestamp() at time zone 'Asia/Manila')::date;
begin
  update public.booking_email_outbox o
    set state = 'needs_review', lease_token = null, lease_until = null
    where o.state = 'leased' and o.lease_until <= statement_timestamp();
  select * into job from public.booking_email_outbox o
    where o.state = 'queued' and o.due_at <= statement_timestamp()
    order by o.due_at, o.id limit 1 for update skip locked;
  if not found then return; end if;
  select * into booking from public.bookings b where b.id = job.booking_id;
  eligible := found and job.recipient_id in (booking.owner_id, booking.renter_id)
    and public.booking_actor_eligible(job.recipient_id)
    and statement_timestamp() < job.expires_at
    and case job.template
      when 'booking_requested_v1' then booking.status = 'requested' and booking.request_expires_at > statement_timestamp()
      when 'booking_accepted_v1' then booking.status = 'accepted' and booking.payment_expires_at > statement_timestamp()
      when 'booking_paid_v1' then booking.status in ('paid','handed_over')
      when 'booking_cancelled_v1' then booking.status = 'cancelled'
      when 'booking_pickup_reminder_v1' then booking.status = 'paid' and lower(booking.rental_period) = local_day + 1
      when 'booking_return_reminder_v1' then booking.status = 'handed_over' and upper(booking.rental_period) = local_day + 2
      else false
    end;
  if eligible is not true then
    update public.booking_email_outbox o set state = 'skipped' where o.id = job.id;
    return query select job.id, job.booking_id, job.template, null::uuid;
    return;
  end if;
  return query update public.booking_email_outbox o set
    state = 'leased', attempts = o.attempts + 1, lease_token = gen_random_uuid(),
    lease_until = statement_timestamp() + interval '1 minute'
    where o.id = job.id returning o.id, o.booking_id, o.template, o.lease_token;
end;
$$;

create function public.finish_booking_email(p_id uuid, p_token uuid, p_result text, p_capture_id text default null)
returns boolean language plpgsql set search_path = '' as $$
declare
  affected integer;
begin
  if p_result is null or p_result not in ('captured','retry','failed','needs_review')
    or (p_result = 'captured' and (p_capture_id is null or length(p_capture_id) not between 1 and 200)) then
    raise exception using errcode = '22023', message = 'invalid_email_result';
  end if;
  update public.booking_email_outbox o set
    state = case when p_result = 'retry' then
      case when o.attempts < 3 and statement_timestamp() +
        (case when o.attempts = 1 then interval '1 minute' else interval '5 minutes' end) < o.expires_at
        then 'queued' else 'failed' end
      else p_result end,
    due_at = case when p_result = 'retry' then statement_timestamp() +
      (case when o.attempts = 1 then interval '1 minute' else interval '5 minutes' end) else o.due_at end,
    capture_id = case when p_result = 'captured' then p_capture_id end,
    lease_token = null, lease_until = null
  where o.id = p_id and o.state = 'leased' and o.lease_token = p_token and o.lease_until > statement_timestamp();
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- The worker API is service-only. The table and trigger stay inaccessible to API roles.
alter function public.enqueue_booking_email_reminders() security definer;
alter function public.claim_booking_email() security definer;
alter function public.finish_booking_email(uuid,uuid,text,text) security definer;
revoke all on function public.enqueue_booking_email(), public.enqueue_booking_email_reminders(),
  public.claim_booking_email(), public.finish_booking_email(uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_booking_email_reminders(), public.claim_booking_email(),
  public.finish_booking_email(uuid,uuid,text,text) to service_role;
commit;
