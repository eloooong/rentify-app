begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select relrowsecurity from pg_class where oid = 'public.condition_reports'::regclass), 'Reports enforce RLS');
select ok((select not public and file_size_limit = 4194304 and allowed_mime_types = array['image/webp']
  from storage.buckets where id = 'checklist-evidence'), 'Evidence bucket is private and restricts media and size');
select ok(not has_table_privilege(role, 'public.condition_reports', 'INSERT')
  and not has_table_privilege(role, 'public.condition_reports', 'UPDATE')
  and not has_table_privilege(role, 'public.condition_reports', 'DELETE'), role || ' cannot bypass report commands')
from unnest(array['anon', 'authenticated', 'service_role']) role;
select ok(not has_function_privilege('anon', 'public.get_condition_checklist(uuid,text)', 'EXECUTE'), 'Anonymous report RPC denied');
select ok(not has_function_privilege('anon', 'public.confirm_condition_checklist(uuid,text,jsonb,text)', 'EXECUTE'), 'Anonymous confirmation RPC denied');
select ok(not has_function_privilege('authenticated', 'public.checklist_payload(public.bookings,text)', 'EXECUTE'), 'Internal projection is private');

select * from finish();
rollback;
