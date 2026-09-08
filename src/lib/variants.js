// Per-dish price lists: sizes ("300ml R25 / 500ml R35") and add-ons ("Extra cheese +R10").
// Both are admin-set and display-only.
//
// Labels are free text, unlike diet/allergens/promo_label next door. Those work as fixed
// vocabularies because their lists are genuinely closed; these are not. A picklist that has to
// hold 300ml, 1L, 250g, Glass, Bottle, Half rack and Bunny half at once is not a picklist, it is
// a text field with extra steps.

const { parsePrice } = require('./money');

// Four is the phone row's limit, not the database's -- see the .sizes rule in dinerPage.js. It is
// also the cap the check constraint in db/menu_variants.sql repeats.
const MAX_VARIANTS = 4;
// Add-ons get more room because they render in the opened panel as a wrapping list rather than on
// the price row, and extras lists genuinely run longer: cheese, bacon, egg, avo, extra sauce.
// Repeated by the check constraint in db/menu_addons.sql.
const MAX_ADD_ONS = 6;
// Long enough for "Half rack (500g)" or "Swap chips for salad", short enough that it cannot shove
// the price off the row.
const MAX_LABEL = 20;

/**
 * Validates and normalises what the console sends into what the column stores.
 *
 * Returns { error } or { rows } -- never both. One call instead of the codebase's usual xError()
 * pair, because unlike diet or allergens these values are not stored as typed: the price arrives
 * as whatever the owner typed ("R35", "35,50") and has to come back out as cents.
 *
 * Sizes and add-ons share this because the only things that differ are the cap and the noun in
 * the error message -- two arguments, against a second copy of the same twenty lines that would
 * then have to be fixed twice.
 */
function parsePriceList(input, { max, one, many }) {
  if (input === undefined || input === null || input === '') return { rows: [] };
  if (!Array.isArray(input)) return { error: `${many} must be a list` };

  // A modal that offers blank rows sends back the blank ones too. Dropping them here is what lets
  // the owner clear one by emptying it, instead of getting a 400 on save.
  // Rejected, not skipped: a PATCH replaces the whole list, so quietly dropping a row shape this
  // does not understand would wipe a dish's list and report success.
  if (!input.every((v) => v && typeof v === 'object' && !Array.isArray(v))) return { error: `each ${one} must be a name and a price` };
  const kept = input.filter((v) => String(v.label ?? '').trim() !== '' || String(v.price ?? '').trim() !== '');
  if (kept.length > max) return { error: `at most ${max} ${many} per dish` };

  const rows = [];
  for (const row of kept) {
    const label = String(row.label ?? '').trim();
    if (!label) return { error: `every ${one} needs a name` };
    if (label.length > MAX_LABEL) return { error: `a ${one} name is at most ${MAX_LABEL} characters` };

    const cents = parsePrice(row.price);
    if (Number.isNaN(cents)) return { error: `"${label}" does not have a valid price` };
    // Null price is legitimate on a dish (market price) but meaningless here: the only reason to
    // split a dish into sizes is that they cost different amounts, and an add-on with no price at
    // all is a typo. A free extra is written "0" and renders as "free" -- explicit, so a price
    // someone forgot to type can never become a giveaway.
    if (cents === null) return { error: `"${label}" needs a price` };

    rows.push({ label, price_cents: cents });
  }
  return { rows };
}

/** @param input [{ label, price }] from the request body, or null/undefined/'' for "no sizes". */
function parseVariants(input) {
  const { error, rows } = parsePriceList(input, { max: MAX_VARIANTS, one: 'size', many: 'sizes' });
  return error ? { error } : { variants: rows };
}

/** @param input [{ label, price }] from the request body, or null/undefined/'' for "no add-ons". */
function parseAddOns(input) {
  const { error, rows } = parsePriceList(input, { max: MAX_ADD_ONS, one: 'add-on', many: 'add-ons' });
  return error ? { error } : { addOns: rows };
}

module.exports = { parseVariants, parseAddOns, MAX_VARIANTS, MAX_ADD_ONS, MAX_LABEL };
