-- Keep app uploads and responses within Vercel's function payload ceiling.
begin;
update storage.buckets set file_size_limit=4194304 where id='listing-images';

create or replace function public.guard_listing_photo()
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
      and metadata->>'mimetype'='image/webp' and (metadata->>'size')::bigint between 1 and 4194304) then
    raise exception 'Upload an owned WebP image first' using errcode='23514';
  end if;
  return new;
end;
$$;

commit;
