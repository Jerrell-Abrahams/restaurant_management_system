-- Diner "call the waiter" / "bring the bill" pings, and the kitchen display that clears them. Run
-- in the same project as schema.sql, after it.
--
-- Deliberately NOT a visit. A visit is feedback: it carries a rating, it feeds the console's
-- averages, and it lives forever. A service request has no score, is answered in minutes and is
-- then over. Writing these into `visits` would put score-less rows into every denominator the
-- restaurant is paying to look at. Nothing joins the two tables.

alter table restaurant.restaurants
  -- Off until an owner asks for it. dinerPage.js only renders the buttons when this is true, and
  -- routes/public.js re-checks it on every POST -- the menu is cached 60s at a shared edge, so a
  -- phone can be holding a page whose buttons outlive the toggle. The client check is a courtesy;
  -- the server check is the rule.
  add column if not exists service_requests_enabled boolean not null default false;

create table if not exists restaurant.service_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant.restaurants(id) on delete cascade,
  -- Free text as the diner typed it, sanitised and capped in src/lib/serviceRequests.js. Not a
  -- foreign key to a table roster -- there is no such table, and requiring a restaurant to set one
  -- up before the first button works would be the same mistake per-table QR codes already were,
  -- cut from this product's original scope. See MEMORY.md restaurant-product-shape.
  table_label text not null,
  -- A check constraint rather than a Postgres enum type: a third kind later is one constraint
  -- change in a follow-up file, not a type migration on a live column.
  kind text not null check (kind in ('waiter', 'bill')),
  -- Null = still on the display. Set once, by a staff tap or the cron sweep. Never unset.
  acknowledged_at timestamptz,
  acknowledged_by uuid references restaurant.staff(user_id) on delete set null,
  -- COMPLIANCE.md 5: every diner submission stores a salted hash and a timestamp, detection only.
  ip_hash text,
  created_at timestamptz not null default now()
);

-- THE anti-spam mechanism: a bored diner tapping "Call waiter" twenty times must produce one card.
--
-- A partial unique index rather than a check-then-insert in the route: the API runs as Vercel
-- serverless functions, so two taps a moment apart can land in two concurrent invocations with no
-- shared memory -- a SELECT-then-INSERT has a real race window and would let both through. The
-- index makes the database itself the single writer that can decide, atomically, whether this
-- table already has an open request of this kind. routes/public.js catches the resulting 23505 and
-- answers the diner ok either way -- a duplicate is not an error from where they are standing.
--
-- "Unacknowledged" is also a better dedupe window than any fixed number of seconds: the card is
-- either still on the screen or it is not, and there is no gap where a second real request should
-- have gone through but silently didn't.
create unique index if not exists service_requests_open_idx
  on restaurant.service_requests (restaurant_id, lower(table_label), kind)
  where acknowledged_at is null;

-- The display's poll (restaurant_id + acknowledged_at is null, newest first) rides the leading
-- columns of the index above, so no second index is needed for reads.

-- Same posture as every other table in this schema: RLS on, zero policies, deny-all for anon and
-- authenticated. Only service_role (held by Express) can reach this. See schema.sql's RLS section.
alter table restaurant.service_requests enable row level security;
grant all on restaurant.service_requests to service_role;
alter default privileges in schema restaurant grant all on tables to service_role;

-- If the API answers "Could not find the table 'service_requests' in the schema cache":
--   notify pgrst, 'reload schema';
