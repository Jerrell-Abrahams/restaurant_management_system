// Mirrors src/lib/dietary.js's ALLERGENS list. Duplicated on purpose, not imported across the
// boundary: the API and this console are two separate Vercel projects (see README.md) that talk
// only over HTTP, never share source files. The API's copy plus its DB check constraint
// (src/db/menu_dietary.sql) are the actual enforcement -- this one only needs to stay in sync
// closely enough to build a checklist that matches what the server will accept.
export const ALLERGENS = [
  'gluten', 'crustaceans', 'molluscs', 'eggs', 'fish', 'peanuts', 'tree_nuts',
  'soybeans', 'milk', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin',
];

export const ALLERGEN_LABELS = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', molluscs: 'Molluscs', eggs: 'Eggs', fish: 'Fish',
  peanuts: 'Peanuts', tree_nuts: 'Tree nuts', soybeans: 'Soybeans', milk: 'Dairy', celery: 'Celery',
  mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites', lupin: 'Lupin',
};
