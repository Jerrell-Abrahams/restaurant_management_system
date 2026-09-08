const test = require('node:test');
const assert = require('node:assert');
const { parseReceipt, settle } = require('./splitBill');

// A plausible South African till slip as Tesseract would hand it over: dot leaders, a mix of
// comma and full-stop decimals, an O read for a 0, and a tail of totals that are not food.
const OCR = [
  'KASI FLAME GRILL',
  'Table 12          04/09/2026',
  '',
  '2x Beef Burger ....... R 189,00',
  'Calamari                98.OO',
  'Coke                    25.50',
  'Bottle Shiraz          380.00',
  'Subtotal               692.50',
  'VAT @ 15%               90.33',
  'Service charge          69.25',
  'TOTAL                R 761.75',
].join('\n');

test('parseReceipt pulls the items and leaves the totals behind', () => {
  assert.deepStrictEqual(parseReceipt(OCR), [
    { name: '2x Beef Burger', cents: 18900 },
    { name: 'Calamari', cents: 9800 },
    { name: 'Coke', cents: 2550 },
    { name: 'Bottle Shiraz', cents: 38000 },
  ]);
});

test('parseReceipt ignores lines with no two-decimal price', () => {
  // Table numbers, times and quantities are exactly what a looser price rule would swallow.
  assert.deepStrictEqual(parseReceipt('Table 12\n19:45\nBurger 2\n'), []);
});

test('parseReceipt drops a price with no name', () => {
  assert.deepStrictEqual(parseReceipt('189.00\n  45,50  '), []);
});

test('parseReceipt only digit-corrects the final token, never the name', () => {
  // "Bos Salad" must survive intact; the O/S/B fixes apply to the price token alone.
  assert.deepStrictEqual(parseReceipt('Bos Salad     8O.5O'), [{ name: 'Bos Salad', cents: 8050 }]);
});

test('parseReceipt subtracts a deduction rather than adding it', () => {
  // Caught by the sign, not by a vocabulary of line names -- so a comp nobody thought to list
  // still comes through as a deduction. See COMPLIANCE.md rule 3 for why the words stay out.
  assert.deepStrictEqual(parseReceipt('Manager comp   -50.00\nStaff comp  −25,00'), [
    { name: 'Manager comp', cents: -5000 },
    { name: 'Staff comp', cents: -2500 },
  ]);
});

test('parseReceipt reads a run of dot-leader dashes as punctuation, not a minus', () => {
  assert.deepStrictEqual(parseReceipt('Burger --- 50.00'), [{ name: 'Burger', cents: 5000 }]);
});

test('a deduction still reconciles against the printed total', () => {
  const r = settle({
    items: [{ cents: 20000, who: [0] }, { cents: -5000, who: [0, 1] }],
    peopleCount: 2,
    tip: { mode: 'percent', value: 0 },
    billTotalCents: 15000,
  });
  assert.strictEqual(r.unaccounted, 0);
  assert.deepStrictEqual(r.perPerson, [17500, -2500]);
  assert.strictEqual(sum(r.perPerson), r.grandTotal);
});

test('parseReceipt handles thousands separators without losing the rands', () => {
  assert.deepStrictEqual(parseReceipt('Magnum Champagne   1 250,00\nPlatter  1,499.99'), [
    { name: 'Magnum Champagne', cents: 125000 },
    { name: 'Platter', cents: 149999 },
  ]);
});

// --- the invariant: per-person totals always sum to exactly what is being split ---------------

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('shares always sum to the item total, however awkward the division', () => {
  // R100 three ways is the canonical odd-cent case: 3334 / 3333 / 3333, never 3333 x 3.
  const r100 = settle({
    items: [{ cents: 10000, who: [0, 1, 2] }],
    peopleCount: 3,
    tip: { mode: 'percent', value: 0 },
  });
  assert.deepStrictEqual(r100.perPerson, [3334, 3333, 3333]);
  assert.strictEqual(sum(r100.perPerson), 10000);

  // One cent four ways still has to be one cent when you add it back up.
  const onec = settle({
    items: [{ cents: 1, who: [0, 1, 2, 3] }],
    peopleCount: 4,
    tip: { mode: 'percent', value: 0 },
  });
  assert.deepStrictEqual(onec.perPerson, [1, 0, 0, 0]);
});

test('per-person totals sum to the grand total across a spread of tips and party sizes', () => {
  const items = [
    { cents: 18900, who: [0] },
    { cents: 9800, who: [1] },
    { cents: 2550, who: [2] },
    { cents: 38000, who: [0, 3] }, // the shared bottle
    { cents: 7777, who: [0, 1, 2, 3] },
  ];
  for (const value of [0, 5, 7.5, 10, 12.5, 15, 33]) {
    for (const mode of ['percent', 'amount']) {
      const r = settle({ items, peopleCount: 4, tip: { mode, value: mode === 'amount' ? value * 100 : value } });
      assert.strictEqual(sum(r.perPerson), r.grandTotal, `${mode} ${value}`);
      assert.strictEqual(sum(r.tipEach), r.tipTotal, `${mode} ${value} tip`);
      assert.strictEqual(sum(r.subtotals), r.assigned, `${mode} ${value} subtotals`);
    }
  }
});

test('a shared item splits across only the people who tapped it', () => {
  const r = settle({
    items: [{ cents: 38000, who: [1, 2] }],
    peopleCount: 4,
    tip: { mode: 'percent', value: 0 },
  });
  assert.deepStrictEqual(r.perPerson, [0, 19000, 19000, 0]);
});

test('percent tip is proportional to what each person ate, flat amount is even', () => {
  const items = [
    { cents: 30000, who: [0] },
    { cents: 10000, who: [1] },
  ];
  const pct = settle({ items, peopleCount: 2, tip: { mode: 'percent', value: 10 } });
  assert.deepStrictEqual(pct.tipEach, [3000, 1000]);

  const flat = settle({ items, peopleCount: 2, tip: { mode: 'amount', value: 10000 } });
  assert.deepStrictEqual(flat.tipEach, [5000, 5000]);
});

test('a tip on a bill nobody has assigned yet splits evenly rather than vanishing', () => {
  const r = settle({
    items: [{ cents: 10000, who: [] }],
    peopleCount: 3,
    tip: { mode: 'amount', value: 3000 },
  });
  assert.strictEqual(sum(r.tipEach), 3000);
  assert.strictEqual(r.unassigned, 10000);
});

test('unassigned and unaccounted are different failures and reported separately', () => {
  const r = settle({
    items: [{ cents: 18900, who: [0] }, { cents: 9800, who: [] }],
    peopleCount: 2,
    tip: { mode: 'percent', value: 0 },
    billTotalCents: 40000,
  });
  assert.strictEqual(r.unassigned, 9800, 'one item nobody has tapped');
  assert.strictEqual(r.unaccounted, 11300, 'the bill says more than the list adds up to');
});

test('unaccounted is null until the diner enters what the bill says', () => {
  assert.strictEqual(settle({ items: [], peopleCount: 2, tip: { mode: 'percent', value: 0 } }).unaccounted, null);
});

test('settle survives an empty state without dividing by zero', () => {
  const r = settle({ items: [], peopleCount: 0, tip: { mode: 'percent', value: 10 } });
  assert.deepStrictEqual(r.perPerson, []);
  assert.strictEqual(r.grandTotal, 0);
});

// --- purity, since both functions are shipped by toString() into the diner page ----------------

test('parseReceipt and settle reference nothing outside their own arguments', () => {
  // They are injected into the page as source text (dinerPage.js), so a module-scope constant or
  // a require() would be a ReferenceError on a phone, not a failure here. This is the guard.
  for (const [name, fn] of [['parseReceipt', parseReceipt], ['settle', settle]]) {
    const src = fn.toString();
    assert.ok(!/\brequire\s*\(/.test(src), `${name} must not require() anything`);
    assert.ok(!/\bmodule\b|\bexports\b/.test(src), `${name} must not touch module scope`);
  }
  // settle's cent-spreading helper has to travel with it rather than sit beside it in this file.
  assert.ok(/function spread\(/.test(settle.toString()), 'settle must declare spread() internally');
  assert.ok(/var PRICE =/.test(parseReceipt.toString()), 'parseReceipt must declare its regexes internally');
});
