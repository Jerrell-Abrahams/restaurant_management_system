-- Restaurant menu + diner feedback.
--
-- TARGET PROJECT: the complex management Supabase project (ref khkjzsddztzaofbnrkue), which
-- already hosts `funeral` and `auto_repair` alongside the apartment system's `public`. This is the
-- next schema in that pattern. Run in its SQL Editor.
--
-- Two things to do outside this file, both required:
--
--   1. Project Settings -> API -> Exposed schemas: add `restaurant`. PostgREST only serves
--      schemas on that list, and the service-role key does not change that -- it bypasses RLS,
--      not schema exposure. Without it every query 404s.
--   2. Add yourself to restaurant.staff -- snippet at the bottom. Nothing is reachable until you
--      do, including for you.
--
-- Re-runnable: every table and index is `if not exists`, and there are no policies to drop (see
-- the RLS section for why). A second run will not drop data, but it will not alter an existing
-- column either -- column changes go in a new file alongside this one.
--
-- Billing note: subscriptions live in a DIFFERENT project (subscription_management_system, ref
-- ocbdjpfskwcuzdlcryvv), a separate Postgres instance. A cross-project foreign key is impossible,
-- so restaurants.subscription_id is a bare uuid and the paid/lapsed decision is an HTTP call.
-- See src/lib/billing.js.

create schema if not exists restaurant;

-- Fails fast, and readably, if this is pasted into the wrong project.
do $$
begin
  if to_regclass('public.tenants') is null then
    raise exception 'Wrong Supabase project. This schema belongs in the complex management project (ref khkjzsddztzaofbnrkue) -- public.tenants is not here. See README.md > Setup.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Who is allowed in
-- ---------------------------------------------------------------------------
-- A shared Supabase project means a shared auth.users. Anyone who can sign into the apartment
-- system, the funeral app or the auto-repair app on this project is `authenticated` here too --
-- so being signed in proves nothing. Membership of this table is the actual boundary, and
-- src/middleware/adminAuth.js rejects anyone who is not in it before any route runs.
--
-- is_admin separates ComplexAI from customers: an admin sees and edits every restaurant, everyone
-- else sees the one whose owner_user_id is theirs.
create table if not exists restaurant.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
create table if not exists restaurant.restaurants (
  id uuid primary key default gen_random_uuid(),
  -- Points at a subscriptions row in ANOTHER project, so no foreign key is possible. Nullable:
  -- a restaurant is created and its menu built before billing is attached, and lib/billing.js
  -- reads null as "not gated" rather than "lapsed" so that does not lock anyone out.
  subscription_id uuid,
  -- The one person who signs in for this restaurant. Not a membership table: a restaurant is one
  -- paying customer. Add a join table the day one genuinely needs two logins.
  owner_user_id uuid references restaurant.staff(user_id) on delete set null,
  name text not null,
  -- Printed on physical paper coasters that sit on tables for years. IMMUTABLE once a batch is
  -- printed, which in practice means immutable from creation -- there is no way for this system
  -- to know a print run happened. No route exposes an update to this column, deliberately.
  slug text not null,
  google_place_id text,
  alert_email text,
  alert_threshold int not null default 3,
  -- The entire alert-batching mechanism, in one column. See src/lib/alerts.js for why this beats
  -- per-row alerted_at flags and a scheduler.
  last_alert_at timestamptz,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness. The API lowercases before insert; this index is the backstop and
-- is what a duplicate slug trips (mapped to 409 in routes/admin.js).
create unique index if not exists restaurants_slug_lower_idx on restaurant.restaurants (lower(slug));
create index if not exists restaurants_owner_idx on restaurant.restaurants (owner_user_id);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table if not exists restaurant.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant.restaurants(id) on delete cascade,
  name text not null,
  position int not null default 0
);

create table if not exists restaurant.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references restaurant.menu_categories(id) on delete cascade,
  name text not null,
  description text,
  -- Integer cents. Never a float: 0.1 + 0.2 on a menu total is a support ticket.
  price_cents int,
  -- The "86 the ribs" toggle. Earns its place on day one -- a menu that offers what the kitchen
  -- cannot cook is the complaint this product exists to catch.
  --
  -- It gates ordering and the rating prompt, NOT whether a rating is valid: someone who ate the
  -- dish at 19:00 can still rate it after it sells out at 20:00. Discontinuing a dish for good is
  -- archived_at below, and that does block new ratings. See routes/public.js.
  available boolean not null default true,
  position int not null default 0,
  -- Soft delete. A hard delete would orphan every rating the dish ever earned and silently
  -- rewrite last month's analytics -- the one number the restaurant is paying to look at.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
-- One scan = one visit. Groups a diner's taps so "one diner rated four dishes" is distinguishable
-- from "four diners each rated one" -- without it every average is weighted by appetite.
create table if not exists restaurant.visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant.restaurants(id) on delete cascade,
  -- Null until they rate the visit itself. A visit that only rated dishes is still a visit.
  rating int check (rating between 1 and 5),
  comment text,
  -- POPIA: personal information. Offered only at rating <= 3, with a stated purpose, and purged
  -- by the daily cron at 90 days. See COMPLIANCE.md.
  contact text,
  -- Salted hash (IP_HASH_SALT). Abuse detection only -- never displayed, never exported.
  ip_hash text,
  user_agent text,
  resolved boolean not null default false,
  resolved_note text,
  created_at timestamptz not null default now()
);

create index if not exists visits_restaurant_created_idx
  on restaurant.visits (restaurant_id, created_at desc);

create table if not exists restaurant.item_ratings (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references restaurant.visits(id) on delete cascade,
  -- No cascade: items are archived, never deleted, so this never fires. It is here to make the
  -- delete fail loudly if anyone ever adds a hard-delete route.
  menu_item_id uuid not null references restaurant.menu_items(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  -- Re-tapping a different emoji updates; it never appends. Also caps what a single diner can do
  -- to one dish's average at exactly one vote.
  unique (visit_id, menu_item_id)
);

create index if not exists item_ratings_item_idx on restaurant.item_ratings (menu_item_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Enabled on every table, with NO policies at all. That is deliberate, and it is a considered
-- divergence from funeral/schema.sql rather than an omission.
--
-- The funeral app's browser talks to PostgREST directly, so it needs `to authenticated using
-- (funeral.is_staff())` policies. This app's browser never does: the console calls Express, which
-- holds the service-role key and does its own authz (src/lib/restaurants.js, adminAuth.js), and
-- the diner surface is server-rendered. So the anon and authenticated roles need exactly zero
-- access here.
--
-- RLS on + no policies is deny-all for anon and authenticated, while service_role bypasses RLS
-- entirely. That is stricter than a policy set and has nothing to get subtly wrong -- which
-- matters more than usual on a shared project, where `authenticated` includes every user of three
-- other applications.
alter table restaurant.staff enable row level security;
alter table restaurant.restaurants enable row level security;
alter table restaurant.menu_categories enable row level security;
alter table restaurant.menu_items enable row level security;
alter table restaurant.visits enable row level security;
alter table restaurant.item_ratings enable row level security;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- A new schema grants nothing to anybody by default. Without these, every query comes back
-- `permission denied for schema restaurant` (SQLSTATE 42501) -- which reads like an RLS problem
-- and is not one. RLS filters rows for a role that can already reach the table; a missing grant
-- means the role cannot see the schema at all.
--
-- Deliberate divergence from funeral/ and auto_repair/, which grant to anon + authenticated +
-- service_role because their browsers query PostgREST directly and lean on policies to gate it.
-- This app's browser never touches PostgREST: the console goes through Express and the diner page
-- is server-rendered, both under the service-role key. So anon and authenticated get nothing here
-- -- not even schema usage. On a project whose auth.users is shared with three other
-- applications, that is worth having on top of the deny-all RLS above.
grant usage on schema restaurant to service_role;
grant all on all tables in schema restaurant to service_role;
grant all on all sequences in schema restaurant to service_role;
alter default privileges in schema restaurant grant all on tables to service_role;
alter default privileges in schema restaurant grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Bootstrap -- run this, or nothing works, including for you
-- ---------------------------------------------------------------------------
-- Makes you a ComplexAI admin. Staff rows are added here in the SQL editor rather than through
-- the app, so a compromised console session cannot write itself an admin.
--
-- insert into restaurant.staff (user_id, name, is_admin)
-- select id, 'Jerrell', true from auth.users where email = 'jerrellabrahams50@gmail.com'
-- on conflict (user_id) do update set is_admin = true;
--
-- Then, per restaurant owner (create the auth user first, in Authentication -> Users):
--
-- insert into restaurant.staff (user_id, name, is_admin)
-- select id, 'Mario', false from auth.users where email = 'owner@mariosgrill.co.za'
-- on conflict (user_id) do nothing;
