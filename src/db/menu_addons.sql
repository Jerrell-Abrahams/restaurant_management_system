-- Optional extras on a menu item: "Extra cheese +R10", "Add bacon +R15", "Swap chips for salad
-- +R0". Run in the same project as schema.sql, after it. See src/lib/variants.js for the shape
-- and the limits.
--
-- A jsonb column on the dish, for the same reason price_variants is one (menu_variants.sql has
-- the long version): nothing multiplies, sums or bills a price in this product, so an add-on
-- needs no identity -- no id to reference, no row to cascade, array order IS position.
--
-- Per-dish rather than a restaurant-wide add-on library that dishes point at, even though "Extra
-- cheese" will be typed onto every burger. The library is a table, CRUD routes, a picker in the
-- modal and a join in both renderers, bought to save re-typing two short words. Promote it when
-- an owner actually complains about editing the same extra on twelve dishes.
alter table restaurant.menu_items
  -- [{"label": "Extra cheese", "price_cents": 1000}, ...]. Empty is the default and the state of
  -- every dish that exists before this migration.
  --
  -- price_cents 0 is legitimate here and renders as "free", unlike on a size. A no-charge swap is
  -- a real menu line; a blank price is still rejected, so a forgotten price cannot become one.
  add column if not exists add_ons jsonb not null default '[]'::jsonb;

alter table restaurant.menu_items
  drop constraint if exists menu_items_add_ons_check,
  -- ponytail: array + cap only, matching menu_variants.sql -- per-element shape is checked in
  -- variants.js, because a check constraint cannot contain the subquery jsonb_array_elements
  -- needs. Same trade, same upgrade path: an IMMUTABLE plpgsql function, only if PostgREST is
  -- ever exposed to the browser.
  add constraint menu_items_add_ons_check check (
    jsonb_typeof(add_ons) = 'array' and jsonb_array_length(add_ons) <= 6
  );

-- If the API answers "Could not find the column 'add_ons' in the schema cache":
--   notify pgrst, 'reload schema';
