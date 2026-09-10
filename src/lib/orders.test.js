const test = require('node:test');
const assert = require('node:assert');
const { normalizeLines, soldOutDish, MAX_LINES, MAX_QTY, MAX_ADD_ONS } = require('./orders');

const ID = '11111111-2222-3333-4444-555555555555';
const one = (over = {}) => [{ menu_item_id: ID, qty: 1, ...over }];

test('a plain line survives', () => {
  const { lines, error } = normalizeLines(one());
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(lines, [{ menu_item_id: ID, qty: 1, variant_label: null, add_ons: [], name: null }]);
});

test('the phone cannot send a price', () => {
  // The whole security posture of ordering in one assertion. A cart that says "Ribs, R1.00" must
  // reach place_order() carrying no number at all -- the database prices it from menu_items. If a
  // price_cents ever survives this function, someone can buy dinner for a cent.
  const { lines } = normalizeLines(one({
    price_cents: 1,
    unit_cents: 1,
    add_ons: [{ label: 'Extra cheese', price_cents: 1 }],
  }));
  assert.deepStrictEqual(lines[0].add_ons, [{ label: 'Extra cheese' }]);
  const flat = JSON.stringify(lines);
  assert.ok(!/price_cents/.test(flat), 'no price may reach the database call');
  assert.ok(!/unit_cents/.test(flat));
});

test('quantity has to be a whole number in range', () => {
  for (const qty of [0, -1, 1.5, MAX_QTY + 1, '2x', '', null, undefined, NaN, Infinity]) {
    assert.strictEqual(normalizeLines(one({ qty })).error, 'bad quantity', `qty ${String(qty)}`);
  }
  assert.strictEqual(normalizeLines(one({ qty: MAX_QTY })).error, undefined);
  // "2" is what an <input> gives you, and rejecting it would break the cart for no gain.
  assert.strictEqual(normalizeLines(one({ qty: '2' })).lines[0].qty, 2);
});

test('the dish id must be a uuid', () => {
  // Not decoration: this string is interpolated into a uuid cast in place_order(). A non-uuid
  // reaching Postgres is a 500 instead of a clean 400, and a caller probing that difference learns
  // things about the database it should not.
  for (const id of ['', 'abc', 1, null, undefined, {}, ID + 'x', '../' + ID]) {
    assert.strictEqual(normalizeLines(one({ menu_item_id: id })).error, 'bad item');
  }
});

test('an empty order is refused, and so is a flood', () => {
  assert.strictEqual(normalizeLines([]).error, 'order is empty');
  assert.strictEqual(normalizeLines(null).error, 'order is empty');
  assert.strictEqual(normalizeLines('ribs').error, 'order is empty');
  const flood = Array.from({ length: MAX_LINES + 1 }, () => one()[0]);
  assert.strictEqual(normalizeLines(flood).error, 'too many items');
});

test('sizes and extras are labels or nothing', () => {
  assert.strictEqual(normalizeLines(one({ variant_label: '500ml' })).lines[0].variant_label, '500ml');
  assert.strictEqual(normalizeLines(one({ variant_label: null })).lines[0].variant_label, null);
  assert.strictEqual(normalizeLines(one({ variant_label: '' })).error, 'bad size');
  assert.strictEqual(normalizeLines(one({ variant_label: 5 })).error, 'bad size');
  assert.strictEqual(normalizeLines(one({ add_ons: 'cheese' })).error, 'bad extras');
  assert.strictEqual(normalizeLines(one({ add_ons: [{ label: '' }] })).error, 'bad extras');
  const many = Array.from({ length: MAX_ADD_ONS + 1 }, () => ({ label: 'Extra cheese' }));
  assert.strictEqual(normalizeLines(one({ add_ons: many })).error, 'too many extras');
  // A bare string is what a simpler cart would send; accept it rather than making the client wrap.
  assert.deepStrictEqual(normalizeLines(one({ add_ons: ['Bacon'] })).lines[0].add_ons, [{ label: 'Bacon' }]);
});

test('the sold-out dish is pulled out of the database error', () => {
  // Postgres wraps its own context around a raise, so this has to match, not compare.
  assert.strictEqual(soldOutDish('unavailable:Beef Ribs'), 'Beef Ribs');
  assert.strictEqual(soldOutDish('ERROR:  unavailable:Beef Ribs\nCONTEXT: PL/pgSQL function'), 'Beef Ribs');
  assert.strictEqual(soldOutDish('duplicate key value violates unique constraint'), null);
  assert.strictEqual(soldOutDish(undefined), null);
});
