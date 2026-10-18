-- B1.2: explicit public columns, owner-only private data, and atomic completion.
begin;

alter table public.profiles add constraint profiles_display_name_format check (
  char_length(display_name) between 1 and 80
  and display_name = btrim(display_name)
  and display_name !~ '[[:cntrl:]]'
) not valid;
alter table public.profile_private add constraint profile_private_phone_format check (
  phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'
) not valid;
-- NOT VALID preserves legacy rows; every new/changed row is still checked.

create function public.can_edit_own_profile()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  ) and not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_status <> 'active'
  );
$$;
revoke all on function public.can_edit_own_profile() from public, anon;
grant execute on function public.can_edit_own_profile() to authenticated;

-- Defense in depth: even an accidentally broadened column grant cannot let
-- API roles change trusted privileges, verification, or identity ownership.
create function public.guard_profile_fields()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.role <> 'user' or new.account_status <> 'active' then
        raise exception 'Protected profile fields' using errcode = '42501';
      end if;
    elsif new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.account_status is distinct from old.account_status then
      raise exception 'Protected profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_profile_fields before insert or update on public.profiles
for each row execute function public.guard_profile_fields();
revoke all on function public.guard_profile_fields() from public, anon, authenticated;

create function public.guard_private_profile_fields()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.phone_verified_at is not null then
        raise exception 'Protected verification field' using errcode = '42501';
      end if;
    elsif new.user_id is distinct from old.user_id
      or new.phone_verified_at is distinct from old.phone_verified_at then
      raise exception 'Protected verification field' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;
create trigger guard_private_profile_fields before insert or update on public.profile_private
for each row execute function public.guard_private_profile_fields();
revoke all on function public.guard_private_profile_fields() from public, anon, authenticated;

-- SELECT * deliberately fails. Publish only this explicit safe projection.
grant select (id, display_name, avatar_path, created_at, updated_at)
  on public.profiles to anon, authenticated;
grant insert (id, display_name), update (display_name)
  on public.profiles to authenticated;
grant select (user_id, phone, phone_verified_at), insert (user_id, phone), update (phone)
  on public.profile_private to authenticated;

create policy profiles_public_read on public.profiles for select
to anon, authenticated using (account_status = 'active');
create policy profiles_owner_read on public.profiles for select
to authenticated using (id = (select auth.uid()));
create policy profiles_owner_insert on public.profiles for insert
to authenticated with check (
  id = (select auth.uid()) and role = 'user' and account_status = 'active'
  and (select public.can_edit_own_profile())
);
create policy profiles_owner_update on public.profiles for update
to authenticated using (
  id = (select auth.uid()) and (select public.can_edit_own_profile())
) with check (
  id = (select auth.uid()) and (select public.can_edit_own_profile())
);
create policy profile_private_owner_read on public.profile_private for select
to authenticated using (user_id = (select auth.uid()));
create policy profile_private_owner_insert on public.profile_private for insert
to authenticated with check (
  user_id = (select auth.uid()) and (select public.can_edit_own_profile())
);
create policy profile_private_owner_update on public.profile_private for update
to authenticated using (
  user_id = (select auth.uid()) and (select public.can_edit_own_profile())
) with check (
  user_id = (select auth.uid()) and (select public.can_edit_own_profile())
);

create function public.save_my_profile(p_display_name text, p_phone text)
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
revoke all on function public.save_my_profile(text, text) from public, anon;
grant execute on function public.save_my_profile(text, text) to authenticated;

commit;
