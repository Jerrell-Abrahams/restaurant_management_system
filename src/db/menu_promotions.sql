-- A single marketing label per menu item, restaurant-set (e.g. "Best Seller", "New"). Run in the
-- same project as schema.sql, after it. See src/lib/promotions.js for the fixed vocabulary -- the
-- check constraint below is the same list enforced a second time, at the one layer a crafted
-- request straight to PostgREST could otherwise bypass Express entirely.

alter table restaurant.menu_items
  -- Null is "no label" -- the default, and every dish that exists before this migration. One
  -- label, not a list: a dish pinned as both "Best Seller" and "New" is a badge pile-up the
  -- compact item row has no room for, and a single picklist is what the admin UI needs anyway.
  add column if not exists promo_label text;

alter table restaurant.menu_items
  drop constraint if exists menu_items_promo_label_check,
  add constraint menu_items_promo_label_check check (
    promo_label is null or promo_label in (
      'best_seller', 'popular', 'new', 'special', 'limited_time', 'chefs_choice'
    )
  );

-- If the API answers "Could not find the column 'promo_label' in the schema cache":
--   notify pgrst, 'reload schema';
