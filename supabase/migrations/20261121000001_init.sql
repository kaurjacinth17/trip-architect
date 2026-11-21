-- Trip Architect: accounts and live collaboration (upgrade Phase 8).
-- Row Level Security on every table, explicit GRANTs (new Supabase projects don't grant table access by default).
-- Google Places content: only place IDs, plus coordinates with *_fetched_at (kept ≤30 days; see api/cron/keepalive.ts).
-- Never names, ratings, reviews, hours or photos of Google places.

create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------------------------------- people
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 80),
  avatar_url    text check (avatar_url is null or avatar_url ~ '^https://'),
  upi_id        text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$'),
  phone         text check (phone is null or phone ~ '^\+?[0-9 ()-]{6,20}$'),
  share_contact boolean not null default false,   -- show UPI ID and phone to people in my trips
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --------------------------------------------------------------------------------------------- trips
create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  start_date   date,
  pace         text not null default 'balanced' check (pace in ('relaxed', 'balanced', 'packed')),
  group_kind   text not null default 'couple',
  travellers   text[] not null default '{}' check (cardinality(travellers) between 1 and 30),
  prefs        jsonb not null default '{}',
  budget_total numeric(14, 2) not null default 0 check (budget_total >= 0),
  budget       jsonb not null default '{}',
  budget_mode  jsonb not null default '{}',
  currency     text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  notes        text not null default '' check (char_length(notes) <= 20000),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);

create table public.trip_members (
  trip_id         uuid not null references public.trips (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('owner', 'editor', 'viewer')),
  traveller_index integer check (traveller_index is null or traveller_index >= 0),
  joined_at       timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user on public.trip_members (user_id);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  token_hash  text not null unique,                -- sha256 of the token; the token itself is only in the link
  role        text not null check (role in ('editor', 'viewer')),
  email       text,
  expires_at  timestamptz not null,
  max_uses    integer not null default 10 check (max_uses between 1 and 100),
  uses        integer not null default 0,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index invites_trip on public.invites (trip_id);

-- ------------------------------------------------------------------------------------- destinations
-- Shared geographic records (curated keys like 'jaipur', Google 'g:<placeId>', custom 'c:<id>').
create table public.destinations (
  key          text primary key check (char_length(key) <= 300),
  kind         text not null check (kind in ('curated', 'google', 'custom')),
  place_id     text,
  name         text not null,
  region       text,
  country      text,
  country_code text,
  dest_type    text not null default 'other',
  timezone     text,
  currency     text not null default 'INR',
  climate      jsonb,
  climate_period text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.trip_destinations (
  trip_id          uuid not null references public.trips (id) on delete cascade,
  dest_key         text not null references public.destinations (key),
  position         double precision not null,
  center_lat       double precision,
  center_lng       double precision,
  viewport         jsonb,
  coords_fetched_at timestamptz,
  days             int[],                  -- user-chosen recommended stay [min, max]
  cost             jsonb,                  -- user-entered daily costs
  primary key (trip_id, dest_key)
);

-- ---------------------------------------------------------------------------------- plan content
-- Content ids are the app's own short ids (text), unique within a trip.
create table public.days (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  id         text not null,
  position   double precision not null,
  dest_key   text not null,
  label      text not null default '',
  start_min  integer,
  end_min    integer,
  start_loc  jsonb,
  end_loc    jsonb,
  pace       text,
  version    integer not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (trip_id, id)
);

create table public.items (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  id         text not null,
  day_id     text,                         -- null: in the wishlist
  position   double precision not null,    -- fractional, so inserts never renumber
  pid        text,                         -- curated place id
  gid        text,                         -- Google place ID (name shown live, never stored)
  title      text not null default '',
  cat        text not null,
  start_min  integer not null default 540,
  dur        integer not null default 60,
  cost       numeric(12, 2) not null default 0,
  lat        double precision,
  lng        double precision,
  coords_fetched_at timestamptz,
  area       text not null default '',
  dest_key   text,
  pri        text not null default 'nice',
  note       text not null default '',
  done       boolean not null default false,
  locked     boolean not null default false,
  booking    jsonb,
  link       text,
  tags       text[],
  stay_ref   jsonb,
  version    integer not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (trip_id, id),
  foreign key (trip_id, day_id) references public.days (trip_id, id) on delete set null (day_id)
);

create table public.stays (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  id         text not null,
  name       text not null default '',     -- empty for a Google hotel (name shown live from gid)
  gid        text,
  area       text not null default '',
  dest_key   text not null,
  lat        double precision,
  lng        double precision,
  coords_fetched_at timestamptz,
  price      numeric(12, 2) not null default 0,   -- typed by the user
  nights     integer not null default 1,
  night_from integer,
  night_to   integer,
  rooms      integer,
  checkin    date,
  checkout   date,
  rating     numeric(3, 1) not null default 0,     -- the user's own rating
  link       text not null default '',
  notes      text not null default '',
  status     text not null default 'shortlisted' check (status in ('idea', 'shortlisted', 'booked')),
  position   double precision not null default 0,
  version    integer not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (trip_id, id)
);

create table public.pack_items (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  id          text not null,
  cat         text not null,
  name        text not null,
  qty         integer not null default 1,
  done        boolean not null default false,
  custom      boolean not null default false,
  assigned_to integer,                      -- traveller index
  shared      boolean not null default false,
  position    double precision not null default 0,
  version     integer not null default 1,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (trip_id, id)
);

-- --------------------------------------------------------------------------------------- expenses
create table public.expenses (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  id          text not null,
  description text not null default '',
  amount      numeric(14, 2) not null check (amount > 0),
  currency    text not null default 'INR',
  amount_inr  numeric(14, 2),
  fx_date     date,
  category    text not null,
  spent_on    date,
  spent_at    text check (spent_at is null or spent_at ~ '^[0-2][0-9]:[0-5][0-9]$'),
  item_id     text,
  notes       text,
  split_kind  text not null default 'equal' check (split_kind in ('equal', 'exact', 'percent', 'shares', 'adjust')),
  receipt_path text,
  history     jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz,
  version     integer not null default 1,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (trip_id, id)
);

create table public.expense_payers (
  trip_id    uuid not null,
  expense_id text not null,
  traveller  integer not null check (traveller >= 0),
  amount     numeric(14, 2) not null check (amount >= 0),
  primary key (trip_id, expense_id, traveller),
  foreign key (trip_id, expense_id) references public.expenses (trip_id, id) on delete cascade
);

create table public.settlements (
  trip_id        uuid not null references public.trips (id) on delete cascade,
  id             text not null,
  from_traveller integer not null,
  to_traveller   integer not null,
  amount         numeric(14, 2) not null check (amount > 0),
  paid_on        date,
  method         text not null check (method in ('upi', 'cash', 'bank', 'other')),
  note           text not null default '',
  expense_id     text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  primary key (trip_id, id),
  check (from_traveller <> to_traveller)
);

create table public.expense_shares (
  trip_id       uuid not null,
  expense_id    text not null,
  traveller     integer not null check (traveller >= 0),
  value         numeric(14, 4),            -- exact amount / percentage / shares / adjustment; null for equal
  settled_at    timestamptz,
  settlement_id text,
  primary key (trip_id, expense_id, traveller),
  foreign key (trip_id, expense_id) references public.expenses (trip_id, id) on delete cascade
);

-- ----------------------------------------------------------------------------------- conversation
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  target_kind text not null check (target_kind in ('trip', 'day', 'item', 'expense', 'stay')),
  target_id   text not null,
  body        text not null check (char_length(body) between 1 and 4000),
  mentions    uuid[] not null default '{}',
  author_id   uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
create index comments_target on public.comments (trip_id, target_kind, target_id);

create table public.polls (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 300),
  kind       text not null default 'item' check (kind in ('item', 'stay', 'other')),
  closes_at  timestamptz,
  closed_at  timestamptz,
  winner_option_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls (id) on delete cascade,
  trip_id  uuid not null references public.trips (id) on delete cascade,
  label    text not null check (char_length(label) between 1 and 200),   -- free text (never a Google name)
  place_id text,                                                           -- or a Google place ID (name shown live)
  position integer not null default 0
);

create table public.votes (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  target_kind text not null check (target_kind in ('wish', 'stay', 'poll_option')),
  target_id   text not null,
  poll_id     uuid references public.polls (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (trip_id, target_kind, target_id, user_id)
);
create unique index votes_one_per_poll on public.votes (poll_id, user_id) where poll_id is not null;

create table public.activity_log (
  id        bigint generated always as identity primary key,
  trip_id   uuid not null references public.trips (id) on delete cascade,
  user_id   uuid references auth.users (id) on delete set null,
  at        timestamptz not null default now(),
  entity    text not null,
  entity_id text not null,
  action    text not null check (action in ('insert', 'update', 'delete')),
  diff      jsonb not null           -- {"field": [old, new], ...}; full row for insert/delete
);
create index activity_trip_at on public.activity_log (trip_id, at desc);

-- ---------------------------------------------------------------------------------------- helpers
create function public.trip_role(t uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.trip_members m where m.trip_id = t and m.user_id = auth.uid()
$$;
create function public.can_read(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members m where m.trip_id = t and m.user_id = auth.uid())
$$;
create function public.can_edit(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members m where m.trip_id = t and m.user_id = auth.uid() and m.role in ('owner', 'editor'))
$$;

-- People in my trips, with UPI ID and phone only when they chose to share them.
create function public.trip_people(t uuid)
returns table (user_id uuid, display_name text, avatar_url text, upi_id text, phone text, role text, traveller_index integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_url,
         case when p.share_contact or p.id = auth.uid() then p.upi_id end,
         case when p.share_contact or p.id = auth.uid() then p.phone end,
         m.role, m.traveller_index
  from public.trip_members m join public.profiles p on p.id = m.user_id
  where m.trip_id = t and public.can_read(t)
$$;

-- Bump version / updated_at / updated_by on every update (conflict detection compares versions).
create function public.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create function public.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- The creator of a trip becomes its owner.
create function public.add_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end $$;

-- A profile row for every new account (name and avatar from the sign-in provider).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''), 80),
          case when new.raw_user_meta_data ->> 'avatar_url' ~ '^https://' then new.raw_user_meta_data ->> 'avatar_url' end)
  on conflict do nothing;
  return new;
end $$;

-- Activity feed: one row per change, with the fields that changed.
create function public.log_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  d jsonb := '{}';
  k text;
  tid uuid := coalesce(n ->> 'trip_id', o ->> 'trip_id', n ->> 'id', o ->> 'id')::uuid;
begin
  -- rows removed because the whole trip was deleted: nothing to log (the trip's log goes with it)
  if tg_op = 'DELETE' and not exists (select 1 from public.trips where id = tid) then return null; end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('version', 'updated_at', 'updated_by') and (o -> k) is distinct from (n -> k) then
        d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if d = '{}' then return null; end if;
  else
    d := coalesce(n, o);
  end if;
  insert into public.activity_log (trip_id, user_id, entity, entity_id, action, diff)
  values (tid, auth.uid(), tg_table_name,
          coalesce(n ->> 'id', o ->> 'id', n ->> 'expense_id', o ->> 'expense_id'), lower(tg_op), d);
  return null;
end $$;

create trigger trips_owner after insert on public.trips for each row execute function public.add_owner();
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch();
do $$
declare t text;
begin
  foreach t in array array['trips', 'days', 'items', 'stays', 'pack_items', 'expenses'] loop
    execute format('create trigger %I_version before update on public.%I for each row execute function public.bump_version()', t, t);
  end loop;
  foreach t in array array['days', 'items', 'stays', 'pack_items', 'expenses', 'settlements'] loop
    execute format('create trigger %I_activity after insert or update or delete on public.%I for each row execute function public.log_activity()', t, t);
  end loop;
  execute 'create trigger trips_activity after update on public.trips for each row execute function public.log_activity()';
end $$;

-- ------------------------------------------------------------------------------- row level security
alter table public.profiles          enable row level security;
alter table public.trips             enable row level security;
alter table public.trip_members      enable row level security;
alter table public.invites           enable row level security;
alter table public.destinations      enable row level security;
alter table public.trip_destinations enable row level security;
alter table public.days              enable row level security;
alter table public.items             enable row level security;
alter table public.stays             enable row level security;
alter table public.pack_items        enable row level security;
alter table public.expenses          enable row level security;
alter table public.expense_payers    enable row level security;
alter table public.expense_shares    enable row level security;
alter table public.settlements       enable row level security;
alter table public.comments          enable row level security;
alter table public.polls             enable row level security;
alter table public.poll_options      enable row level security;
alter table public.votes             enable row level security;
alter table public.activity_log      enable row level security;

-- profiles: your own row only (others are read through trip_people(), which masks contact details)
create policy "own profile: read"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- trips
create policy "members read trips"  on public.trips for select to authenticated using (public.can_read(id));
create policy "create own trips"    on public.trips for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "editors update trips" on public.trips for update to authenticated using (public.can_edit(id)) with check (public.can_edit(id));
create policy "owners delete trips" on public.trips for delete to authenticated using (public.trip_role(id) = 'owner');

-- members: visible to members; joining and role changes go through the invite/members functions (service role).
create policy "members read members" on public.trip_members for select to authenticated using (public.can_read(trip_id));
create policy "leave a trip" on public.trip_members for delete to authenticated using (user_id = (select auth.uid()) and role <> 'owner');

-- invites: the owner sees and revokes them; they're created and redeemed by the server functions.
create policy "owners read invites"   on public.invites for select to authenticated using (public.trip_role(trip_id) = 'owner');
create policy "owners revoke invites" on public.invites for update to authenticated using (public.trip_role(trip_id) = 'owner') with check (public.trip_role(trip_id) = 'owner');

-- destinations: shared records any signed-in user can read or add (never edit someone else's)
create policy "read destinations" on public.destinations for select to authenticated using (true);
create policy "add destinations"  on public.destinations for insert to authenticated with check (created_by = (select auth.uid()));
create policy "fix own destinations" on public.destinations for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

-- trip content: members read, owners and editors write
do $$
declare t text;
begin
  foreach t in array array['trip_destinations', 'days', 'items', 'stays', 'pack_items', 'expenses', 'expense_payers', 'expense_shares', 'settlements'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.can_read(trip_id))', t);
    execute format('create policy "editors insert" on public.%I for insert to authenticated with check (public.can_edit(trip_id))', t);
    execute format('create policy "editors update" on public.%I for update to authenticated using (public.can_edit(trip_id)) with check (public.can_edit(trip_id))', t);
    execute format('create policy "editors delete" on public.%I for delete to authenticated using (public.can_edit(trip_id))', t);
  end loop;
end $$;

-- comments: any member (viewers too) can comment; authors edit their own; authors and editors resolve; owners moderate
create policy "members read comments" on public.comments for select to authenticated using (public.can_read(trip_id));
create policy "members comment" on public.comments for insert to authenticated with check (public.can_read(trip_id) and author_id = (select auth.uid()) and resolved_at is null);
create policy "authors and editors update comments" on public.comments for update to authenticated
  using (public.can_read(trip_id) and (author_id = (select auth.uid()) or public.can_edit(trip_id)))
  with check (public.can_read(trip_id) and (author_id = (select auth.uid()) or public.can_edit(trip_id)));
create policy "authors and owners delete comments" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.trip_role(trip_id) = 'owner');

-- polls: editors create and close; everyone in the trip votes
create policy "members read polls" on public.polls for select to authenticated using (public.can_read(trip_id));
create policy "editors create polls" on public.polls for insert to authenticated with check (public.can_edit(trip_id) and created_by = (select auth.uid()));
create policy "editors update polls" on public.polls for update to authenticated using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));
create policy "editors delete polls" on public.polls for delete to authenticated using (public.can_edit(trip_id));
create policy "members read options" on public.poll_options for select to authenticated using (public.can_read(trip_id));
create policy "editors write options" on public.poll_options for insert to authenticated
  with check (public.can_edit(trip_id) and exists (select 1 from public.polls p where p.id = poll_id and p.trip_id = poll_options.trip_id));
create policy "editors delete options" on public.poll_options for delete to authenticated using (public.can_edit(trip_id));

create policy "members read votes" on public.votes for select to authenticated using (public.can_read(trip_id));
create policy "members vote" on public.votes for insert to authenticated
  with check (public.can_read(trip_id) and user_id = (select auth.uid())
    and (poll_id is null or exists (select 1 from public.polls p where p.id = poll_id and p.trip_id = votes.trip_id and p.closed_at is null and (p.closes_at is null or p.closes_at > now()))));
create policy "change own vote" on public.votes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.can_read(trip_id));
create policy "remove own vote" on public.votes for delete to authenticated using (user_id = (select auth.uid()));

create policy "members read activity" on public.activity_log for select to authenticated using (public.can_read(trip_id));

-- ------------------------------------------------------------------------------------------- grants
grant usage on schema public to anon, authenticated, service_role;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke insert, update, delete on public.activity_log from authenticated;      -- written by triggers only
revoke insert, delete on public.invites from authenticated;                    -- created by the invite function
revoke insert, update on public.trip_members from authenticated;               -- joined via the invite function
revoke insert, delete on public.profiles from authenticated;                   -- created on sign-up
revoke execute on all functions in schema public from public, anon;
grant execute on function public.trip_role(uuid), public.can_read(uuid), public.can_edit(uuid), public.trip_people(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------ realtime
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['trips', 'trip_destinations', 'days', 'items', 'stays', 'pack_items', 'expenses', 'expense_payers', 'expense_shares', 'settlements', 'comments', 'polls', 'poll_options', 'votes', 'trip_members'] loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;
-- Deletes must carry the trip id for realtime filters
alter table public.days replica identity full;
alter table public.items replica identity full;
alter table public.stays replica identity full;
alter table public.pack_items replica identity full;
alter table public.expenses replica identity full;
alter table public.expense_payers replica identity full;
alter table public.expense_shares replica identity full;
alter table public.settlements replica identity full;
alter table public.trip_destinations replica identity full;
alter table public.comments replica identity full;
alter table public.votes replica identity full;
alter table public.poll_options replica identity full;

-- ---------------------------------------------------------------------------------- receipts storage
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;
    -- objects are stored as <trip_id>/<expense_id>/<file>
    execute $p$create policy "members read receipts" on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and public.can_read(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "editors add receipts" on storage.objects for insert to authenticated
      with check (bucket_id = 'receipts' and public.can_edit(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "editors remove receipts" on storage.objects for delete to authenticated
      using (bucket_id = 'receipts' and public.can_edit(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;
