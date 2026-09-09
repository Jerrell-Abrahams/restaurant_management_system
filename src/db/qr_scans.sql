-- QR scan events. One row per real page load of the diner menu. Run in the same project as
-- schema.sql, after it.
--
-- Written from a client-side beacon (see the inline <script> in dinerPage.js), not counted in
-- routes/public.js's GET /:slug handler -- that route ships `Cache-Control: public, max-age=60`,
-- so most requests inside any given 60s window never reach the origin at all. A counter in the
-- route handler would undercount almost every real scan; the beacon runs in the browser
-- regardless of whether the HTML it's attached to was a cache hit.
--
-- Fresh navigations only. The beacon skips reloads and back/forward restores (it reads
-- PerformanceNavigationTiming.type), so a diner refreshing mid-meal is not a second row -- the
-- admin reads this as "how many people arrived", not "how many page loads". A genuine re-scan
-- still counts: the camera opening the URL is a fresh navigation even when it reuses the tab.
-- No other dedup -- ip_hash is useless for it behind restaurant NAT, where every table shares
-- one IP.

create table if not exists restaurant.qr_scans (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant.restaurants(id) on delete cascade,
  -- COMPLIANCE.md 5: every diner submission stores a salted hash and a timestamp, detection only
  -- -- never displayed, never exported, never used to identify a person.
  ip_hash text,
  created_at timestamptz not null default now()
);

-- Covers both reads the admin summary route needs: today's count (restaurant_id + created_at
-- range) and the lifetime count (restaurant_id alone rides the leading column).
create index if not exists qr_scans_restaurant_created_idx
  on restaurant.qr_scans (restaurant_id, created_at);

-- Same posture as every other table in this schema: RLS on, zero policies, deny-all for anon and
-- authenticated. Only service_role (held by Express) can reach this. See schema.sql's RLS section.
alter table restaurant.qr_scans enable row level security;
grant all on restaurant.qr_scans to service_role;

-- Housekeeping, not a legal obligation -- there is no personal information in this table (just a
-- salted hash), unlike visits.contact. Purged after 30 days by the daily cron (src/routes/cron.js)
-- purely to keep the table small, same posture as service_requests' own retention sweep.

-- If the API answers "Could not find the table 'qr_scans' in the schema cache":
--   notify pgrst, 'reload schema';
