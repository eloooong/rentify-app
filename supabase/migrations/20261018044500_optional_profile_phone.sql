-- Make omission mean NULL, matching the generated RPC argument contract.
begin;
create or replace function public.save_my_profile(p_display_name text, p_phone text default null)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if not public.can_edit_own_profile() then
    raise exception 'Verified active account required' using errcode = '42501';
  end if;
  insert into public.profiles (id, display_name)
  values ((select auth.uid()), p_display_name)
  on conflict (id) do update set display_name = excluded.display_name;
  insert into public.profile_private (user_id, phone)
  values ((select auth.uid()), p_phone)
  on conflict (user_id) do update set phone = excluded.phone;
end;
$$;
commit;
