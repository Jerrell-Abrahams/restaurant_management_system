const test = require('node:test');
const assert = require('node:assert');
const { normalizeSlug, slugError } = require('./slug');

test('lowercases and hyphenates', () => {
  assert.strictEqual(normalizeSlug("Mario's Kitchen"), 'mario-s-kitchen');
  assert.strictEqual(normalizeSlug('  Reiger Park Grill  '), 'reiger-park-grill');
});

test('collapses punctuation runs and trims edge hyphens', () => {
  assert.strictEqual(normalizeSlug('--The  Spot!!! --'), 'the-spot');
  assert.strictEqual(normalizeSlug('a & b'), 'a-b');
});

// Case difference must not create a second restaurant: the DB has a unique index on lower(slug)
// and this is the API-side half of that same rule.
test('case variants normalize to the same slug', () => {
  assert.strictEqual(normalizeSlug('MARIOS'), normalizeSlug('marios'));
});

test('rejects blank, too-short, too-long and reserved', () => {
  assert.strictEqual(slugError(''), 'slug is required');
  assert.strictEqual(slugError('a'), 'slug must be at least 2 characters');
  assert.ok(slugError('x'.repeat(41)).includes('40 characters'));
  assert.ok(slugError('api').includes('reserved'));
});

test('accepts a normal slug', () => {
  assert.strictEqual(slugError(normalizeSlug("Mario's Kitchen")), null);
});
