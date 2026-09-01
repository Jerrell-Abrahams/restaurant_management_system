// Curated accent-color options for the diner-facing menu (src/lib/dinerPage.js). Presets only --
// never a raw owner-picked hex -- because the page's palette is hand-tuned to hold AAA contrast in
// both light and dark themes (see dinerPage.js's STYLE block), a guarantee an arbitrary color
// can't make. Only --accent is overridden; --lit (the "open now" badge) and --cta-* stay fixed in
// every preset so "open" and "call to action" keep reading as their own signal regardless of
// brand color.
//
// Light/dark pairs share one HSL recipe -- light: S55 L35, dark: S50 L57 -- the same lightness
// band the existing default brass accent already sits in (see admin/src/pages/Settings.jsx's
// history: that pair is the one this app's own AAA-contrast comments were measured against).
const ACCENT_PRESETS = {
  terracotta: { label: 'Terracotta', light: '#8a3928', dark: '#c86d5b' },
  sage: { label: 'Sage', light: '#288a59', dark: '#5bc891' },
  ocean: { label: 'Ocean', light: '#286a8a', dark: '#5ba4c8' },
  plum: { label: 'Plum', light: '#51288a', dark: '#885bc8' },
  wine: { label: 'Wine', light: '#8a2849', dark: '#c85b7f' },
};

module.exports = { ACCENT_PRESETS };
