// A fixed vocabulary for a menu item's dietary metadata -- spice level, allergens, and a
// vegetarian/vegan flag. All three are admin-set (there is no diner-facing write path for any of
// them), so validation here exists to stop a crafted or buggy request from writing something onto
// a live menu that renders straight to a diner deciding what to eat.

// The EU-14 allergen list, not South Africa's narrower R146 regulation (~10 items -- no sesame,
// mustard, celery or lupin). EU-14 is a strict superset, so this stays R146-compliant, and it
// covers ingredients that do show up in local kitchens (tahini, mustard, stock celery) that R146
// alone would let through unflagged.
const ALLERGENS = [
  'gluten', 'crustaceans', 'molluscs', 'eggs', 'fish', 'peanuts', 'tree_nuts',
  'soybeans', 'milk', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin',
];

// Display labels -- "milk" reads as "Dairy" everywhere else in this product's copy.
const ALLERGEN_LABELS = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', molluscs: 'Molluscs', eggs: 'Eggs', fish: 'Fish',
  peanuts: 'Peanuts', tree_nuts: 'Tree nuts', soybeans: 'Soybeans', milk: 'Dairy', celery: 'Celery',
  mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites', lupin: 'Lupin',
};

// Not a third value 'meat' -- a meat dish makes no dietary claim at all, so "unset" already means
// that. Storing 'meat' would mean guessing it onto every existing dish nobody has ever tagged.
const DIETS = ['vegetarian', 'vegan'];

const MAX_SPICE = 3;

// null when valid, otherwise the reason -- same contract as slugError/hoursError/tableError,
// straight into a 400 body.
function allergensError(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return 'allergens must be a list';
  if (!value.every((a) => ALLERGENS.includes(a))) return 'allergens contains an unrecognised value';
  return null;
}

function dietError(value) {
  if (value === undefined || value === null || value === '') return null;
  return DIETS.includes(value) ? null : 'diet must be vegetarian, vegan, or left unset';
}

// Clamped, not rejected -- unlike diet/allergens, a stray out-of-range number here is not a sign
// of a broken admin UI, so it saturates at the top of the 0..3 scale instead of failing the save.
function spiceLevelOf(value) {
  const n = Number(value) || 0;
  return Math.max(0, Math.min(MAX_SPICE, Math.round(n)));
}

module.exports = { ALLERGENS, ALLERGEN_LABELS, DIETS, MAX_SPICE, allergensError, dietError, spiceLevelOf };
