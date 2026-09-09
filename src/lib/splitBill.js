// Split-the-bill maths for the diner page: turn OCR'd receipt text into line items, then divide
// those items (and a tip) across N people in integer cents.
//
// Both functions here are written to run in two places from ONE source: server-side in tests, and
// client-side inside the diner page's inline <script>. The OCR itself is Tesseract.js in the
// browser -- the photo never leaves the phone and there is no API route behind any of this -- so
// the parsing and the money have to be client code. Testing them in Node is the only way they get
// tested at all.
//
// ponytail: parseReceipt() and settle() are injected into the page via `${fn.toString()}` (see
// dinerPage.js), so each must be a pure function of its own arguments -- no module-scope
// constants, no closures over anything in this file. Each declares its own constants and helpers
// internally. splitBill.test.js asserts that, and it is what catches a regression here rather than
// a ReferenceError on someone's phone at a dinner table.
//
// Money is integer cents throughout, per lib/money.js. Nothing in this file may produce a float:
// a splitter whose four shares add up to a cent more than the bill is a bug someone photographs
// and sends you, and they will be right.

// Raw OCR text -> [{ name, cents }]. Best-effort by construction: Tesseract on a thermal till slip
// misses lines, merges lines and reads 0 as O. Everything this returns lands in the UI as an
// EDITABLE draft row, never as a fact -- see dinerPage.js. Lines it cannot read are simply not
// returned, and the diner adds them by hand.
//
// PURE FUNCTION -- see the file header. Do not reach outside this parameter.
function parseReceipt(text) {
  // A price is the last thing on the line and has exactly two decimals. Requiring the decimals is
  // what keeps table numbers, quantities, times and order numbers out of the list -- on a real
  // bill the item prices are the only two-decimal tokens, and a bare "189" is not worth the false
  // positives it drags in. The optional R/ZAR, the dot-leaders and the thousands separators are
  // all things South African bills actually print. The word boundary on the R prefix is load-
  // bearing: without it the lazy name group hands the final "r" of "Platter" over as a currency
  // symbol and the item comes back named "Platte".
  var PRICE = /^(.*?)[\s.·:_-]*?(?:\b(?:R|ZAR))?\s*(-|−)?(\d[\d\s,]*)[.,](\d{2})\s*$/i;

  // Lines that carry a two-decimal amount but are not something a person ate. Matched against the
  // name half only, and anchored at its start, so a dish called "Service Station Burger" is the
  // one thing this could plausibly eat -- rare enough to be worth the false negatives it prevents.
  //
  // Deduction lines are deliberately NOT in this list. They are caught by their minus sign in
  // PRICE instead, which also catches the ones nobody thought to name here ("Staff comp", a bare
  // "-50.00") and, unlike a keyword, subtracts them rather than merely skipping them. Keeping that
  // vocabulary out of this file is also what keeps the rendered diner page clear of the words
  // dinerPage.test.js greps it for -- see COMPLIANCE.md rule 3, and note that this source ships
  // to the browser verbatim.
  var NOISE = /^(sub[\s-]?total|total|balance|amount|due|vat|tax|tip|gratuity|service|change|cash|card|rounding|invoice|table|thank)/i;

  var lines = String(text || '').split(/\r?\n/);
  var items = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var m = line.match(PRICE);
    if (!m) {
      // Tesseract's standing confusions, applied ONLY to the final whitespace-delimited token and
      // only after a clean match has already failed. Contained on purpose: run this over the whole
      // line and "Bos Salad" becomes "805 5alad". If the last token is a word rather than a price
      // the substitution just produces junk that still fails to match, which costs nothing.
      var fixed = line.replace(/(\S+)\s*$/, function (tok) {
        return tok.replace(/[OoQ]/g, '0').replace(/[IlJ]/g, '1').replace(/[Ss]/g, '5').replace(/[Bb]/g, '8');
      });
      m = fixed.match(PRICE);
      if (!m) continue;
    }

    var name = m[1].replace(/[\s.·:_-]+$/, '').trim().replace(/\s+/g, ' ');
    // No name means the line was a bare number -- a total, a card digit, a page number. Never an
    // item, since an item without a name is not something anyone can agree they ate.
    if (!name) continue;
    if (NOISE.test(name)) continue;

    var whole = m[3].replace(/[\s,]/g, '');
    // Six digits of rand is R999 999.99. Past that the "price" is an account number or a phone
    // number that happened to end in two digits, not a plate of food.
    if (whole.length > 6) continue;

    // A minus glued to the digits is a deduction -- a comp, a correction, a settled deposit. It
    // is carried through as negative cents rather than dropped, so the list still reconciles
    // against the printed total. The sign has to be tight against the number: a dot-leader run of
    // dashes ("Burger --- 50.00") is punctuation, not arithmetic.
    var cents = parseInt(whole, 10) * 100 + parseInt(m[4], 10);
    items.push({ name: name, cents: m[2] ? -cents : cents });
  }

  return items;
}

// The whole split, computed fresh from state on every change. No incremental updates and no cached
// per-person totals to fall out of sync with the item list -- a bill has tens of items, not
// thousands, so recomputing is free and staying correct is automatic.
//
//   state = {
//     items: [{ cents, who: [personIndex, ...] }],   // who = [] means nobody has claimed it yet
//     peopleCount: 4,
//     tip: { mode: 'percent' | 'amount', value },    // percent: 10 means 10%. amount: cents.
//     billTotalCents: 48900 | null                   // what the bill itself says, if entered
//   }
//
// PURE FUNCTION -- see the file header. Do not reach outside this parameter.
function settle(state) {
  // Divide `total` cents across `weights` so the parts sum to EXACTLY `total`, always. Leftover
  // cents go one at a time from the top of the list -- somebody has to eat the odd cent on R100
  // three ways, and the alternative (rounding every share up) quietly overcharges the table.
  function spread(total, weights) {
    var n = weights.length, i, w = [], sum = 0;
    if (!n) return [];
    for (i = 0; i < n; i++) {
      w.push(weights[i] > 0 ? weights[i] : 0);
      sum += w[i];
    }
    // Nothing to weigh by -- everyone's share of the thing being weighed is zero. Fall back to an
    // even split so a tip on a bill where nobody has claimed an item yet still lands somewhere
    // instead of dividing by zero and vanishing.
    if (sum === 0) {
      for (i = 0; i < n; i++) w[i] = 1;
      sum = n;
    }
    var out = [], allocated = 0, c;
    for (i = 0; i < n; i++) {
      c = Math.floor(total * w[i] / sum);
      out.push(c);
      allocated += c;
    }
    // Math.floor rounds toward negative infinity, so a negative total under-allocates in the other
    // direction and the leftover still comes back with the sign that closes the gap. Stepping by
    // that sign handles both without a second code path.
    var left = total - allocated, step = left < 0 ? -1 : 1;
    for (i = 0; left !== 0; i = (i + 1) % n) {
      out[i] += step;
      left -= step;
    }
    return out;
  }

  var items = state.items || [];
  var n = state.peopleCount || 0;
  var tip = state.tip || { mode: 'percent', value: 0 };
  var subtotals = [], i, j;
  for (i = 0; i < n; i++) subtotals.push(0);

  var itemsTotal = 0;
  for (i = 0; i < items.length; i++) {
    itemsTotal += items[i].cents;
    var who = items[i].who || [];
    if (!who.length) continue;
    // A bottle of wine two of the four shared: the item's cents divide across everyone who tapped
    // it -- not across the whole table, and not onto whoever tapped it first.
    var ones = [];
    for (j = 0; j < who.length; j++) ones.push(1);
    var shares = spread(items[i].cents, ones);
    for (j = 0; j < who.length; j++) {
      if (who[j] >= 0 && who[j] < n) subtotals[who[j]] += shares[j];
    }
  }

  var assigned = 0;
  for (i = 0; i < n; i++) assigned += subtotals[i];

  // Percent is charged on what each person actually ate, so it splits proportionally and the parts
  // still sum to the tip exactly. A flat rand amount divides evenly -- that is what people mean
  // when they say "let's put R100 on it".
  var tipTotal, tipEach, evens = [];
  if (tip.mode === 'amount') {
    tipTotal = Math.round(tip.value || 0);
    for (i = 0; i < n; i++) evens.push(1);
    tipEach = spread(tipTotal, evens);
  } else {
    tipTotal = Math.round(assigned * (tip.value || 0) / 100);
    tipEach = spread(tipTotal, subtotals);
  }

  var perPerson = [];
  for (i = 0; i < n; i++) perPerson.push(subtotals[i] + tipEach[i]);

  return {
    subtotals: subtotals,
    tipEach: tipEach,
    perPerson: perPerson,
    itemsTotal: itemsTotal,
    assigned: assigned,
    tipTotal: tipTotal,
    grandTotal: assigned + tipTotal,
    // Items on the list that nobody has tapped. Distinct from `unaccounted` below and shown
    // separately: this one means "you are not finished yet", that one means "OCR missed a line".
    unassigned: itemsTotal - assigned,
    // What the printed bill says minus what is on the list. Non-zero means a line was missed, or
    // that VAT and service are on the bill but not among the items. Surfaced to the diner rather
    // than silently absorbed -- quietly under-charging the table is the one failure this feature
    // must not have.
    unaccounted: state.billTotalCents === null || state.billTotalCents === undefined
      ? null
      : state.billTotalCents - itemsTotal,
  };
}

// The photo -> black-and-white pass that runs before Tesseract sees the frame. Lives here, next to
// the parsing, for the same reason the parsing does: it is client code whose only chance of being
// tested is in Node.
//
// PURE FUNCTION -- see the file header. Do not reach outside these parameters.
function binarize(px, w, h) {
  var i, x, y, g;
  // Tesseract expects black print on white paper. What it gets is grey thermal print on cream
  // card under tungsten light, so the colour goes first and the decision is made on brightness.
  for (i = 0; i < px.length; i += 4) {
    g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = px[i + 1] = px[i + 2] = g;
  }

  // Bradley-Roth: every pixel is cut against the mean of the window AROUND it, never against one
  // number for the whole frame. A global mean is what a photo of a bill actually defeats -- a
  // receipt is a small bright object on a dark restaurant table, so the table drags the mean far
  // below the paper, the print sits above the cut, and the whole page comes out white. Tesseract
  // then reads nothing and the diner is told their photo was no good.
  //
  // The integral image is what keeps that per-pixel window O(1) instead of O(window), which is
  // the difference between this pass and a phone that appears to have frozen.
  var W = w + 1;
  // Holds w*h*255, so Uint32 runs out at about 4100px square. The caller's 1500px downscale is what
  // keeps this in range and is load-bearing for correctness, not just memory: each window sum is a
  // difference of four entries, so once they wrap independently the result is off by whole
  // multiples of 2^32 in either direction and the page binarizes to noise, not to a blank.
  var sum = new Uint32Array(W * (h + 1));
  for (y = 0; y < h; y++) {
    var run = 0;
    for (x = 0; x < w; x++) {
      run += px[(y * w + x) * 4];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + run;
    }
  }

  // A sixteenth of the width: wide enough to hold a run of paper around any glyph on a bill
  // photographed to fill the frame, narrow enough that the table on one side of it cannot reach
  // the print on the other.
  var s = Math.max(8, w >> 4), half = s >> 1;
  for (y = 0; y < h; y++) {
    var y0 = y - half < 0 ? 0 : y - half, y1 = y + half > h - 1 ? h - 1 : y + half;
    for (x = 0; x < w; x++) {
      var x0 = x - half < 0 ? 0 : x - half, x1 = x + half > w - 1 ? w - 1 : x + half;
      var area = (x1 - x0 + 1) * (y1 - y0 + 1);
      var tot = sum[(y1 + 1) * W + x1 + 1] - sum[y0 * W + x1 + 1]
              - sum[(y1 + 1) * W + x0] + sum[y0 * W + x0];
      var p = (y * w + x) * 4;
      // 88% of the local mean rather than the mean itself: paper fills most of any window, so the
      // mean sits up in the whites and cutting exactly there eats the thin strokes.
      g = px[p];
      px[p] = px[p + 1] = px[p + 2] = g * area * 100 < tot * 88 ? 0 : 255;
    }
  }
}

module.exports = { parseReceipt, settle, binarize };
