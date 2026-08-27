const test = require('node:test');
const assert = require('node:assert');
const { formatCents, parsePrice } = require('./money');

test('formats cents to rands', () => {
  assert.strictEqual(formatCents(18900), 'R189.00');
  assert.strictEqual(formatCents(50), 'R0.50');
  assert.strictEqual(formatCents(0), 'R0.00');
});

// A dish with no price (market price, a section note) must render as nothing, not as free.
test('no price is null, not R0.00', () => {
  assert.strictEqual(formatCents(null), null);
  assert.strictEqual(formatCents(undefined), null);
});

test('parses the shapes a person actually types', () => {
  assert.strictEqual(parsePrice('189'), 18900);
  assert.strictEqual(parsePrice('189.50'), 18950);
  assert.strictEqual(parsePrice('189,50'), 18950); // en-ZA decimal comma
  assert.strictEqual(parsePrice('R189.50'), 18950);
  assert.strictEqual(parsePrice(' R 189 '), 18900);
});

test('blank is null but junk is NaN', () => {
  assert.strictEqual(parsePrice(''), null);
  assert.strictEqual(parsePrice(null), null);
  // Distinct from null on purpose: a mistyped price must 400, not quietly become a free dish.
  assert.ok(Number.isNaN(parsePrice('abc')));
  assert.ok(Number.isNaN(parsePrice('18.999')));
});

test('round-trips through format', () => {
  assert.strictEqual(formatCents(parsePrice('189.50')), 'R189.50');
});
