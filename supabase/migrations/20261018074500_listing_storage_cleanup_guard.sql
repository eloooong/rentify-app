begin;
create function public.guard_listing_storage_delete()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from storage.objects where bucket_id='listing-images'
    and name like old.owner_id::text || '/' || old.id::text || '/%') then
    raise exception 'Remove remaining uploads before deleting listing' using errcode='23503';
  end if;
  return old;
end;
$$;
create trigger guard_listing_storage_delete before delete on public.listings
for each row execute function public.guard_listing_storage_delete();
revoke all on function public.guard_listing_storage_delete() from public,anon,authenticated;
commit;
