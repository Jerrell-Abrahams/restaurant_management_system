const crypto = require('crypto');
const express = require('express');
const { db } = require('../config/supabase');
const { bySlug } = require('../lib/restaurants');
const { renderPage } = require('../lib/dinerPage');
const alerts = require('../lib/alerts');
const { tableError, normalizeTable, isKind } = require('../lib/serviceRequests');

// Postgres unique-violation. The dedupe index in service_requests.sql fires when this table
// already has an open request of this kind -- see the route below for why that is a success, not
// an error.
const DUPLICATE = '23505';

// Awaited, not fire-and-forget. Vercel freezes the function once the response is sent, so
// un-awaited work here would usually never run -- and "you will know within fifteen minutes" is
// the promise the product is sold on. The debounce means only a fraction of submissions actually
// send anything, and a failure is swallowed: a diner's rating must never fail to save because
// email is broken.
function fireAlert(restaurantId) {
  return alerts.maybeAlert(restaurantId).catch((err) => {
    console.error('[alert]', restaurantId, err.message);
  });
}

const router = express.Router();

const COOKIE = 'rv';
// A visit is one sitting. Long enough to cover a leisurely dinner, short enough that tomorrow's
// diner on a shared family phone is counted as a new visit rather than appended to last night's.
const VISIT_TTL_MS = 4 * 60 * 60 * 1000;

// One cookie, one regex. cookie-parser would be a dependency for this single line.
function visitIdFrom(req) {
  const match = /(?:^|;\s*)rv=([0-9a-f-]{36})/.exec(req.headers.cookie || '');
  return match ? match[1] : null;
}

// Abuse detection only -- never displayed, never exported. Salted so the stored value cannot be
// reversed into an IP by anyone who gets the table. See COMPLIANCE.md 5.
function hashIp(req) {
  const ip = req.ip || '';
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + (process.env.IP_HASH_SALT || '')).digest('hex');
}

// Visits are created lazily, on the first thing a diner actually does. Creating one on page load
// would mean a row for every scan that never interacted -- mostly people checking the menu, which
// is a perfectly good reason to scan a coaster and not something to store feedback rows about.
async function currentVisit(req, res, restaurantId) {
  const existing = visitIdFrom(req);
  if (existing) {
    // Confirm it belongs to THIS restaurant: a cookie from another venue must not attach ratings
    // to the wrong menu.
    const { data } = await db
      .from('visits')
      .select('id')
      .eq('id', existing)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data, error } = await db
    .from('visits')
    .insert({
      restaurant_id: restaurantId,
      ip_hash: hashIp(req),
      user_agent: (req.headers['user-agent'] || '').slice(0, 400),
    })
    .select('id')
    .single();
  if (error) return null;

  res.cookie(COOKIE, data.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VISIT_TTL_MS,
    path: '/',
  });
  return data.id;
}

const ratingOf = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

// --- The menu itself ---------------------------------------------------------------------

// Deliberately served whatever the subscription says. A coaster is printed physical media sitting
// on a table; showing a diner an error page mid-service because an invoice slipped is a
// reputational problem for us, not a billing lever. See README > Lapsed subscriptions.
router.get('/:slug', async (req, res) => {
  const ctx = await bySlug(req.params.slug);
  if (!ctx) return res.status(404).type('html').send('<!doctype html><meta charset=utf-8><title>Not found</title><p style="font:16px system-ui;padding:32px">That code did not match a restaurant.</p>');

  const { data: categories } = await db
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', ctx.restaurant.id)
    .order('position');

  const ids = (categories || []).map((c) => c.id);
  const { data: items } = ids.length
    ? await db
        .from('menu_items')
        .select('*')
        .in('category_id', ids)
        .is('archived_at', null) // archived dishes keep their history but leave the menu
        .order('position')
    : { data: [] };

  const menu = (categories || []).map((c) => ({
    ...c,
    items: (items || []).filter((i) => i.category_id === c.id),
  }));

  // Menus change rarely and this is the cold path on restaurant wifi, so a short shared cache is
  // worth more than instant propagation of a price edit.
  res.set('Cache-Control', 'public, max-age=60');
  res.type('html').send(renderPage({ restaurant: ctx.restaurant, menu }));
});

// --- Ratings -----------------------------------------------------------------------------

router.post('/api/public/:slug/item-rating', async (req, res) => {
  const ctx = await bySlug(req.params.slug);
  if (!ctx) return res.status(404).json({ error: 'Not found' });

  const rating = ratingOf(req.body.rating);
  if (!rating) return res.status(400).json({ error: 'rating must be 1-5' });

  // The item must belong to this restaurant's menu -- otherwise a crafted request could attach
  // ratings to another venue's dishes.
  const { data: cats } = await db.from('menu_categories').select('id').eq('restaurant_id', ctx.restaurant.id);
  const owned = (cats || []).map((c) => c.id);
  if (!owned.length) return res.status(404).json({ error: 'Not found' });

  // Deliberately filters on archived_at but NOT on available, which is an asymmetry with the
  // rendered page and is the intended behaviour:
  //
  //   archived_at  = discontinued. Off the menu for good, so a rating arriving now is from
  //                  someone who never ate it. Rejected.
  //   available    = today's "86 the ribs" toggle. The page stops inviting ratings for it, but a
  //                  diner who ate it at 19:00 and taps at 20:05 -- the menu is cached 60s -- is
  //                  giving real feedback about a real plate of food. Accepted.
  //
  // Losing a genuine rating is worse than accepting a slightly noisy one, and the
  // unique (visit_id, menu_item_id) constraint caps any one diner at a single vote regardless.
  const { data: item } = await db
    .from('menu_items')
    .select('id')
    .eq('id', req.body.itemId)
    .in('category_id', owned)
    .is('archived_at', null)
    .maybeSingle();
  if (!item) return res.status(404).json({ error: 'Not found' });

  const visitId = await currentVisit(req, res, ctx.restaurant.id);
  if (!visitId) return res.status(500).json({ error: 'Could not start a visit' });

  // Upsert on (visit_id, menu_item_id): re-tapping a different face corrects the rating rather
  // than stacking a second vote, and the comment lands on the same row.
  const { error } = await db.from('item_ratings').upsert(
    {
      visit_id: visitId,
      menu_item_id: item.id,
      rating,
      comment: (req.body.comment || '').trim() || null,
    },
    { onConflict: 'visit_id,menu_item_id' }
  );
  if (error) return res.status(500).json({ error: error.message });

  if (rating <= alerts.ITEM_ALERT_AT) await fireAlert(ctx.restaurant.id);
  res.json({ ok: true });
});

router.post('/api/public/:slug/visit-rating', async (req, res) => {
  const ctx = await bySlug(req.params.slug);
  if (!ctx) return res.status(404).json({ error: 'Not found' });

  const rating = ratingOf(req.body.rating);
  if (!rating) return res.status(400).json({ error: 'rating must be 1-5' });

  const visitId = await currentVisit(req, res, ctx.restaurant.id);
  if (!visitId) return res.status(500).json({ error: 'Could not start a visit' });

  // Contact capture is enforced here, not in the browser. COMPLIANCE.md 6 limits it to ratings of
  // 3 or below, and a client-side check is a suggestion -- this is the rule.
  const contact = rating <= 3 ? (req.body.contact || '').trim().slice(0, 200) || null : null;

  const { error } = await db
    .from('visits')
    .update({
      rating,
      comment: (req.body.comment || '').trim() || null,
      contact,
    })
    .eq('id', visitId);
  if (error) return res.status(500).json({ error: error.message });

  if (rating <= (ctx.restaurant.alert_threshold ?? 3)) await fireAlert(ctx.restaurant.id);
  res.json({ ok: true });
});

// --- Service requests (Call waiter / Request bill) ----------------------------------------

// Deliberately does not touch `visits` or `currentVisit()`: this is an operational ping, not
// feedback, and must not inflate the console's visit count or averages. No alert email either --
// the kitchen display (admin/src/pages/Display.jsx) is the whole channel for this.
router.post('/api/public/:slug/service-request', async (req, res) => {
  const ctx = await bySlug(req.params.slug);
  // 404 rather than a feature-specific error when the toggle is off: the menu page is cached 60s
  // at a shared edge (see the /:slug route above), so a phone can be holding a page whose buttons
  // outlive the owner switching this off. Nothing distinguishes "wrong slug" from "not enabled"
  // to a crafted request either way.
  if (!ctx || !ctx.restaurant.service_requests_enabled) return res.status(404).json({ error: 'Not found' });

  if (!isKind(req.body.kind)) return res.status(400).json({ error: 'kind must be waiter or bill' });
  const table = normalizeTable(req.body.table);
  const bad = tableError(table);
  if (bad) return res.status(400).json({ error: bad });

  const { error } = await db.from('service_requests').insert({
    restaurant_id: ctx.restaurant.id,
    table_label: table,
    kind: req.body.kind,
    ip_hash: hashIp(req), // COMPLIANCE.md 5: abuse detection, never displayed or exported
  });

  // The dedupe index fired: this table already has an unanswered request of this kind on the
  // display. That is the system working as designed, and to the diner it is indistinguishable
  // from success -- because it is; staff have already been told.
  if (error && error.code !== DUPLICATE) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
