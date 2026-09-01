// Mirrors src/lib/brandPresets.js (server-side) -- kept in sync by hand rather than shared, since
// admin/ and the backend are separate bundles with no shared-package plumbing between them for
// five short entries. Only the light swatch is needed here; the dark pairing lives server-side,
// where it's actually rendered into the diner page's CSS.
export const ACCENT_PRESETS = {
  terracotta: { label: 'Terracotta', swatch: '#8a3928' },
  sage: { label: 'Sage', swatch: '#288a59' },
  ocean: { label: 'Ocean', swatch: '#286a8a' },
  plum: { label: 'Plum', swatch: '#51288a' },
  wine: { label: 'Wine', swatch: '#8a2849' },
};
