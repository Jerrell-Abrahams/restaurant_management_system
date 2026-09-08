// Prices are stored as integer cents and only ever become a decimal at the edge of the system --
// here, and nowhere else. A menu that renders R188.99999 because someone did floating-point
// arithmetic on a price is the kind of bug a restaurant photographs and sends you.
//
// ponytail: both functions below are ALSO injected into the diner page via `${fn.toString()}` for
// the bill splitter (see dinerPage.js and lib/splitBill.js), so both must stay pure functions of
// their own arguments -- no module-scope constants, no closures over anything in this file. That
// is what keeps one implementation of "R189.00" and "is this a valid price" across the server and
// a diner's phone. dinerPage.test.js asserts the injected source actually reaches the client.

// Cents -> "R189.00". Null/undefined price means "no price shown" (a market-price dish, a
// section header), which is a legitimate menu state and must not render as "R0.00".
function formatCents(cents) {
  if (cents === null || cents === undefined) return null;
  return `R${(cents / 100).toFixed(2)}`;
}

// "R189", "189.50", "189,50" -> cents. Returns null for blank (allowed) and NaN for junk, so the
// caller can tell "no price" apart from "bad price" -- collapsing those would silently drop a
// mistyped price to null and put a free dish on the menu.
function parsePrice(input) {
  if (input === null || input === undefined || String(input).trim() === '') return null;
  const cleaned = String(input).trim().replace(/^R\s*/i, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 100);
}

module.exports = { formatCents, parsePrice };
