const test = require('node:test');
const assert = require('node:assert');
const { ALLERGENS, ALLERGEN_LABELS, DIETS, allergensError, dietError, spiceLevelOf } = require('./dietary');

test('every allergen has a display label', () => {
  ALLERGENS.forEach((a) => assert.ok(ALLERGEN_LABELS[a], `missing label for "${a}"`));
});

test('allergensError accepts undefined, an empty list, and a list of recognised values', () => {
  assert.strictEqual(allergensError(undefined), null);
  assert.strictEqual(allergensError([]), null);
  assert.strictEqual(allergensError(['gluten', 'milk']), null);
});

test('allergensError rejects a non-array and an unrecognised value', () => {
  assert.ok(allergensError('gluten'));
  assert.ok(allergensError(['gluten', 'shellfish'])); // "shellfish" -- not this list's spelling
});

test('dietError accepts unset, empty string, vegetarian and vegan', () => {
  assert.strictEqual(dietError(undefined), null);
  assert.strictEqual(dietError(null), null);
  assert.strictEqual(dietError(''), null);
  DIETS.forEach((d) => assert.strictEqual(dietError(d), null));
});

test('dietError rejects anything else, including the word "meat"', () => {
  // There is no 'meat' value -- see dietary.js for why. A caller sending it should get a clean
  // 400, not have it silently accepted as a fourth state.
  assert.ok(dietError('meat'));
  assert.ok(dietError('Vegan')); // case-sensitive, same posture as isKind in serviceRequests.js
});

test('spiceLevelOf clamps to 0..3 rather than rejecting', () => {
  assert.strictEqual(spiceLevelOf(undefined), 0);
  assert.strictEqual(spiceLevelOf(-5), 0);
  assert.strictEqual(spiceLevelOf(2), 2);
  assert.strictEqual(spiceLevelOf(9), 3);
  assert.strictEqual(spiceLevelOf('not a number'), 0);
});
