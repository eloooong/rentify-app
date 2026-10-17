begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

insert into public.categories(id, name, slug) values
  ('20000000-0000-4000-8000-000000000002', 'Test category', 'test-category');
grant usage on schema extensions to anon, authenticated;

set local role anon;
select is((select name from public.categories where slug = 'test-category'), 'Test category', 'Anonymous visitors can browse reference categories');
select throws_ok($$insert into public.categories(name, slug) values ('Injected', 'injected')$$, '42501', null::text, 'Anonymous category insert denied');
select throws_ok($$update public.categories set name = 'Changed' where slug = 'test-category'$$, '42501', null::text, 'Anonymous category update denied');
select throws_ok($$delete from public.categories where slug = 'test-category'$$, '42501', null::text, 'Anonymous category delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select name from public.categories where slug = 'test-category'), 'Test category', 'Authenticated visitors can browse reference categories');
select throws_ok($$insert into public.categories(name, slug) values ('Injected', 'injected')$$, '42501', null::text, 'Authenticated category insert denied');
select throws_ok($$update public.categories set name = 'Changed' where slug = 'test-category'$$, '42501', null::text, 'Authenticated category update denied');
select throws_ok($$delete from public.categories where slug = 'test-category'$$, '42501', null::text, 'Authenticated category delete denied');
reset role;
select is((select name from public.categories where slug = 'test-category'), 'Test category', 'Client attempts left reference data unchanged');

select * from finish();
rollback;
