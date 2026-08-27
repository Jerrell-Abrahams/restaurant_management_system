-- QR assets. Run in the same project as schema.sql, after it.
--
-- Nothing in this repo draws a QR code any more. They are generated in
-- subscription_management_system and uploaded here by a ComplexAI admin. This schema stores what
-- was uploaded and nothing else -- there is no fallback generator, deliberately: a fallback that
-- silently produced a DIFFERENT code than the one on the coasters is the worst outcome available
-- on a printed artifact.
--
-- Why a side table rather than two columns on restaurants: lib/restaurants.js load() selects `*`
-- and runs on every diner scan. Base64 on that row would ship tens of KB down the hottest path in
-- the product, on every scan, for bytes only the console ever reads.

create table if not exists restaurant.qr_codes (
  -- A restaurant has exactly one code, forever -- it encodes an immutable URL. Keyed by the
  -- restaurant rather than an id of its own, so a second code cannot exist.
  restaurant_id uuid primary key references restaurant.restaurants(id) on delete cascade,

  -- Markup exactly as uploaded. The console renders it only via <img src="data:...">, never
  -- inlined, because SVG is executable markup -- see src/lib/qr.js.
  svg text not null,

  -- Base64, no `data:` prefix. Text rather than bytea because PostgREST returns bytea as a
  -- `\x89504e47...` hex string that every caller would then have to unwrap by hand.
  png text not null,

  updated_at timestamptz not null default now()
);

-- Both columns are NOT NULL on purpose: the two files are written as a pair. A half-updated row
-- is how one restaurant ends up holding another restaurant's PNG, and nothing downstream of here
-- would ever catch it.

-- Same posture as every other table in this schema: deny-all for anon and authenticated, and the
-- service-role key bypasses RLS entirely. See the RLS section of schema.sql for the reasoning.
alter table restaurant.qr_codes enable row level security;

-- schema.sql sets default privileges for service_role, which covers tables created afterwards by
-- the same role. Granted explicitly anyway -- if this file is ever run by a different role, a
-- missing grant surfaces as `permission denied for schema restaurant`, which reads like an RLS
-- problem and is not one.
grant all on restaurant.qr_codes to service_role;

-- If the API answers `Could not find the table 'restaurant.qr_codes' in the schema cache` right
-- after this runs, PostgREST has not picked the new table up yet:
--
--   notify pgrst, 'reload schema';
