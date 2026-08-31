-- Dietary metadata on a menu item: spice level, allergens, vegetarian/vegan. Run in the same
-- project as schema.sql, after it. See src/lib/dietary.js for the fixed vocabulary these columns
-- are restricted to -- the check constraints below are the same list enforced a second time, at
-- the one layer a crafted request straight to PostgREST could otherwise bypass Express entirely.

alter table restaurant.menu_items
  -- 0 = not spicy, renders no flame icon at all. 1..3 = mild/medium/hot.
  add column if not exists spice_level int not null default 0,
  -- Not a third value 'meat' -- see dietary.js. Null is "no dietary claim", not "contains meat".
  add column if not exists diet text,
  -- Empty, not null -- "no allergens declared" is the default for every existing dish, and the
  -- diner-facing renderer treats an empty list as "not specified", never as "verified allergen-free".
  add column if not exists allergens text[] not null default '{}';

alter table restaurant.menu_items
  drop constraint if exists menu_items_spice_level_check,
  add constraint menu_items_spice_level_check check (spice_level between 0 and 3);

alter table restaurant.menu_items
  drop constraint if exists menu_items_diet_check,
  add constraint menu_items_diet_check check (diet is null or diet in ('vegetarian', 'vegan'));

alter table restaurant.menu_items
  drop constraint if exists menu_items_allergens_check,
  add constraint menu_items_allergens_check check (
    allergens <@ array[
      'gluten', 'crustaceans', 'molluscs', 'eggs', 'fish', 'peanuts', 'tree_nuts',
      'soybeans', 'milk', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin'
    ]::text[]
  );

-- If the API answers "Could not find the column 'spice_level' in the schema cache":
--   notify pgrst, 'reload schema';
