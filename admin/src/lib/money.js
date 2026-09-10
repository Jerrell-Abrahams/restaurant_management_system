// Cents -> "R89.00", for every screen in the console that shows money.
//
// Shared rather than redeclared per page, which is what it was: the menu editor and the kitchen
// display now render the same prices, and a formatter that drifts on one of them (a thousands
// separator, a currency symbol change, a rounding rule) shows a diner one number and the kitchen
// another. Mirrors src/lib/money.js on the API side -- integer cents in, never a float.
export const rands = (cents) =>
  (cents === null || cents === undefined ? '' : `R${(cents / 100).toFixed(2)}`);
