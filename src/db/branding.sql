-- Restaurant branding shown on the diner-facing menu (src/lib/dinerPage.js): an uploaded logo and
-- a brand colour. Run in the same project as schema.sql, after it.
--
-- brand_hue is a HUE, 0-360, not a colour. The diner page derives four vars from it -- --accent,
-- --lit, --lit-bg, --card-open-border -- at the exact saturation/lightness stops the default brass
-- palette already sits on (see themeCss in dinerPage.js). Because only the hue varies and contrast
-- is a function of lightness, every AAA ratio in that page's STYLE block holds for any hue an owner
-- picks, which is what makes a free colour picker safe here where a free hex field would not be.
-- Null means "no theme": the default brass/ivory palette, byte-identical to a pre-branding render.
--
-- logo_url is normally only ever written by POST /restaurants/:id/logo (src/lib/logo.js validates
-- the bytes, the public "branding" Supabase Storage bucket holds them) but is a plain PATCH-able
-- column too -- the only way to clear it is PATCH logoUrl: null, the same escape hatch every other
-- nullable text field on this table already has.

alter table restaurant.restaurants
  add column if not exists logo_url text,
  add column if not exists brand_hue smallint check (brand_hue between 0 and 360);

-- Superseded by brand_hue before anything ever wrote to it: it held a preset key from a fixed list
-- of five accent colours, which the hue picker replaces outright. No data to migrate.
alter table restaurant.restaurants
  drop column if exists accent_color;

-- If the API answers "Could not find the column 'brand_hue' in the schema cache":
--   notify pgrst, 'reload schema';
