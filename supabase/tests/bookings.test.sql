begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
grant usage on schema extensions to anon,authenticated;

insert into auth.users(id,email_confirmed_at) values
('81000000-0000-4000-8000-000000000001',now()),
('81000000-0000-4000-8000-000000000002',now()),
('81000000-0000-4000-8000-000000000003',now()),
('81000000-0000-4000-8000-000000000004',now());
insert into public.profiles(id,display_name) values
('81000000-0000-4000-8000-000000000001','Booking owner'),
('81000000-0000-4000-8000-000000000002','Booking renter'),
('81000000-0000-4000-8000-000000000003','Other renter'),
('81000000-0000-4000-8000-000000000004','Outsider');
insert into public.listings(id,owner_id,category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes)
select l.id,'81000000-0000-4000-8000-000000000001',c.id,'Booking fixture camera',85000,170000,'Good','Demo campus','{"brand":"Demo","model":"C1"}'
from (values ('82000000-0000-4000-8000-000000000001'::uuid),('82000000-0000-4000-8000-000000000002'::uuid)) as l(id)
cross join public.categories c where c.slug='cameras';

-- Trusted, transaction-scoped fixtures. Client creation remains disabled.
create function pg_temp.add_booking(b uuid,l uuid,r uuid,s public.booking_status,p daterange)
returns void language sql as $$
  insert into public.bookings(id,listing_id,owner_id,renter_id,status,rental_period,rental_amount,deposit_amount)
  select b,l,owner_id,r,s,p,85000,170000 from public.listings where id=l;
$$;

select pg_temp.add_booking('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','requested','[2030-11-20,2030-11-23)');
select is((select rental_days from public.bookings where id='83000000-0000-4000-8000-000000000001'),3,'Pickup and return dates both count');
select pg_temp.add_booking('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','requested','[2030-12-01,2030-12-02)');
select is((select rental_days from public.bookings where id='83000000-0000-4000-8000-000000000002'),1,'Same-date rental is one day');
select lives_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','requested','[2030-01-01,2030-01-31)')$$,'Thirty days accepted');
select throws_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','requested','[2030-01-01,2030-02-01)')$$,'23514',null::text,'Thirty-one days rejected');
select throws_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','requested','[2030-01-01,infinity)')$$,'23514',null::text,'Explicit infinite dates rejected');
select throws_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','requested','(,2030-01-02)')$$,'23514',null::text,'Unbounded periods rejected');
select throws_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','requested','[2030-02-01,2030-02-02)')$$,'23514',null::text,'Self-booking rejected');
select throws_ok($$update public.bookings set rental_days=99 where id='83000000-0000-4000-8000-000000000001'$$,'428C9',null::text,'Generated duration cannot be forged');
select throws_ok($$insert into public.bookings(listing_id,owner_id,renter_id,rental_period,rental_amount,deposit_amount) values ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000002','[2030-02-01,2030-02-02)',85000,0)$$,'23503',null::text,'Owner snapshot must match listing');

select pg_temp.add_booking('83000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','accepted','[2030-02-01,2030-02-04)');
select throws_ok(format($sql$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003',%L,'[2030-02-03,2030-02-06)')$sql$,s),'23P01',null::text,'Overlapping candidate blocked: '||s)
from unnest(array['accepted','paid','handed_over','returned','disputed']) s;
-- Confirm every existing reserved status blocks a new accepted booking.
create function pg_temp.assert_reserved_statuses() returns setof text language plpgsql as $$
declare s public.booking_status;
begin
  foreach s in array array['accepted','paid','handed_over','returned','disputed']::public.booking_status[] loop
    update public.bookings set status=s where id='83000000-0000-4000-8000-000000000010';
    return next throws_ok($q$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','accepted','[2030-02-03,2030-02-06)')$q$,'23P01',null::text,'Existing reservation blocks: '||s);
  end loop;
end;
$$;
select * from pg_temp.assert_reserved_statuses();
select lives_ok(format($sql$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003',%L,'[2030-02-03,2030-02-06)')$sql$,s),'Non-reserving status may overlap: '||s)
from unnest(array['requested','declined','expired','cancelled','completed']) s;
update public.bookings set status='expired' where listing_id='82000000-0000-4000-8000-000000000001'
and renter_id='81000000-0000-4000-8000-000000000003' and status='requested' and rental_period='[2030-02-03,2030-02-06)'::daterange;
select lives_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','accepted','[2030-02-04,2030-02-05)')$$,'Following-day turnover is adjacent, not overlapping');
select lives_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003','accepted','[2030-02-01,2030-02-04)')$$,'Different devices can reserve the same dates');

select pg_temp.add_booking('83000000-0000-4000-8000-000000000020','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','requested','[2030-03-01,2030-03-04)');
select lives_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','requested','[2030-03-01,2030-03-04)')$$,'Different renters may submit overlapping requests');
select throws_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','requested','[2030-03-02,2030-03-05)')$$,'23P01',null::text,'Duplicate overlapping request by same renter denied');
select throws_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','requested','[2030-02-02,2030-02-03)')$$,'23P01',null::text,'Renter cannot duplicate their existing reservation with a request');
update public.bookings set status='cancelled' where id='83000000-0000-4000-8000-000000000010';
select lives_ok($$select pg_temp.add_booking(gen_random_uuid(),'82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','accepted','[2030-02-01,2030-02-04)')$$,'Cancellation explicitly frees reserved dates');

set local role anon;
select throws_ok('select * from public.bookings','42501',null::text,'Anonymous booking read denied by grants');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.bookings where id='83000000-0000-4000-8000-000000000001'),1::bigint,'Owner may read their booking');
select throws_ok($$update public.bookings set status='paid' where id='83000000-0000-4000-8000-000000000001'$$,'42501',null::text,'Owner cannot write booking status');
select throws_ok($$delete from public.bookings where id='83000000-0000-4000-8000-000000000001'$$,'42501',null::text,'Owner cannot erase booking history');
select throws_ok($$insert into public.bookings(listing_id,owner_id,renter_id,rental_period,rental_amount,deposit_amount) values ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','[2030-04-01,2030-04-02)',1,0)$$,'42501',null::text,'Direct client creation stays disabled');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select is((select rental_days from public.bookings where id='83000000-0000-4000-8000-000000000001'),3,'Renter reads the same generated duration');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.bookings where listing_id in ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002')),0::bigint,'Outsider cannot read fixture bookings');
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from public.bookings),0::bigint,'Missing identity cannot read bookings');
reset role;

-- Defense in depth if a future migration accidentally broadens table grants.
grant select,insert,update,delete on public.bookings to anon,authenticated;
set local role anon;
select is((select count(*) from public.bookings),0::bigint,'Anonymous reads still denied by RLS after a temporary grant');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
with changed as (update public.bookings set status='paid' where id='83000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed),0::bigint,'SELECT policy cannot authorize an UPDATE');
with removed as (delete from public.bookings where id='83000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from removed),0::bigint,'SELECT policy cannot authorize a DELETE');
select throws_ok($$insert into public.bookings(listing_id,owner_id,renter_id,rental_period,rental_amount,deposit_amount) values ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','[2030-04-01,2030-04-02)',1,0)$$,'42501',null::text,'RLS denies insert even after an accidental grant');
reset role;
select is((select status from public.bookings where id='83000000-0000-4000-8000-000000000001'),'requested'::public.booking_status,'Forged payment status and deletion changed nothing');

select * from finish();
rollback;
