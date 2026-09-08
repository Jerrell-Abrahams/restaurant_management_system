-- Size/portion pricing on a menu item: 300ml vs 500ml, half vs full rack, glass vs bottle. Run in
-- the same project as schema.sql, after it. See src/lib/variants.js for the shape and the limits.
--
-- A jsonb column, not a menu_item_variants child table, and that is the whole design decision:
-- this product has no cart and no ordering. Nothing multiplies a price, sums it, or puts it on a
-- bill -- price is display-only, and item_ratings hangs off menu_item_id (a diner rates the dish,
-- not the portion). So a variant needs no identity of its own: no id to reference, no row to
-- cascade, no position column (array order IS position). A table would buy referential integrity
-- for something nothing references, and cost CRUD routes, a reorder mechanic and a join in both
-- renderers. Promote it the day a variant needs an identity -- an order line, a stock count, its
-- own rating.

alter table restaurant.menu_items
  -- [{"label": "500ml", "price_cents": 3500}, ...]. Empty is the default and the state of every
  -- dish that exists before this migration -- "no sizes, just a price", which is most of a menu.
  --
  -- price_cents stays. It is still the price for the majority of dishes that have no sizes, and
  -- the two columns do not know about each other: the renderers show whichever is set. A dish
  -- with both shows both, which is a menu-writing mistake rather than a state to code around.
  add column if not exists price_variants jsonb not null default '[]'::jsonb;

alter table restaurant.menu_items
  drop constraint if exists menu_items_price_variants_check,
  -- ponytail: array + cap only. Per-element shape (label is a string, price_cents is a number) is
  -- checked in variants.js, because a check constraint cannot contain the subquery that
  -- jsonb_array_elements needs -- enforcing it here would mean an IMMUTABLE plpgsql function for
  -- a schema no untrusted role can reach (RLS deny-all, no grants to anon/authenticated). Add the
  -- function only if PostgREST is ever exposed to the browser.
  add constraint menu_items_price_variants_check check (
    jsonb_typeof(price_variants) = 'array' and jsonb_array_length(price_variants) <= 4
  );

-- If the API answers "Could not find the column 'price_variants' in the schema cache":
--   notify pgrst, 'reload schema';
