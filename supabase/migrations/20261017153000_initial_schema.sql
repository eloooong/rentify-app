-- B0.3 foundation only: no client grants/policies or usable booking/payment API yet.
begin;

create type public.booking_status as enum (
  'requested', 'accepted', 'declined', 'expired', 'cancelled',
  'paid', 'handed_over', 'returned', 'completed', 'disputed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  avatar_path text,
  role text not null default 'user' check (role in ('user', 'admin')),
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep phone/verification details out of the future public profile read surface.
create table public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null unique check (btrim(name) <> ''),
  slug text not null unique check (btrim(slug) <> ''),
  attribute_schema jsonb not null default '{}' check (jsonb_typeof(attribute_schema) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id <> id)
);

-- All monetary amounts use integer minor units (PHP centavos by default).
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  daily_price_amount integer not null check (daily_price_amount > 0),
  deposit_amount integer not null check (deposit_amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  condition text not null check (btrim(condition) <> ''),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  pickup_area text not null check (btrim(pickup_area) <> ''),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null check (btrim(storage_path) <> ''),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, position)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  renter_id uuid not null references public.profiles(id) on delete restrict,
  rental_period daterange not null check (
    not isempty(rental_period) and not lower_inf(rental_period) and not upper_inf(rental_period)
  ),
  status public.booking_status not null default 'requested',
  rental_amount integer not null check (rental_amount >= 0),
  deposit_amount integer not null check (deposit_amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  cancellation_terms jsonb not null default '{}' check (jsonb_typeof(cancellation_terms) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_id <> renter_id),
  foreign key (listing_id, owner_id) references public.listings(id, owner_id) on delete restrict
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  type text not null check (type in ('rental', 'deposit', 'refund', 'payout')),
  amount integer not null check (amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (
    status in ('pending', 'authorized', 'succeeded', 'failed', 'cancelled', 'refunded')
  ),
  gateway text,
  gateway_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.condition_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  stage text not null check (stage in ('handover', 'return')),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array'),
  photo_paths text[] not null default '{}',
  notes text not null default '',
  owner_confirmed_at timestamptz,
  renter_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, stage)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (btrim(body) <> ''),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  subject_id uuid not null references public.profiles(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, author_id),
  check (author_id <> subject_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (btrim(type) <> ''),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  listing_id uuid references public.listings(id) on delete restrict,
  reported_user_id uuid references public.profiles(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  reason text not null check (btrim(reason) <> ''),
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(listing_id, reported_user_id, booking_id) = 1)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (btrim(action) <> ''),
  target_table text not null check (btrim(target_table) <> ''),
  target_id uuid,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_parent_idx on public.categories(parent_id);
create index listings_owner_idx on public.listings(owner_id);
create index listings_category_status_idx on public.listings(category_id, status);
create index bookings_listing_idx on public.bookings(listing_id);
create index bookings_owner_idx on public.bookings(owner_id);
create index bookings_renter_idx on public.bookings(renter_id);
create index payments_booking_idx on public.payments(booking_id, created_at);
create index messages_conversation_idx on public.messages(conversation_id, created_at, id);
create index messages_sender_idx on public.messages(sender_id);
create index reviews_author_idx on public.reviews(author_id);
create index reviews_subject_idx on public.reviews(subject_id);
create index notifications_user_idx on public.notifications(user_id, created_at);
create index reports_reporter_idx on public.reports(reporter_id);
create index reports_listing_idx on public.reports(listing_id);
create index reports_user_idx on public.reports(reported_user_id);
create index reports_booking_idx on public.reports(booking_id);
create index reports_resolver_idx on public.reports(resolved_by);
create index reports_status_idx on public.reports(status, created_at);
create index audit_log_actor_idx on public.audit_log(actor_id, created_at);
create index audit_log_target_idx on public.audit_log(target_table, target_id);

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Explicit table list avoids changing Supabase-managed or unrelated objects.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'profile_private', 'categories', 'listings', 'listing_photos',
    'bookings', 'payments', 'condition_reports', 'conversations', 'messages',
    'reviews', 'notifications', 'reports', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name
    );
  end loop;
end;
$$;

-- Trusted backend may append/read audit events, but cannot rewrite or delete them.
revoke update, delete on public.audit_log from service_role;

commit;
