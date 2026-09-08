const test = require('node:test');
const assert = require('node:assert');
const { parseVariants, parseAddOns, MAX_VARIANTS, MAX_ADD_ONS } = require('./variants');

test('parses labels and prices into cents', () => {
  assert.deepStrictEqual(
    parseVariants([{ label: ' 300ml ', price: 'R25' }, { label: '500ml', price: '35,50' }]),
    { variants: [{ label: '300ml', price_cents: 2500 }, { label: '500ml', price_cents: 3550 }] }
  );
});

// The default state of every dish on the menu today.
test('no sizes is an empty list, never an error', () => {
  assert.deepStrictEqual(parseVariants(undefined), { variants: [] });
  assert.deepStrictEqual(parseVariants(null), { variants: [] });
  assert.deepStrictEqual(parseVariants([]), { variants: [] });
});

// The modal renders empty rows; saving must not 400 on them.
test('blank rows are dropped, not rejected', () => {
  assert.deepStrictEqual(parseVariants([{ label: 'Small', price: '20' }, { label: '', price: '' }]), {
    variants: [{ label: 'Small', price_cents: 2000 }],
  });
});

test('a half-filled row is a mistake, not a blank', () => {
  assert.ok(parseVariants([{ label: 'Large', price: '' }]).error);
  assert.ok(parseVariants([{ label: '', price: '55' }]).error);
  assert.ok(parseVariants([{ label: 'Large', price: 'free' }]).error);
});

test('rejects junk shapes and over-long labels', () => {
  assert.ok(parseVariants('300ml').error);
  assert.ok(parseVariants([{ label: 'x'.repeat(21), price: '10' }]).error);
  assert.ok(parseVariants(Array.from({ length: MAX_VARIANTS + 1 }, (_, i) => ({ label: `s${i}`, price: '10' }))).error);
});

// A PATCH replaces the list outright, so an unparseable row has to 400 rather than resolve to
// "no sizes" and silently clear the dish.
test('a malformed row is an error, never a silent wipe', () => {
  assert.ok(parseVariants(['300ml']).error);
  assert.ok(parseVariants([['300ml', 2500]]).error);
  assert.ok(parseVariants([null]).error);
});

// Add-ons share the parser, so these only cover what actually differs: the cap and free extras.
test('add-ons parse the same way, into their own key', () => {
  assert.deepStrictEqual(parseAddOns([{ label: 'Extra cheese', price: 'R10' }]), {
    addOns: [{ label: 'Extra cheese', price_cents: 1000 }],
  });
  assert.deepStrictEqual(parseAddOns(undefined), { addOns: [] });
});

// A no-charge swap is a real menu line. A forgotten price is not -- it stays an error, so it can
// never quietly become one.
test('a free add-on is zero, a priceless one is an error', () => {
  assert.deepStrictEqual(parseAddOns([{ label: 'Swap for salad', price: '0' }]), {
    addOns: [{ label: 'Swap for salad', price_cents: 0 }],
  });
  assert.ok(parseAddOns([{ label: 'Extra bacon', price: '' }]).error);
});

test('add-ons cap higher than sizes, and say so', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `a${i}`, price: '5' }));
  assert.strictEqual(parseAddOns(rows(MAX_ADD_ONS)).addOns.length, MAX_ADD_ONS);
  assert.match(parseAddOns(rows(MAX_ADD_ONS + 1)).error, /add-ons/);
  assert.match(parseVariants(rows(MAX_VARIANTS + 1)).error, /sizes/);
});
