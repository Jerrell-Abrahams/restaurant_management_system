-- Restaurant-wide override for the kitchen display's chime (admin/src/pages/Display.jsx). Run in
-- the same project as schema.sql and service_requests.sql, after both.
--
-- The local per-device mute (localStorage, Display.jsx) already existed and is unchanged by this
-- -- this is a ceiling on top of it, not a replacement. Browser autoplay policy means sound can
-- never be forced ON for a device that hasn't unmuted itself with its own gesture, so the only
-- thing a restaurant-wide setting can honestly guarantee is silence. When true, Display.jsx
-- ignores the local toggle entirely and treats every device as muted; when false (the default),
-- behavior is exactly what it was before this column existed.

alter table restaurant.restaurants
  add column if not exists service_requests_chime_muted boolean not null default false;

-- If the API answers "Could not find the column 'service_requests_chime_muted' in the schema
-- cache":
--   notify pgrst, 'reload schema';
