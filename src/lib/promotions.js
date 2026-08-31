// A fixed vocabulary for the one promotional label a menu item can carry. Admin-set only -- there
// is no diner-facing write path -- so validation here exists to stop a crafted or buggy request
// from writing something onto a live menu that renders straight to a diner deciding what to eat.

const PROMO_LABELS = ['best_seller', 'popular', 'new', 'special', 'limited_time', 'chefs_choice'];

// Display copy for the diner-facing pill and the admin picklist. Text only, no emoji -- every
// other badge on the diner page (sold out, diet, spice) is monochrome, and a colour emoji here
// would be the odd one out. See dinerPage.js's .promo-badge.
const PROMO_LABEL_TEXT = {
  best_seller: 'Best Seller',
  popular: 'Popular',
  new: 'New',
  special: 'Special',
  limited_time: 'Limited Time',
  chefs_choice: "Chef's Choice",
};

// null when valid, otherwise the reason -- same contract as slugError/hoursError/dietError.
function promoLabelError(value) {
  if (value === undefined || value === null || value === '') return null;
  return PROMO_LABELS.includes(value) ? null : 'promo label is not recognised';
}

module.exports = { PROMO_LABELS, PROMO_LABEL_TEXT, promoLabelError };
