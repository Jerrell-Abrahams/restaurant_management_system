-- Per-section serving hours (e.g. a "Breakfast" section only served 07:00-11:00). Run in the same
-- project as schema.sql, after it.
--
-- Same jsonb shape as restaurants.hours, validated by the same hoursError() in src/lib/hours.js --
-- that function was already generic (day-keyed periods), not restaurant-specific, so this reuses
-- it rather than writing a second validator for the same shape.
--
-- Null = no schedule, the section always shows normally (today's behaviour, unchanged). An object
-- with every day empty (`{}`) is not a distinct "paused" flag -- it is the same shape saying "never
-- open", which status() already resolves to permanently closed. The admin console's "Pause
-- section" button is just this: no second column for a state the existing shape already expresses.
alter table restaurant.menu_categories
  add column if not exists hours jsonb;

-- If the API answers "Could not find the column 'hours' in the schema cache":
--   notify pgrst, 'reload schema';
