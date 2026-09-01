-- Restaurant branding shown on the diner-facing menu (src/lib/dinerPage.js): an uploaded logo and
-- an accent color. Run in the same project as schema.sql, after it.
--
-- accent_color stores a preset KEY (src/lib/brandPresets.js), never a raw hex -- the diner page's
-- palette is hand-tuned to hold AAA contrast in both light and dark themes (see the contrast
-- comments in dinerPage.js's STYLE block), a guarantee an arbitrary owner-picked hex can't make.
-- Null in either column means "unchanged": today's text-only header and brass/ivory palette.
--
-- logo_url is normally only ever written by POST /restaurants/:id/logo (src/lib/logo.js validates
-- the bytes, the public "branding" Supabase Storage bucket holds them) but is a plain PATCH-able
-- column too -- the only way to clear it is PATCH logoUrl: null, the same escape hatch every other
-- nullable text field on this table already has.

alter table restaurant.restaurants
  add column if not exists logo_url text,
  add column if not exists accent_color text;

-- If the API answers "Could not find the column 'logo_url' in the schema cache":
--   notify pgrst, 'reload schema';
