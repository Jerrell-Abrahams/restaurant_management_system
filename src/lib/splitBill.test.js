const test = require('node:test');
const assert = require('node:assert');
const { parseReceipt, settle, binarize } = require('./splitBill');

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

test('the digit fix still finds the price when a VAT code follows it', () => {
  // The two failure modes compound: a slip that marks each amount is exactly the kind of thermal
  // slip Tesseract reads 0 as O on, and aiming the fix at the last token pointed it at the code.
  assert.deepStrictEqual(parseReceipt('Calamari   89.OO V\nCheesecake   65.OO *'), [
    { name: 'Calamari', cents: 8900 },
    { name: 'Cheesecake', cents: 6500 },
  ]);
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

test('a quantity column does not glue itself onto the price', () => {
  // The bug this exists for: a space was allowed to group any number of digits, so the qty column
  // most tills print ran straight into the rands. Every one of these came back plausible, roughly
  // bill-shaped and wrong, which is the kind nobody catches at the table -- R38.00 became R238.00
  // and R189.00 became R2189.00. A separator now has to group exactly three digits to be one.
  assert.deepStrictEqual(parseReceipt([
    'Cappuccino          2      38.00',
    'Beef Burger         2     189.00',
    'Chicken Wings       1      79.00',
  ].join('\n')).map((i) => i.cents), [3800, 18900, 7900]);

  // The unit-price-and-line-total layout: the LAST amount on the line is what is owed.
  assert.strictEqual(parseReceipt('Coke   2   12.50   25.00')[0].cents, 2500);
});

test('a VAT code or an asterisk after the amount does not drop the line', () => {
  // Pinning the price hard to the end of the line silently discarded every line a till marks up,
  // and a dropped line is invisible: the diner cannot delete a row that never arrived, and a bill
  // where every line is marked comes back empty and reads as "the scanner is broken".
  assert.deepStrictEqual(parseReceipt([
    'Cheesecake   65.00 *',
    'Sirloin 250g   215.00 V',
    'Espresso   28.00A',
  ].join('\n')), [
    { name: 'Cheesecake', cents: 6500 },
    { name: 'Sirloin 250g', cents: 21500 },
    { name: 'Espresso', cents: 2800 },
  ]);
});

test('a doubled VAT glyph does not drop the line', () => {
  // Not hypothetical: `npm run browser` reads a lone "V" off the rendered slip as "Vv" on about
  // half the lines, and a one-character marker allowance silently dropped every one of them --
  // two dishes of four, gone, with the diner given no sign a line was ever there. Three characters
  // covers the doubling and the two-letter codes tills actually print.
  assert.deepStrictEqual(parseReceipt([
    '1    Calamari             89.00 V',
    '1    Buffalo Wings        75.00 Vv',
    '1    Beef Burger         120.00 V',
    '1    Still Water          25.50 Vv',
    'TOTAL                    309.50',
  ].join('\n')).map((i) => i.cents), [8900, 7500, 12000, 2550]);

  // The marker stays digit-free, so a line total after a unit price is still the amount owed
  // rather than something a wider marker swallowed.
  assert.strictEqual(parseReceipt('Coke   2   12.50   25.00 V')[0].cents, 2500);
});

test('a dish that opens on a till word is still a dish', () => {
  // NOISE matched the start of the name, so these three were thrown away as totals. A till label
  // is the keyword and at most one word after it; anything longer is somebody's dinner.
  assert.deepStrictEqual(parseReceipt([
    'Table Mountain Platter   320.00',
    'Service Station Burger    95.00',
    'Cashew Nut Salad          78.00',
    'Subtotal                 493.00',
    'Service charge            49.30',
    'VAT @ 15%                 73.95',
    'TOTAL                    616.25',
  ].join('\n')), [
    { name: 'Table Mountain Platter', cents: 32000 },
    { name: 'Service Station Burger', cents: 9500 },
    { name: 'Cashew Nut Salad', cents: 7800 },
  ]);
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


// --- binarize -----------------------------------------------------------------------------------

// A photographed bill, as the camera actually delivers one: a small bright receipt on a dark
// restaurant table, with print that is grey rather than black. 200x200 RGBA, same shape as
// getImageData().data.
function frame() {
  const w = 200, h = 200;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const paper = x >= 60 && x < 140 && y >= 40 && y < 160;
      // Six lines of print down the middle of the paper.
      const print = paper && x >= 68 && x < 132 && y % 20 >= 6 && y % 20 < 10;
      const g = print ? 105 : paper ? 205 : 45;   // print / paper / table
      const p = (y * w + x) * 4;
      px[p] = px[p + 1] = px[p + 2] = g;
      px[p + 3] = 255;
    }
  }
  return { px, w, h, at: (x, y) => px[(y * w + x) * 4] };
}

test('a global threshold loses the print on this frame -- which is why binarize is local', () => {
  // The pass this replaced: one cut at 88% of the whole frame's mean. The table is most of the
  // frame, so the mean lands near it, the cut lands below the print, and every stroke on the
  // bill survives as white paper. Tesseract reads a blank page and the diner is told their
  // photo was no good. This test exists to keep anyone from "simplifying" back to it.
  const { px } = frame();
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i];
  const cut = (sum / (px.length / 4)) * 0.88;
  assert.ok(105 > cut, `print at 105 must sit above the global cut (${cut.toFixed(1)}) to make the point`);
});

test('binarize keeps the print black and the paper white', () => {
  const f = frame();
  binarize(f.px, f.w, f.h);
  // A print pixel, dead centre of the second line of text.
  assert.strictEqual(f.at(100, 47), 0);
  // Paper between two lines, and paper in the margin beside the text.
  assert.strictEqual(f.at(100, 55), 255);
  assert.strictEqual(f.at(63, 47), 255);
  // Nothing but 0 and 255 comes out, and the alpha channel is left alone.
  for (let i = 0; i < f.px.length; i += 4) {
    assert.ok(f.px[i] === 0 || f.px[i] === 255);
    assert.strictEqual(f.px[i + 3], 255);
  }
});

test('binarize is O(n) enough for a phone-sized frame', () => {
  // 1500x1125 is what prep() hands it after the downscale. The point is the integral image: the
  // naive per-pixel window is ~90 million reads at this size and reads as a frozen phone.
  const w = 1500, h = 1125;
  const px = new Uint8ClampedArray(w * h * 4).fill(200);
  const t = Date.now();
  binarize(px, w, h);
  assert.ok(Date.now() - t < 2000, 'binarize took ' + (Date.now() - t) + 'ms');
});

test('binarize references nothing outside its own arguments', () => {
  const src = binarize.toString();
  assert.ok(!/\brequire\s*\(/.test(src));
  assert.ok(!/\bmodule\b|\bexports\b/.test(src));
});
