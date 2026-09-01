-- A diner-initiated "still waiting" signal on their own open request, distinct from
-- acknowledged_at (staff resolving it) and from created_at (the true, honest wait-time clock the
-- kitchen display sorts and pulses by -- a nudge must never reset it, or a table that has waited
-- ten minutes could look freshly called). Run in the same project as schema.sql and
-- service_requests.sql, after both.
--
-- Null = never nudged. Set once per nudge tap (routes/public.js), read by
-- admin/src/pages/Display.jsx to badge the card and re-chime, without changing where it sorts.

alter table restaurant.service_requests
  add column if not exists nudged_at timestamptz;

-- If the API answers "Could not find the column 'nudged_at' in the schema cache":
--   notify pgrst, 'reload schema';
