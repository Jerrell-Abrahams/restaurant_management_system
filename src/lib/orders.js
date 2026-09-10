// Validates the cart a phone sends before it reaches restaurant.place_order(). The table label is
// not validated here -- serviceRequests.js already owns that, and an order's table has to dedupe
// against the same lowercased string a waiter call does, so a second sanitiser would be a second
// set of rules for the same column.
//
// This file checks SHAPE, never price. Nothing here decides what anything costs: place_order()
// re-resolves every cent from menu_items inside the transaction that inserts, because the phone is
// holding a menu that is up to 60s stale and is, in any case, a stranger's device. What a cart
// sends is a list of intentions -- which dish, how many, which size, which extras -- and the
// database prices them.

// A table ordering more than this in one go is a mis-tap or a script, not a party. The same cap
// lives in place_order() so the rule survives a caller that skips this file.
const MAX_LINES = 40;
const MAX_QTY = 20;
// Labels are matched against the dish's own price_variants/add_ons, so anything longer than the
// menu allows cannot match anyway -- this only stops a megabyte of text reaching Postgres.
const MAX_LABEL = 60;
const MAX_ADD_ONS = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isLabel = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_LABEL;

// Returns { lines } or { error }. One shape, checked once, so the route stays a router.
//
// `name` rides along on each line and is used for nothing but the error message when a dish has
// sold out mid-order -- place_order() prefers the real name from menu_items and only falls back to
// this when the row is gone entirely. It is never trusted for anything a diner sees on a bill.
function normalizeLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'order is empty' };
  if (raw.length > MAX_LINES) return { error: 'too many items' };

  const lines = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return { error: 'bad item' };

    const menuItemId = entry.menu_item_id;
    if (typeof menuItemId !== 'string' || !UUID.test(menuItemId)) return { error: 'bad item' };

    // Number, not parseInt: "2x" and "" must fail rather than quietly becoming 2 and 0.
    const qty = Number(entry.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: 'bad quantity' };

    // Absent and null both mean "no size chosen"; a present-but-empty label is a bug on the phone
    // and must not reach a lookup that would silently match nothing.
    let variantLabel = null;
    if (entry.variant_label !== undefined && entry.variant_label !== null) {
      if (!isLabel(entry.variant_label)) return { error: 'bad size' };
      variantLabel = entry.variant_label;
    }

    const rawAddOns = entry.add_ons === undefined || entry.add_ons === null ? [] : entry.add_ons;
    if (!Array.isArray(rawAddOns)) return { error: 'bad extras' };
    if (rawAddOns.length > MAX_ADD_ONS) return { error: 'too many extras' };
    const addOns = [];
    for (const addOn of rawAddOns) {
      const label = addOn && typeof addOn === 'object' ? addOn.label : addOn;
      if (!isLabel(label)) return { error: 'bad extras' };
      // Only the label survives. A price sent by the phone is not evidence of anything, and
      // carrying it forward would leave a number in the payload that looks authoritative and is
      // not -- place_order() reads the real one off the dish.
      addOns.push({ label });
    }

    lines.push({
      menu_item_id: menuItemId,
      qty,
      variant_label: variantLabel,
      add_ons: addOns,
      name: typeof entry.name === 'string' ? entry.name.slice(0, MAX_LABEL) : null,
    });
  }
  return { lines };
}

// place_order() raises `unavailable:<dish>` when a dish sold out between the phone rendering the
// menu and Send. Postgres prefixes its own context, so match rather than compare, and fall back to
// a generic message rather than leaking a raw database string to a diner.
function soldOutDish(message) {
  const hit = /unavailable:(.*)$/m.exec(String(message || ''));
  return hit ? hit[1].trim() || null : null;
}

module.exports = { MAX_LINES, MAX_QTY, MAX_ADD_ONS, MAX_LABEL, normalizeLines, soldOutDish };
