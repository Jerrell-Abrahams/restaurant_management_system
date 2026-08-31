const test = require('node:test');
const assert = require('node:assert');
const { PROMO_LABELS, PROMO_LABEL_TEXT, promoLabelError } = require('./promotions');

test('every promo label has a display label', () => {
  PROMO_LABELS.forEach((l) => assert.ok(PROMO_LABEL_TEXT[l], `missing text for "${l}"`));
});

test('promoLabelError accepts unset, empty string, and every recognised label', () => {
  assert.strictEqual(promoLabelError(undefined), null);
  assert.strictEqual(promoLabelError(null), null);
  assert.strictEqual(promoLabelError(''), null);
  PROMO_LABELS.forEach((l) => assert.strictEqual(promoLabelError(l), null));
});

test('promoLabelError rejects an unrecognised value', () => {
  assert.ok(promoLabelError('discounted'));
  assert.ok(promoLabelError('Best Seller')); // case-sensitive, same posture as dietError
});
