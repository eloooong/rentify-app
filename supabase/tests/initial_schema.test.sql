begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public'::name, table_name::name, 'Foundation table exists: ' || table_name)
from unnest(array[
  'profiles', 'profile_private', 'categories', 'listings', 'listing_photos',
  'bookings', 'payments', 'condition_reports', 'conversations', 'messages',
  'reviews', 'notifications', 'reports', 'audit_log'
]) as expected(table_name);

select ok(c.relrowsecurity, 'RLS is enabled: ' || c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
  'profiles', 'profile_private', 'categories', 'listings', 'listing_photos',
  'bookings', 'payments', 'condition_reports', 'conversations', 'messages',
  'reviews', 'notifications', 'reports', 'audit_log'
);

-- Fixtures are transaction-scoped; these are not seeded accounts or passwords.
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
insert into public.profiles(id, display_name) values
  ('10000000-0000-4000-8000-000000000001', 'Owner'),
  ('10000000-0000-4000-8000-000000000002', 'Renter'),
  ('10000000-0000-4000-8000-000000000003', 'Unrelated user');
insert into public.profile_private(user_id, phone) values
  ('10000000-0000-4000-8000-000000000001', '+639171234567');
insert into public.categories(id, name, slug) values
  ('20000000-0000-4000-8000-000000000001', 'Camera', 'camera');
insert into public.listings(
  id, owner_id, category_id, title, daily_price_amount, deposit_amount, condition, pickup_area
) values (
  '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'Camera', 10000, 50000, 'Good', 'Campus'
);
insert into public.bookings(
  id, listing_id, owner_id, renter_id, rental_period, rental_amount, deposit_amount
) values (
  '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '[2026-11-01,2026-11-03)', 20000, 50000
);
insert into public.payments(booking_id, type, amount)
values ('40000000-0000-4000-8000-000000000001', 'rental', 20000);
insert into public.conversations(id, booking_id)
values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001');
insert into public.messages(conversation_id, sender_id, body)
values ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Private pickup details');
insert into public.audit_log(actor_id, action, target_table)
values ('10000000-0000-4000-8000-000000000001', 'fixture', 'bookings');

-- First prove API roles have no table privileges, independently of RLS.
grant usage on schema extensions to anon, authenticated;
set local role anon;
select throws_ok('select * from public.profile_private', '42501', null::text, 'Anonymous private read denied by grants');
reset role;
set local role authenticated;
select throws_ok('select * from public.payments', '42501', null::text, 'Authenticated payment read denied by grants');
reset role;

-- Temporary grants prove a second boundary: RLS still denies without policies.
-- These grants are rolled back and must never be part of a deployed migration.
grant select, insert, update, delete on public.profiles, public.profile_private,
  public.categories, public.listings, public.bookings, public.payments, public.messages
  to anon, authenticated;
set local role anon;
select is((select count(*) from public.profiles), 0::bigint, 'RLS hides populated profiles from anonymous users');
select is((select count(*) from public.listings), 0::bigint, 'RLS hides listings before read policies exist');
select is((select count(*) from public.profile_private), 0::bigint, 'RLS hides private phone data');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.bookings), 0::bigint, 'Even owner access waits for participant policies');
select is((select count(*) from public.messages), 0::bigint, 'No premature chat access');
select is((select count(*) from public.payments), 0::bigint, 'No premature payment access');
select throws_ok(
  $$insert into public.categories(name, slug) values ('Unauthorized', 'unauthorized')$$,
  '42501', null::text, 'RLS rejects writes even with a temporary INSERT grant'
);
select lives_ok(
  $$update public.profiles set role = 'admin' where id = '10000000-0000-4000-8000-000000000001'$$,
  'Attempted role escalation cannot see an updatable row'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.profile_private), 0::bigint, 'Unrelated user cannot read private data');
reset role;
select is((select role from public.profiles where display_name = 'Owner'), 'user', 'Role escalation changed nothing');

set local role service_role;
select is((select count(*) from public.profiles), 3::bigint, 'Trusted backend can read fixture profiles');
select throws_ok('delete from public.audit_log', '42501', null::text, 'Trusted backend cannot erase the audit trail');
select throws_ok($$update public.audit_log set action = 'rewritten'$$, '42501', null::text, 'Trusted backend cannot rewrite the audit trail');
reset role;

select throws_ok(
  $$update public.listings set daily_price_amount = -1$$,
  '23514', null::text, 'Negative listing prices rejected'
);
select throws_ok(
  $$update public.payments set amount = -1$$,
  '23514', null::text, 'Negative payments rejected'
);
select throws_ok(
  $$update public.bookings set rental_period = 'empty'$$,
  '23514', null::text, 'Empty booking periods rejected'
);
select throws_ok(
  $$update public.bookings set renter_id = owner_id$$,
  '23514', null::text, 'Owners cannot be their own renter'
);
select throws_ok(
  $$update public.bookings set owner_id = '10000000-0000-4000-8000-000000000003'$$,
  '23503', null::text, 'Booking owner must match the listing owner'
);
select throws_ok(
  $$update public.categories set attribute_schema = '[]'$$,
  '23514', null::text, 'Category schemas must be JSON objects'
);
select throws_ok(
  $$update public.messages set body = '   '$$,
  '23514', null::text, 'Blank messages rejected'
);
select throws_ok(
  $$insert into public.reviews(booking_id, author_id, subject_id, rating) values (
    '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', 6)$$,
  '23514', null::text, 'Out-of-range ratings rejected'
);
insert into public.reviews(booking_id, author_id, subject_id, rating) values (
  '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 5
);
select throws_ok(
  $$insert into public.reviews(booking_id, author_id, subject_id, rating) values (
    '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', 4)$$,
  '23505', null::text, 'Duplicate reviews per booking/author rejected'
);
select throws_ok(
  $$insert into public.reports(reporter_id, listing_id, reported_user_id, reason) values (
    '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'Two targets')$$,
  '23514', null::text, 'A report must identify exactly one target'
);
update public.profiles set display_name = 'Updated owner', updated_at = '2000-01-01'
where id = '10000000-0000-4000-8000-000000000001';
select ok(
  (select updated_at > '2000-01-01'::timestamptz from public.profiles where display_name = 'Updated owner'),
  'Update trigger supplies the current timestamp'
);

select * from finish();
rollback;
