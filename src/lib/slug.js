// The slug is the whole public identity of a restaurant: menu.complexai.co.za/<slug> is what gets
// printed onto paper coasters that then sit on tables for years. Two consequences drive this file.
//
// 1. It must survive a printer, a phone camera and someone typing it off a coaster by hand, so the
//    character set is deliberately narrow -- lowercase, digits, single hyphens.
// 2. It is set once and never updated. No route exposes a slug change; renaming a restaurant must
//    not silently break a thousand coasters.

// The API and the diner pages share one Express app and one hostname space, so a restaurant called
// "API" would otherwise shadow /api. Reserved rather than escaped: a restaurant can be called
// anything, its slug just can't be one of these.
const RESERVED = new Set([
  'api', 'health', 'admin', 'assets', 'static', 'public',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json',
]);

function normalizeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of punctuation/space/accents collapses to one hyphen
    .replace(/^-+|-+$/g, '');
}

// Returns null when valid, otherwise the reason -- callers turn that straight into a 400 body.
// The 2-char floor is about typos on a coaster, not aesthetics: single letters are too easy to
// mistake for a stray mark in print.
function slugError(slug) {
  if (!slug) return 'slug is required';
  if (slug.length < 2) return 'slug must be at least 2 characters';
  if (slug.length > 40) return 'slug must be 40 characters or fewer';
  if (RESERVED.has(slug)) return `"${slug}" is reserved`;
  return null;
}

module.exports = { normalizeSlug, slugError, RESERVED };
