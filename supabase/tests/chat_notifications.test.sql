begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(c.relrowsecurity,'RLS remains enabled on '||c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('conversations','messages','notifications');
select ok(not has_table_privilege(r,t,'INSERT') and not has_table_privilege(r,t,'UPDATE') and not has_table_privilege(r,t,'DELETE'),
  r||' cannot bypass commands for '||t) from unnest(array['anon','authenticated','service_role'])r
  cross join unnest(array['public.conversations','public.messages','public.notifications'])t;
select ok(not has_table_privilege('anon',t,'SELECT'),'Anonymous direct read denied for '||t)
  from unnest(array['public.conversations','public.messages','public.notifications'])t;
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t),
  'Realtime publication includes '||t) from unnest(array['messages','notifications'])t;
select ok(not has_function_privilege('anon',p.oid,'EXECUTE'),'Anonymous RPC access denied: '||p.proname)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
  ('open_booking_chat','list_my_conversations','list_chat_messages','send_chat_message','mark_chat_read','list_my_notifications','mark_notification_read');
select ok(not has_function_privilege('authenticated',p.oid,'EXECUTE'),'Internal function is not public: '||p.proname)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
  ('chat_conversation_json','notification_json','notify_chat_message','notify_booking_event');
select ok(p.proconfig @> array['search_path=""'],'Definer has an empty search_path: '||p.proname)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
  ('communication_user','chat_can_read','open_booking_chat','list_my_conversations','list_chat_messages','send_chat_message','mark_chat_read','list_my_notifications','mark_notification_read');
select * from finish();
rollback;
