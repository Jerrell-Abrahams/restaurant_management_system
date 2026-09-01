-- Per-restaurant kitchen-display auto-dismiss. Run in the same project as schema.sql and
-- service_requests.sql, after both.
--
-- Null = staff must clear every request by hand (today's behavior), still backstopped by cron's
-- fixed 4h sweepServiceRequests (routes/cron.js) for a display nobody is watching. A number means
-- admin.js's GET /restaurants/:id/service-requests acknowledges anything older than that many
-- minutes before it answers -- ridden in on the poll the kitchen display already makes every 5s,
-- not a new cron. Always measured from created_at, never nudged_at: see service_request_nudge.sql
-- -- a nudge must never look like a fresh call, in either direction.

alter table restaurant.restaurants
  add column if not exists service_requests_auto_dismiss_minutes int;

-- If the API answers "Could not find the column 'service_requests_auto_dismiss_minutes' in the
-- schema cache":
--   notify pgrst, 'reload schema';
