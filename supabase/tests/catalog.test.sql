begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
grant usage on schema extensions to anon,authenticated;
insert into auth.users(id,email_confirmed_at) values
('71000000-0000-4000-8000-000000000001',now()),
('71000000-0000-4000-8000-000000000002',now()),
('71000000-0000-4000-8000-000000000003',null),
('71000000-0000-4000-8000-000000000004',now());
insert into public.profiles(id,display_name) values
('71000000-0000-4000-8000-000000000001','Catalog owner'),
('71000000-0000-4000-8000-000000000002','Catalog visitor'),
('71000000-0000-4000-8000-000000000003','Unverified catalog owner');
insert into public.listings(id,owner_id,category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes)
select '72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',id,'Fixture camera',12000,0,'Good','Campus','{"brand":"Canon","model":"R6"}' from categories where slug='cameras';
insert into storage.objects(bucket_id,name,metadata) values
('listing-images','71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000001.webp','{"mimetype":"image/webp","size":100}'),
('listing-images','71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000002.webp','{"mimetype":"image/webp","size":100}');
insert into public.listing_photos(id,listing_id,storage_path,position) values
('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000001.webp',0);

select is((select count(*) from public.categories where slug in ('cameras','laptops','drones','vr-headsets')),4::bigint,'Four starter templates exist');
select ok((select not public from storage.buckets where id='listing-images'),'Listing bucket is private');
select is((select file_size_limit from storage.buckets where id='listing-images'),4194304::bigint,'Bucket limits uploads to 4 MiB');
select ok(public.valid_catalog_attributes((select id from categories where slug='laptops'),'{"brand":"Dell","model":"XPS","ram_gb":16}'),'Valid typed attributes accepted');
select ok(not public.valid_catalog_attributes((select id from categories where slug='laptops'),'{"brand":"Dell","model":"XPS","ram_gb":"16"}'),'String cannot replace an integer');
select ok(not public.valid_catalog_attributes((select id from categories where slug='cameras'),'{"brand":"Canon","model":"R6","secret":true}'),'Unknown category keys denied');
select ok(not public.valid_catalog_attributes((select id from categories where slug='cameras'),'{}'),'Required category fields enforced');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from public.listings where id='72000000-0000-4000-8000-000000000001'),0::bigint,'Anonymous cannot see draft');
select is((select count(*) from public.listing_photos where listing_id='72000000-0000-4000-8000-000000000001'),0::bigint,'Anonymous cannot see draft photo metadata');
select is((select count(*) from storage.objects where name like '71000000-0000-4000-8000-000000000001/%'),0::bigint,'Anonymous cannot read private draft files');
select throws_ok($$insert into public.listings(title) values ('Anonymous')$$,'42501',null::text,'Anonymous listing writes denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.listings where id='72000000-0000-4000-8000-000000000001'),0::bigint,'Other user cannot see draft');
select ok(not public.can_write_listing_image('71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000001.webp'),'Other user cannot write owner file namespace');
select throws_ok($$insert into public.listings(owner_id,category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes) select '71000000-0000-4000-8000-000000000001',id,'Forged owner',100,0,'Good','Campus','{"brand":"Canon","model":"R6"}' from public.categories where slug='cameras'$$,'42501',null::text,'Forged listing owner denied');

select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.listings where id='72000000-0000-4000-8000-000000000001'),1::bigint,'Owner can read draft');
select is((select count(*) from storage.objects where name like '71000000-0000-4000-8000-000000000001/%'),2::bigint,'Owner can read own referenced and orphan uploads');
select lives_ok($$insert into public.listings(category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes) select id,'New camera',100,0,'Good','Campus','{"brand":"Canon","model":"R8"}' from public.categories where slug='cameras'$$,'Verified owner can create draft');
select throws_ok($$update public.listings set status='published' where title='New camera' and owner_id=auth.uid()$$,'23514',null::text,'Cannot publish without a photo');
select throws_ok($$update public.listings set attributes='{"brand":"Canon"}' where id='72000000-0000-4000-8000-000000000001'$$,'23514',null::text,'Direct updates cannot omit required attributes');
select throws_ok($$update public.listings set status='hidden' where id='72000000-0000-4000-8000-000000000001'$$,'42501',null::text,'Owner cannot claim moderation status');
select throws_ok($$update public.listings set owner_id='71000000-0000-4000-8000-000000000002' where id='72000000-0000-4000-8000-000000000001'$$,'42501',null::text,'Owner transfer is not granted');
select throws_ok($$insert into public.listing_photos(listing_id,storage_path,position) values ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000002.webp',8)$$,'23514',null::text,'Photo positions cap the collection at eight');
select throws_ok($$insert into public.listing_photos(listing_id,storage_path,position) values ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000000.webp',1)$$,'23514',null::text,'Metadata cannot attach a missing storage object');
select lives_ok($$update public.listings set status='published' where id='72000000-0000-4000-8000-000000000001'$$,'Owner can publish with uploaded photo');
select throws_ok($$delete from public.listing_photos where id='74000000-0000-4000-8000-000000000001'$$,'23514',null::text,'Cannot remove published last photo');
select throws_ok($$update public.listing_photos set storage_path='replacement.webp' where id='74000000-0000-4000-8000-000000000001'$$,'42501',null::text,'Photo path cannot be replaced');
reset role;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from public.listings where id='72000000-0000-4000-8000-000000000001'),1::bigint,'Published listing becomes public');
select is((select count(*) from public.listing_photos where listing_id='72000000-0000-4000-8000-000000000001'),1::bigint,'Published photo metadata becomes public');
select is((select count(*) from storage.objects where name like '71000000-0000-4000-8000-000000000001/%'),1::bigint,'Only attached published image is public; orphan stays private');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
with changed as (update public.listings set title='Stolen camera' where id='72000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed),0::bigint,'Other user cannot edit public listing');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select throws_ok($$insert into public.listings(category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes) select id,'Unverified camera',100,0,'Good','Campus','{"brand":"Canon","model":"R6"}' from public.categories where slug='cameras'$$,'42501',null::text,'Unverified user cannot create listings');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
select throws_ok($$insert into public.listings(category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes) select id,'No profile camera',100,0,'Good','Campus','{"brand":"Canon","model":"R6"}' from public.categories where slug='cameras'$$,'42501',null::text,'Profile completion required before listing creation');
reset role;

update public.profiles set account_status='suspended' where id='71000000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from public.listings where id='72000000-0000-4000-8000-000000000001'),0::bigint,'Suspended owner published listing is hidden');
select is((select count(*) from storage.objects where name like '71000000-0000-4000-8000-000000000001/%'),0::bigint,'Suspended owner files are hidden publicly');
reset role;
update public.profiles set account_status='active' where id='71000000-0000-4000-8000-000000000001';
update public.listings set status='hidden' where id='72000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
with changed as (update public.listings set status='published' where id='72000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed),0::bigint,'Owner cannot undo moderation');
select ok(not public.can_write_listing_image('71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000001.webp'),'Moderated listing cannot receive uploads');
reset role;
update public.listings set status='draft' where id='72000000-0000-4000-8000-000000000001';
insert into public.bookings(listing_id,owner_id,renter_id,rental_period,rental_amount,deposit_amount)
select id,owner_id,'71000000-0000-4000-8000-000000000002','[2026-12-01,2026-12-03)',100,0
from public.listings where title='New camera' and owner_id='71000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$delete from public.listing_photos where id='74000000-0000-4000-8000-000000000001'$$,'Owner can detach a draft photo before storage cleanup');
select throws_ok($$delete from public.listings where id='72000000-0000-4000-8000-000000000001'$$,'23503',null::text,'Remaining uploads prevent deletion and preserve owner cleanup access');
select throws_ok($$delete from public.listings where title='New camera' and owner_id=auth.uid()$$,'23503',null::text,'Booking references prevent listing deletion');
reset role;
select * from finish();
rollback;
