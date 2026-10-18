begin;

-- Starter reference templates, not demo users/listings or payment policies.
insert into public.categories(name,slug,attribute_schema) values
('Cameras','cameras','{"version":1,"fields":[{"key":"brand","label":"Brand","type":"text","required":true},{"key":"model","label":"Model","type":"text","required":true},{"key":"lens_mount","label":"Lens mount","type":"text","required":false}]}'),
('Laptops','laptops','{"version":1,"fields":[{"key":"brand","label":"Brand","type":"text","required":true},{"key":"model","label":"Model","type":"text","required":true},{"key":"ram_gb","label":"RAM (GB)","type":"integer","required":true,"min":1,"max":256},{"key":"storage_gb","label":"Storage (GB)","type":"integer","required":false,"min":1,"max":8192}]}'),
('Drones','drones','{"version":1,"fields":[{"key":"brand","label":"Brand","type":"text","required":true},{"key":"model","label":"Model","type":"text","required":true},{"key":"battery_cycles","label":"Battery cycles","type":"integer","required":false,"min":0,"max":10000}]}'),
('VR headsets','vr-headsets','{"version":1,"fields":[{"key":"brand","label":"Brand","type":"text","required":true},{"key":"model","label":"Model","type":"text","required":true},{"key":"connection","label":"Connection","type":"select","required":true,"options":["standalone","pc","console"]}]}')
on conflict do nothing;

alter table public.listings alter column owner_id set default auth.uid();
alter table public.listings add constraint listings_content_limits check (
  char_length(title) between 3 and 120 and title = btrim(title)
  and char_length(description) <= 5000
  and char_length(condition) between 1 and 80
  and char_length(pickup_area) between 3 and 120
  and octet_length(attributes::text) <= 8192
) not valid;
alter table public.listing_photos add constraint listing_photo_position_limit check (position < 8) not valid;
create unique index listing_photos_storage_path_key on public.listing_photos(storage_path);

create function public.valid_catalog_attributes(category uuid, attrs jsonb)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare template jsonb; field jsonb; value jsonb; key text;
begin
  select attribute_schema into template from public.categories where id = category;
  if template is null or jsonb_typeof(attrs) <> 'object' then return false; end if;
  if template = '{}'::jsonb then return attrs = '{}'::jsonb; end if;
  if template->>'version' <> '1' or jsonb_typeof(template->'fields') <> 'array' then return false; end if;
  for key in select jsonb_object_keys(attrs) loop
    if not exists(select 1 from jsonb_array_elements(template->'fields') f where f->>'key' = key) then return false; end if;
  end loop;
  for field in select jsonb_array_elements(template->'fields') loop
    value := attrs->(field->>'key');
    if value is null then
      if coalesce((field->>'required')::boolean,false) then return false; end if;
      continue;
    end if;
    if field->>'type' = 'text' then
      if jsonb_typeof(value) <> 'string' or char_length(value#>>'{}') not between 1 and 80
        or btrim(value#>>'{}') = '' then return false; end if;
    elsif field->>'type' = 'integer' then
      if jsonb_typeof(value) <> 'number' then return false; end if;
      if (value::text)::numeric <> floor((value::text)::numeric)
        or (value::text)::numeric < (field->>'min')::numeric
        or (value::text)::numeric > (field->>'max')::numeric then return false; end if;
    elsif field->>'type' = 'select' then
      if jsonb_typeof(value) <> 'string' or not (field->'options' @> jsonb_build_array(value)) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_catalog_attributes(uuid,jsonb) from public,anon;
grant execute on function public.valid_catalog_attributes(uuid,jsonb) to authenticated,service_role;

create function public.can_manage_listing(listing uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_edit_own_profile() and exists (
    select 1 from public.listings l join public.profiles p on p.id=l.owner_id
    where l.id=listing and l.owner_id=(select auth.uid()) and l.status <> 'hidden'
  );
$$;
revoke all on function public.can_manage_listing(uuid) from public,anon;
grant execute on function public.can_manage_listing(uuid) to authenticated;

create function public.guard_listing()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists(select 1 from public.listing_photos where listing_id=old.id) then
      raise exception 'Remove listing photos first' using errcode='23503';
    end if;
    return old;
  end if;
  if current_user in ('anon','authenticated') then
    if new.status = 'hidden' or (tg_op='UPDATE' and old.status='hidden') then
      raise exception 'Protected moderation status' using errcode='42501';
    end if;
    if tg_op='UPDATE' and (new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
      or new.created_at is distinct from old.created_at) then
      raise exception 'Protected listing identity' using errcode='42501';
    end if;
  end if;
  if not public.valid_catalog_attributes(new.category_id,new.attributes) then
    raise exception 'Invalid category attributes' using errcode='23514';
  end if;
  if new.status='published' and not exists(select 1 from public.listing_photos where listing_id=new.id) then
    raise exception 'Upload a photo before publishing' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger guard_listing before insert or update or delete on public.listings
for each row execute function public.guard_listing();
revoke all on function public.guard_listing() from public,anon,authenticated;

grant select on public.listings,public.listing_photos to anon,authenticated;
grant insert(owner_id,category_id,title,description,daily_price_amount,deposit_amount,currency,condition,attributes,pickup_area,status),
  update(category_id,title,description,daily_price_amount,deposit_amount,currency,condition,attributes,pickup_area,status)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;
-- The profile projection hides suspended owners from anon; use a trusted check
-- here too, so a suspended owner cannot broaden public visibility for themselves.
create function public.is_public_listing(listing uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listings l join public.profiles p on p.id=l.owner_id
    where l.id=listing and l.status='published' and p.account_status='active');
$$;
revoke all on function public.is_public_listing(uuid) from public;
grant execute on function public.is_public_listing(uuid) to anon,authenticated;
create policy listings_public_read on public.listings for select to anon,authenticated
using (public.is_public_listing(id));
create policy listings_owner_read on public.listings for select to authenticated using (owner_id=(select auth.uid()));
create policy listings_owner_insert on public.listings for insert to authenticated with check (
  owner_id=(select auth.uid()) and status='draft' and (select public.can_edit_own_profile())
  and exists(select 1 from public.profiles where id=(select auth.uid()))
);
create policy listings_owner_update on public.listings for update to authenticated
using (public.can_manage_listing(id)) with check (public.can_manage_listing(id));
create policy listings_owner_delete on public.listings for delete to authenticated
using (status='draft' and public.can_manage_listing(id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('listing-images','listing-images',false,5242880,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.can_write_listing_image(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
    and split_part(object_name,'/',1)=(select auth.uid())::text
    and exists(select 1 from public.listings l where l.id::text=split_part(object_name,'/',2)
      and public.can_manage_listing(l.id));
$$;
revoke all on function public.can_write_listing_image(text) from public,anon;
grant execute on function public.can_write_listing_image(text) to authenticated;
create function public.can_read_listing_image(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listings l where l.id::text=split_part(object_name,'/',2)
    and l.owner_id::text=split_part(object_name,'/',1) and (
      l.owner_id=(select auth.uid()) or (
        public.is_public_listing(l.id) and exists(select 1 from public.listing_photos p where p.listing_id=l.id and p.storage_path=object_name)
      )
    ));
$$;
revoke all on function public.can_read_listing_image(text) from public;
grant execute on function public.can_read_listing_image(text) to anon,authenticated;
create policy listing_images_read on storage.objects for select to anon,authenticated
using (bucket_id='listing-images' and public.can_read_listing_image(name));
create policy listing_images_insert on storage.objects for insert to authenticated
with check (bucket_id='listing-images' and public.can_write_listing_image(name));
-- No UPDATE policy: uploads are immutable and upsert is intentionally disabled.
create policy listing_images_delete on storage.objects for delete to authenticated using (
  bucket_id='listing-images' and public.can_write_listing_image(name)
  and not exists(select 1 from public.listing_photos where storage_path=name)
);

create function public.guard_listing_photo()
returns trigger language plpgsql security invoker set search_path='' as $$
declare listing_owner uuid; listing_status text;
begin
  if tg_op='DELETE' then
    select status into listing_status from public.listings where id=old.listing_id for update;
    if listing_status='published' and (select count(*) from public.listing_photos where listing_id=old.listing_id) <= 1 then
      raise exception 'Pause listing before removing its last photo' using errcode='23514';
    end if;
    return old;
  end if;
  select owner_id into listing_owner from public.listings where id=new.listing_id for update;
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.listing_id is distinct from old.listing_id
    or new.storage_path is distinct from old.storage_path or new.created_at is distinct from old.created_at) then
    raise exception 'Photo ownership and path are immutable' using errcode='42501';
  end if;
  if new.storage_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
    or split_part(new.storage_path,'/',1) <> listing_owner::text
    or split_part(new.storage_path,'/',2) <> new.listing_id::text
    or not exists(select 1 from storage.objects where bucket_id='listing-images' and name=new.storage_path
      and metadata->>'mimetype'='image/webp' and (metadata->>'size')::bigint between 1 and 5242880) then
    raise exception 'Upload an owned WebP image first' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger guard_listing_photo before insert or update or delete on public.listing_photos
for each row execute function public.guard_listing_photo();
revoke all on function public.guard_listing_photo() from public,anon,authenticated;
grant insert(listing_id,storage_path,position),update(position),delete on public.listing_photos to authenticated;
create policy listing_photos_read on public.listing_photos for select to anon,authenticated using (
  exists(select 1 from public.listings where id=listing_id)
);
create policy listing_photos_insert on public.listing_photos for insert to authenticated with check (public.can_manage_listing(listing_id));
create policy listing_photos_update on public.listing_photos for update to authenticated
using (public.can_manage_listing(listing_id)) with check (public.can_manage_listing(listing_id));
create policy listing_photos_delete on public.listing_photos for delete to authenticated using (public.can_manage_listing(listing_id));

commit;
