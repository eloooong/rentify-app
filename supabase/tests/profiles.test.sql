begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
grant usage on schema extensions to anon, authenticated;

insert into auth.users (id, email_confirmed_at, raw_user_meta_data) values
('61000000-0000-4000-8000-000000000001', now(), '{"role":"admin","phone_verified":true}'),
('61000000-0000-4000-8000-000000000002', now(), '{}'),
('61000000-0000-4000-8000-000000000003', null, '{}');

set local role anon;
select lives_ok('select id, display_name, avatar_path, created_at, updated_at from public.profiles', 'Anonymous safe projection works');
select throws_ok('select * from public.profiles', '42501', null::text, 'Anonymous wildcard cannot reveal trusted fields');
select throws_ok('select phone from public.profile_private', '42501', null::text, 'Anonymous phone reads denied');
select throws_ok($$select public.save_my_profile('Intruder', null)$$, '42501', null::text, 'Anonymous profile RPC denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.save_my_profile('First member', '+639171234567')$$, 'Verified first save creates both rows');
select is((select display_name from public.profiles where id = auth.uid()), 'First member', 'Display name saved');
select is((select phone from public.profile_private where user_id = auth.uid()), '+639171234567', 'Owner can read private phone');
select is((select phone_verified_at from public.profile_private where user_id = auth.uid()), null::timestamptz, 'Saving never verifies phone');
select lives_ok($$select public.save_my_profile('Updated member', '+639171234568')$$, 'Repeated save updates existing profile');
select is((select count(*) from public.profile_private), 1::bigint, 'Upsert does not duplicate private row');
select throws_ok($$select public.save_my_profile('Should roll back', 'invalid')$$, '23514', null::text, 'Direct RPC invalid phone rejected');
select is((select display_name from public.profiles where id = auth.uid()), 'Updated member', 'Invalid private update rolls back public update');
select throws_ok($$select public.save_my_profile(repeat('x',81), null)$$, '23514', null::text, 'Direct RPC overlong display name rejected');
select throws_ok($$select public.save_my_profile(E'line\nbreak', null)$$, '23514', null::text, 'Control characters rejected by database');
select throws_ok('select role from public.profiles', '42501', null::text, 'Trusted role cannot be queried through public projection');
select throws_ok($$update public.profiles set role = 'admin' where id = auth.uid()$$, '42501', null::text, 'Column grants deny role escalation');
select throws_ok($$update public.profiles set account_status = 'active' where id = auth.uid()$$, '42501', null::text, 'Column grants protect account status');
select throws_ok('update public.profile_private set phone_verified_at = now() where user_id = auth.uid()', '42501', null::text, 'Column grants protect phone verification');
select throws_ok($$insert into public.profiles(id,display_name) values ('61000000-0000-4000-8000-000000000002','Someone else')$$, '42501', null::text, 'Cannot create another user profile');
select throws_ok('delete from public.profiles where id = auth.uid()', '42501', null::text, 'Client deletion is not enabled');

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.save_my_profile('Second member', null)$$, 'Second verified member can create profile without phone');
select is((select phone from public.profile_private where user_id = '61000000-0000-4000-8000-000000000001'), null::text, 'Other user phone is hidden by RLS');
with changed as (update public.profiles set display_name = 'Stolen' where id = '61000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'Other user public writes affect no rows');
with changed as (update public.profile_private set phone = '+639171234569' where user_id = '61000000-0000-4000-8000-000000000001' returning user_id)
select is((select count(*) from changed), 0::bigint, 'Other user private writes affect no rows');

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.save_my_profile('Unverified member', null)$$, '42501', null::text, 'Unverified direct RPC denied');
select throws_ok($$insert into public.profiles(id,display_name) values (auth.uid(),'Unverified direct')$$, '42501', null::text, 'Unverified direct table creation denied');
reset role;
select is((select role from public.profiles where id = '61000000-0000-4000-8000-000000000001'), 'user', 'Forged Auth metadata never becomes a trusted role');

-- Verify triggers independently of the production column-grant ceiling.
grant update (role, account_status, id) on public.profiles to authenticated;
grant update (phone_verified_at, user_id) on public.profile_private to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select throws_ok($$update public.profiles set role = 'admin' where id = auth.uid()$$, '42501', null::text, 'Trigger blocks escalation with broadened grants');
select throws_ok($$update public.profiles set account_status = 'suspended' where id = auth.uid()$$, '42501', null::text, 'Trigger blocks client status changes');
select throws_ok('update public.profile_private set phone_verified_at = now() where user_id = auth.uid()', '42501', null::text, 'Trigger blocks forged verification');
reset role;

update public.profile_private set phone_verified_at = now() where user_id = '61000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.save_my_profile('Updated member', '+639171234568')$$, 'Name-only save can keep a verified phone');
select ok((select phone_verified_at is not null from public.profile_private where user_id = auth.uid()), 'Unchanged phone retains verification');
select lives_ok($$select public.save_my_profile('Updated member', '+639171234569')$$, 'Owner can replace a previously verified phone');
select is((select phone_verified_at from public.profile_private where user_id = auth.uid()), null::timestamptz, 'Phone replacement clears old verification');
select lives_ok($$select public.save_my_profile('Updated member', null)$$, 'Owner can remove optional phone');
select is((select phone from public.profile_private where user_id = auth.uid()), null::text, 'Removed phone is null');
reset role;

update public.profiles set account_status = 'suspended' where id = '61000000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*) from public.profiles where id = '61000000-0000-4000-8000-000000000001'), 0::bigint, 'Public reads hide suspended profiles');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.profiles where id = auth.uid()), 1::bigint, 'Suspended owner retains own profile read');
select throws_ok($$select public.save_my_profile('Suspended edit', null)$$, '42501', null::text, 'Suspended owner cannot save');
reset role;
select is((select display_name from public.profiles where id = '61000000-0000-4000-8000-000000000001'), 'Updated member', 'Suspension denial preserves data');

select * from finish();
rollback;
