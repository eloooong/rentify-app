begin;

revoke insert, update, delete on public.condition_reports from public, anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-evidence', 'checklist-evidence', false, 4194304, array['image/webp']);

create function public.checklist_stage_open(b public.bookings, p_stage text, p_now timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select case p_stage
    when 'handover' then b.status = 'paid'
      and lower(b.rental_period) <= (p_now at time zone 'Asia/Manila')::date
      and not exists (
        select 1 from public.bookings other
        where other.listing_id = b.listing_id and other.id <> b.id
          and other.status in ('handed_over', 'returned', 'disputed')
      )
    when 'return' then b.status = 'handed_over'
    else false
  end;
$$;

-- One immutable photo per participant and stage. Lock the booking so the insert
-- cannot race a confirmation by that participant. Photo reads use a guarded API.
create function public.can_upload_checklist_photo(p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  b public.bookings;
  stage_name text := split_part(p_name, '/', 2);
  side text := split_part(p_name, '/', 3);
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(handover|return)/(owner|renter)\.webp$'
    or not public.booking_actor_eligible(actor) then
    return false;
  end if;
  select * into b from public.bookings
  where id = split_part(p_name, '/', 1)::uuid and actor in (owner_id, renter_id)
  for share;
  if not found or not public.checklist_stage_open(b, stage_name, clock_timestamp()) then
    return false;
  end if;
  if side <> (case when actor = b.owner_id then 'owner.webp' else 'renter.webp' end) then
    return false;
  end if;
  return not exists (
    select 1 from public.condition_reports r where r.booking_id = b.id and r.stage = stage_name
      and (case when actor = b.owner_id then r.owner_confirmed_at else r.renter_confirmed_at end) is not null
  );
end;
$$;

create policy checklist_evidence_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'checklist-evidence' and public.can_upload_checklist_photo(name)
);

create function public.checklist_payload(b public.bookings, p_stage text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'booking_id', b.id, 'booking_status', b.status, 'stage', p_stage,
    'role', case when auth.uid() = b.owner_id then 'owner' else 'renter' end,
    'can_confirm', public.booking_actor_eligible(auth.uid())
      and public.checklist_stage_open(b, p_stage, statement_timestamp())
      and (case when auth.uid() = b.owner_id then r.owner_confirmed_at else r.renter_confirmed_at end) is null,
    'owner_confirmed_at', r.owner_confirmed_at, 'renter_confirmed_at', r.renter_confirmed_at,
    'owner_note', r.checklist->0->>'owner', 'renter_note', r.checklist->0->>'renter',
    'owner_photo', exists (select 1 from storage.objects where bucket_id = 'checklist-evidence'
      and name = b.id::text || '/' || p_stage || '/owner.webp'),
    'renter_photo', exists (select 1 from storage.objects where bucket_id = 'checklist-evidence'
      and name = b.id::text || '/' || p_stage || '/renter.webp')
  )
  from (select 1) seed left join public.condition_reports r on r.booking_id = b.id and r.stage = p_stage;
$$;

create function public.get_condition_checklist(p_booking uuid, p_stage text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b public.bookings;
begin
  if public.communication_user() is null then raise exception using errcode = '42501', message = 'sign_in'; end if;
  if p_stage is null or p_stage not in ('handover', 'return') then raise exception using errcode = '22023', message = 'validation'; end if;
  select * into b from public.bookings where id = p_booking and auth.uid() in (owner_id, renter_id);
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return public.checklist_payload(b, p_stage);
end;
$$;

create function public.confirm_condition_checklist(p_booking uuid, p_stage text, p_checks jsonb, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.communication_user();
  listing uuid;
  b public.bookings;
  r public.condition_reports;
  side text;
  now_at timestamptz;
begin
  if actor is null then raise exception using errcode = '42501', message = 'sign_in'; end if;
  if p_stage is null or p_stage not in ('handover', 'return')
    or p_checks is distinct from '{"device_checked":true,"condition_recorded":true,"physical_transfer":true}'::jsonb
    or p_note is null or char_length(btrim(p_note)) > 1000 then
    raise exception using errcode = '22023', message = 'validation';
  end if;
  select listing_id into listing from public.bookings where id = p_booking and actor in (owner_id, renter_id);
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  -- Same lock order as booking acceptance and paid cancellation.
  perform 1 from public.listings where id = listing for update;
  select * into b from public.bookings where id = p_booking and listing_id = listing
    and actor in (owner_id, renter_id) for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if not public.booking_actor_eligible(actor) then raise exception using errcode = '42501', message = 'account_inactive'; end if;
  side := case when actor = b.owner_id then 'owner' else 'renter' end;
  now_at := clock_timestamp();
  select * into r from public.condition_reports where booking_id = b.id and stage = p_stage;
  if (case when side = 'owner' then r.owner_confirmed_at else r.renter_confirmed_at end) is not null then
    if (r.checklist->0->>side) is distinct from btrim(p_note) then
      raise exception using errcode = 'P0001', message = 'already_confirmed';
    end if;
    return public.checklist_payload(b, p_stage);
  end if;
  if not public.checklist_stage_open(b, p_stage, now_at) then
    raise exception using errcode = 'P0001', message = 'stage_closed';
  end if;
  insert into public.condition_reports (booking_id, stage, checklist, owner_confirmed_at, renter_confirmed_at)
  values (b.id, p_stage, jsonb_build_array(jsonb_build_object(side, btrim(p_note))),
    case when side = 'owner' then now_at end, case when side = 'renter' then now_at end)
  on conflict (booking_id, stage) do update set
    checklist = jsonb_build_array(coalesce(condition_reports.checklist->0, '{}'::jsonb) || (excluded.checklist->0)),
    owner_confirmed_at = coalesce(condition_reports.owner_confirmed_at, excluded.owner_confirmed_at),
    renter_confirmed_at = coalesce(condition_reports.renter_confirmed_at, excluded.renter_confirmed_at)
  returning * into r;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (actor, 'checklist.confirmed', 'condition_reports', r.id, jsonb_build_object('stage', p_stage, 'role', side));
  if r.owner_confirmed_at is not null and r.renter_confirmed_at is not null then
    update public.bookings set status = case when p_stage = 'handover' then 'handed_over'::public.booking_status
      else 'returned'::public.booking_status end where id = b.id returning * into b;
    insert into public.audit_log (actor_id, action, target_table, target_id)
    values (actor, 'booking.' || b.status::text, 'bookings', b.id);
  end if;
  return public.checklist_payload(b, p_stage);
end;
$$;

revoke all on function public.checklist_stage_open(public.bookings,text,timestamptz),
  public.can_upload_checklist_photo(text), public.checklist_payload(public.bookings,text),
  public.get_condition_checklist(uuid,text), public.confirm_condition_checklist(uuid,text,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_upload_checklist_photo(text), public.get_condition_checklist(uuid,text),
  public.confirm_condition_checklist(uuid,text,jsonb,text) to authenticated;
commit;
