begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='public.booking_email_outbox'::regclass), 'Email outbox enforces RLS');
select ok(not has_table_privilege(role,'public.booking_email_outbox','SELECT')
  and not has_table_privilege(role,'public.booking_email_outbox','INSERT')
  and not has_table_privilege(role,'public.booking_email_outbox','UPDATE'), role || ' cannot access email rows directly')
from unnest(array['anon','authenticated','service_role']) role;
select ok(not has_function_privilege(role,fn,'EXECUTE'), role || ' cannot execute ' || fn)
from unnest(array['anon','authenticated']) role
cross join unnest(array['public.claim_booking_email()', 'public.enqueue_booking_email_reminders()', 'public.finish_booking_email(uuid,uuid,text,text)']) fn;
select * from finish();
rollback;
