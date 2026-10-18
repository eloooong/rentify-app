-- B2.1: structural safeguards and participant reads, not booking commands.
begin;

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

alter table public.bookings
  add column rental_days integer generated always as (
    case when isfinite(lower(rental_period)) and isfinite(upper(rental_period))
      then upper(rental_period) - lower(rental_period)
      else 0
    end
  ) stored not null,
  add constraint bookings_duration_days check (rental_days between 1 and 30),
  add constraint bookings_reserved_dates_excl exclude using gist (
    listing_id with =, rental_period with &&
  ) where (status in ('accepted','paid','handed_over','returned','disputed')),
  add constraint bookings_renter_open_dates_excl exclude using gist (
    listing_id with =, renter_id with =, rental_period with &&
  ) where (status in ('requested','accepted','paid','handed_over','returned','disputed'));

comment on column public.bookings.rental_days is
  'Server-generated inclusive rental days; rental_period stores [pickup, return + 1 day).';
comment on constraint bookings_reserved_dates_excl on public.bookings is
  'At most one overlapping reservation per physical-device listing, including concurrent writes.';
comment on constraint bookings_renter_open_dates_excl on public.bookings is
  'A renter cannot have duplicate overlapping open requests/reservations on the same listing.';

-- No authenticated INSERT/UPDATE/DELETE or mutating RPC is enabled in B2.1.
revoke all on public.bookings from public, anon, authenticated;
grant select on public.bookings to authenticated;
create policy bookings_participant_read on public.bookings for select
to authenticated using (
  owner_id = (select auth.uid()) or renter_id = (select auth.uid())
);

commit;
