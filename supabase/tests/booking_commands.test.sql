begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
grant usage on schema extensions to anon,authenticated;

insert into auth.users(id,email_confirmed_at) values
('91000000-0000-4000-8000-000000000001',now()),('91000000-0000-4000-8000-000000000002',now()),
('91000000-0000-4000-8000-000000000003',now()),('91000000-0000-4000-8000-000000000004',now()),
('91000000-0000-4000-8000-000000000005',null),('91000000-0000-4000-8000-000000000006',now());
insert into public.profiles(id,display_name) values
('91000000-0000-4000-8000-000000000001','Command owner'),('91000000-0000-4000-8000-000000000002','Command renter'),
('91000000-0000-4000-8000-000000000003','Other renter'),('91000000-0000-4000-8000-000000000004','Outsider'),
('91000000-0000-4000-8000-000000000005','Unverified');
insert into public.listings(id,owner_id,category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes)
select '92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',id,
'Command fixture camera',85000,170000,'Good','Campus','{"brand":"Demo","model":"Commands"}' from categories where slug='cameras';
insert into storage.objects(bucket_id,name,metadata) values ('listing-images',
'91000000-0000-4000-8000-000000000001/92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001.webp',
'{"mimetype":"image/webp","size":100}');
insert into public.listing_photos(listing_id,storage_path,position) values
('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001/92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001.webp',0);
update public.listings set status='published' where id='92000000-0000-4000-8000-000000000001';
create temp table command_test_state(name text primary key,payload jsonb);
grant all on command_test_state to authenticated;
create function pg_temp.test_day(delta integer) returns date language sql as $$
select (clock_timestamp() at time zone 'Asia/Manila')::date+delta;
$$;
create function pg_temp.command_id(label text) returns uuid language sql as $$
select (payload->'booking'->>'id')::uuid from pg_temp.command_test_state where name=label;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9),gen_random_uuid())$$,'42501','profile_required','Unverified user cannot request');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9),gen_random_uuid())$$,'42501','profile_required','Missing profile cannot request');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9),gen_random_uuid())$$,'P0001','self_booking','Owner cannot request own listing');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(0),pg_temp.test_day(0),gen_random_uuid())$$,'P0001','invalid_dates','Advance notice enforced');
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(37),gen_random_uuid())$$,'P0001','invalid_dates','Overlong command rejected');
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(91),pg_temp.test_day(91),gen_random_uuid())$$,'P0001','invalid_dates','Pickup horizon enforced');
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(9),pg_temp.test_day(7),gen_random_uuid())$$,'P0001','invalid_dates','Backwards dates rejected');
insert into command_test_state values ('first',public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9),'95000000-0000-4000-8000-000000000001'));
select is((select (payload->'booking'->>'rental_days')::integer from command_test_state where name='first'),3,'Both selected dates are charged');
select is((select (payload->'booking'->>'rental_amount')::integer from command_test_state where name='first'),255000,'Server calculates the three-day rental');
select is((select (payload->'booking'->>'total_amount')::integer from command_test_state where name='first'),425000,'Deposit shown separately and included in total');
select ok((select not (payload->>'replayed')::boolean from command_test_state where name='first'),'First request is not a replay');
select is(public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9),'95000000-0000-4000-8000-000000000001')->>'replayed','true','Same key replays one request');
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(8),pg_temp.test_day(9),'95000000-0000-4000-8000-000000000001')$$,'P0001','idempotency_conflict','Same key cannot change the dates');
select throws_ok($$select public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(8),pg_temp.test_day(9),gen_random_uuid())$$,'P0001','duplicate_request','Duplicate open request denied');
select throws_ok($$select public.act_on_booking(pg_temp.command_id('first'),'accept')$$,'42501','forbidden','Renter cannot accept their request');
select is((public.list_my_bookings('renter')->'pagination'->>'total')::integer,1,'Private list derives the renter from identity');
select is(jsonb_array_length(public.list_my_bookings('renter',null,9999,20)->'data'),0,'Out-of-range page is empty, not a provider error');
reset role;
update public.listings set daily_price_amount=95000 where id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select is((public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9),'95000000-0000-4000-8000-000000000001')->'booking'->>'daily_price_amount')::integer,85000,'Replay preserves the original quote after a price edit');
insert into command_test_state values ('newquote',public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(14),pg_temp.test_day(14),gen_random_uuid()));
select is((select (payload->'booking'->>'daily_price_amount')::integer from command_test_state where name='newquote'),95000,'New request takes the new price');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
insert into command_test_state values ('second',public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9),gen_random_uuid()));
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.get_booking(pg_temp.command_id('first'))$$,'P0001','not_found','Outsider cannot read a booking');
select throws_ok($$select public.act_on_booking(pg_temp.command_id('first'),'cancel','Changed plans')$$,'P0001','not_found','Outsider cannot cancel');
select is((public.list_my_bookings()->'pagination'->>'total')::integer,0,'Outsider list is empty');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into command_test_state values ('accepted',jsonb_build_object('booking',public.act_on_booking(pg_temp.command_id('first'),'accept')));
select is(public.get_booking(pg_temp.command_id('first'))->>'status','accepted','Owner acceptance reserves dates');
select is(public.act_on_booking(pg_temp.command_id('first'),'accept')->>'payment_expires_at',public.get_booking(pg_temp.command_id('accepted'))->>'payment_expires_at','Acceptance replay cannot extend its payment window');
select throws_ok($$select public.act_on_booking(pg_temp.command_id('second'),'accept')$$,'P0001','booking_conflict','Competing request cannot be accepted');
select is(public.get_booking(pg_temp.command_id('second'))->>'status','requested','Conflicting action leaves the request unchanged');
select is(jsonb_array_length(public.booking_availability('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9))->'blocked_ranges'),1,'Public calendar shows reserved dates');
select ok(not ((public.booking_availability('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9)))::text like '%'||pg_temp.command_id('first')::text||'%'),'Calendar does not expose booking IDs');
select is(public.act_on_booking(pg_temp.command_id('first'),'cancel','Owner unavailable')->>'status','cancelled','Owner may cancel an accepted unpaid reservation');
select is(public.act_on_booking(pg_temp.command_id('first'),'cancel','Owner unavailable')->>'status','cancelled','Cancellation replay is idempotent');
select throws_ok($$select public.act_on_booking(pg_temp.command_id('first'),'cancel','Different reason')$$,'P0001','idempotency_conflict','Cancellation reason cannot be silently rewritten');
select is(public.act_on_booking(pg_temp.command_id('second'),'accept')->>'status','accepted','Released dates can be reserved by the other renter');
select is(public.act_on_booking(pg_temp.command_id('newquote'),'decline','Device maintenance')->>'status','declined','Owner may decline');
select throws_ok($$select public.act_on_booking(pg_temp.command_id('newquote'),'paid')$$,'P0001','invalid_action','Payment transition is not exposed');
select throws_ok($$select public.expire_booking_holds()$$,'42501',null::text,'Client cannot invoke trusted expiry job');
select throws_ok($$select public.booking_actor_eligible('91000000-0000-4000-8000-000000000001')$$,'42501',null::text,'Private helper is not a client RPC');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select is(public.act_on_booking(pg_temp.command_id('second'),'cancel','Changed plans')->>'status','cancelled','Renter may cancel an accepted unpaid reservation');
reset role;
select is((select count(*) from public.audit_log where target_id=pg_temp.command_id('first') and action='booking.accepted'),1::bigint,'Acceptance audited once, not on replay');
select is((select count(*) from public.audit_log where target_id=pg_temp.command_id('first') and action='booking.cancelled'),1::bigint,'Cancellation audited once');

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
insert into command_test_state values ('expiry',public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(30),pg_temp.test_day(30),gen_random_uuid()));
insert into command_test_state values ('paymentexpiry',public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(40),pg_temp.test_day(40),gen_random_uuid()));
insert into command_test_state values ('physical',public.request_booking('92000000-0000-4000-8000-000000000001',pg_temp.test_day(50),pg_temp.test_day(50),gen_random_uuid()));
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.act_on_booking(pg_temp.command_id('paymentexpiry'),'accept');
reset role;
update public.bookings set request_expires_at=clock_timestamp()-interval '1 second' where id=pg_temp.command_id('expiry');
update public.bookings set payment_expires_at=clock_timestamp()-interval '1 second' where id=pg_temp.command_id('paymentexpiry');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.act_on_booking(pg_temp.command_id('expiry'),'accept')$$,'P0001','booking_expired','Owner cannot accept an expired request');
select throws_ok($$select public.act_on_booking(pg_temp.command_id('paymentexpiry'),'accept')$$,'P0001','booking_expired','Repeated acceptance cannot revive an expired hold');
select is(jsonb_array_length(public.booking_availability('92000000-0000-4000-8000-000000000001',pg_temp.test_day(40),pg_temp.test_day(40))->'blocked_ranges'),0,'Calendar excludes stale payment holds before the job runs');
reset role;
select public.expire_booking_holds(500);
select is((select status from public.bookings where id=pg_temp.command_id('expiry')),'expired'::public.booking_status,'Trusted job expires requests');
select is((select status from public.bookings where id=pg_temp.command_id('paymentexpiry')),'expired'::public.booking_status,'Trusted job expires payment holds');
select is((select count(*) from public.audit_log where target_id=pg_temp.command_id('expiry') and action='booking.expired'),1::bigint,'Expiry is audited');

insert into public.bookings(id,listing_id,owner_id,renter_id,rental_period,rental_amount,deposit_amount,status)
values('96000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003',daterange(pg_temp.test_day(-3),pg_temp.test_day(-1),'[)'),1,0,'handed_over');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.act_on_booking(pg_temp.command_id('physical'),'accept')$$,'P0001','device_unavailable','Overdue device blocks acceptance beyond its old dates');
select is(public.booking_availability('92000000-0000-4000-8000-000000000001',pg_temp.test_day(50),pg_temp.test_day(51))->>'device_available','false','Physical readiness affects the public calendar');
select throws_ok($$select public.act_on_booking('96000000-0000-4000-8000-000000000001','cancel','Changed plans')$$,'P0001','legacy_booking','Legacy rows cannot be repriced or mutated by new commands');
reset role;
update public.bookings set status='disputed' where id='96000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.act_on_booking(pg_temp.command_id('physical'),'accept')$$,'P0001','device_unavailable','Dispute blocks acceptance beyond original dates');
reset role;
update public.bookings set status='completed' where id='96000000-0000-4000-8000-000000000001';
update public.profiles set account_status='suspended' where id='91000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.get_booking(pg_temp.command_id('first'))$$,'Suspended participant retains history reads');
select throws_ok($$select public.act_on_booking(pg_temp.command_id('physical'),'cancel','Changed plans')$$,'42501','profile_required','Suspended participant cannot mutate');
reset role;
update public.profiles set account_status='active' where id='91000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select is(public.act_on_booking(pg_temp.command_id('physical'),'accept')->>'status','accepted','Device can reserve again after being cleared');
reset role;
select is((select count(*) from cron.job where jobname='rentify-booking-expiry' and active and schedule='* * * * *'),1::bigint,'Expiry is scheduled once every minute');
set local role anon;
select lives_ok($$select public.booking_availability('92000000-0000-4000-8000-000000000001',pg_temp.test_day(7),pg_temp.test_day(9))$$,'Public availability requires no account');
select throws_ok($$select public.get_booking('96000000-0000-4000-8000-000000000001')$$,'42501',null::text,'Anonymous detail read denied');
reset role;

select * from finish();
rollback;
