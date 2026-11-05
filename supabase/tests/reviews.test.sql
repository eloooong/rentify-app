begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='public.reviews'::regclass),'Review RLS remains enabled');
select ok(not has_table_privilege(r,'public.reviews','INSERT') and not has_table_privilege(r,'public.reviews','UPDATE')
  and not has_table_privilege(r,'public.reviews','DELETE'),r||' cannot bypass review commands')
  from unnest(array['anon','authenticated','service_role'])r;
select ok(not has_table_privilege(r,'public.reviews','SELECT'),r||' cannot read private booking identity') from unnest(array['anon','authenticated'])r;
select ok(has_function_privilege(r,'public.list_profile_reviews(uuid,text,integer,integer)','EXECUTE'),r||' can read the public projection') from unnest(array['anon','authenticated'])r;
select ok(not has_function_privilege(r,'public.review_json(public.reviews)','EXECUTE'),r||' cannot call internal projection helper') from unnest(array['anon','authenticated','service_role'])r;
select ok(not has_function_privilege(r,'public.submit_booking_review(uuid,integer,text)','EXECUTE'),r||' cannot submit reviews') from unnest(array['anon','service_role'])r;
select ok(not has_function_privilege('anon','public.get_booking_review(uuid)','EXECUTE'),'Anonymous users cannot inspect booking eligibility');
select ok(p.proconfig @> array['search_path=""'],'Empty definer search_path: '||p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('review_json','submit_booking_review','get_booking_review','list_profile_reviews');
select * from finish();
rollback;
