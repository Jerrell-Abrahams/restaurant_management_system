const express = require('express');
const supabase = require('../config/supabase');
const { db } = require('../config/supabase');
const auth = require('../middleware/adminAuth');
const { requireAdmin } = require('../middleware/adminAuth');
const { resolve } = require('../lib/restaurants');
const { normalizeSlug, slugError } = require('../lib/slug');
const { parsePrice } = require('../lib/money');
const { summarize, leaderboards, categoryBoard, MIN_RATINGS } = require('../lib/dishes');
const { summarizeOverview } = require('../lib/overview');
const { buildAnalytics, WINDOW_DAYS } = require('../lib/analytics');
const qr = require('../lib/qr');
const { hoursError } = require('../lib/hours');
const { allergensError, dietError, spiceLevelOf } = require('../lib/dietary');
const { promoLabelError } = require('../lib/promotions');
const { decodeLogo } = require('../lib/logo');
const { ACCENT_PRESETS } = require('../lib/brandPresets');

const router = express.Router();
router.use(auth);

// Postgres unique-violation. Mapped to 409 so the console can say "that slug is taken" instead
// of surfacing a raw constraint name.
const DUPLICATE = '23505';

// One call the console can boot from: who am I, and what may I see. Saves the SPA guessing its
// own role from the shape of a restaurant list, and gives it somewhere to land when the list is
// empty.
router.get('/me', async (req, res) => {
  const query = db.from('restaurants').select('id, name, slug').order('name');
  if (!req.isAdmin) query.eq('owner_user_id', req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ userId: req.user.id, email: req.user.email, isAdmin: req.isAdmin, restaurants: data });
});

// --- Restaurants -------------------------------------------------------------------------

// Admins see every restaurant; everyone else sees the one they own.
router.get('/restaurants', async (req, res) => {
  const query = db.from('restaurants').select('*').order('name');
  if (!req.isAdmin) query.eq('owner_user_id', req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  // Same field as the detail route, for the same reason -- the list shows each restaurant's
  // public address, and a second hand-written copy of that host is a second thing to get wrong.
  res.json(data.map((r) => ({ ...r, qr_target_url: qr.targetUrl(r.slug) })));
});

// Admin only: slug, Place ID, the owner and the subscription link are all set here. The slug is
// never editable afterwards.
router.post('/restaurants', requireAdmin, async (req, res) => {
  const { subscriptionId, ownerUserId, name, googlePlaceId, alertEmail, alertThreshold } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  // Slug defaults off the name but can be given explicitly. "Mario's Kitchen & Grill" makes a
  // long slug, and this is the one moment it can ever be chosen.
  const slug = normalizeSlug(req.body.slug || name);
  const bad = slugError(slug);
  if (bad) return res.status(400).json({ error: bad });

  const { data, error } = await db
    .from('restaurants')
    .insert({
      // Both nullable: a restaurant is often created, and its menu built, before the owner's
      // login exists or billing is attached. lib/billing.js treats a null subscription as
      // ungated rather than lapsed, so this does not lock anyone out.
      subscription_id: subscriptionId || null,
      owner_user_id: ownerUserId || null,
      name,
      slug,
      google_place_id: googlePlaceId || null,
      alert_email: alertEmail || null,
      alert_threshold: Number(alertThreshold) || 3,
    })
    .select()
    .single();

  if (error && error.code === DUPLICATE) {
    return res.status(409).json({ error: 'Slug "' + slug + '" is already taken' });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.get('/restaurants/:id', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  // qr_target_url is computed here rather than assembled in the browser. The console used to
  // build it from a Vite env var that, when unset, silently became http://localhost:3000 -- and
  // that is the string an admin then pasted into the QR generator. The server holds
  // PUBLIC_BASE_URL; there is no reason for the browser to be guessing at it.
  res.json({ ...ctx.restaurant, active: ctx.active, qr_target_url: qr.targetUrl(ctx.restaurant.slug) });
});

// Note what is absent: slug. It is printed on coasters already in the wild, so there is
// deliberately no code path that updates it -- not even for admins. A restaurant that needs a new
// slug needs a new print run, which is a decision made outside this system.
router.patch('/restaurants/:id', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;

  const patch = {};
  if ('name' in req.body) patch.name = req.body.name;
  if ('alertEmail' in req.body) patch.alert_email = req.body.alertEmail || null;
  if ('alertThreshold' in req.body) patch.alert_threshold = Number(req.body.alertThreshold) || 3;
  // The owner's own address and hours -- not admin-gated, unlike googlePlaceId below. Nobody but
  // the restaurant knows when it is open, and the failure mode of a wrong entry is "the badge
  // is wrong until they fix it", not "diners get sent to the wrong place forever".
  if ('address' in req.body) patch.address = req.body.address || null;
  if ('closedNote' in req.body) patch.closed_note = req.body.closedNote || null;
  if ('hours' in req.body) {
    const problem = hoursError(req.body.hours);
    if (problem) return res.status(400).json({ error: problem });
    patch.hours = req.body.hours;
  }
  // Admin-only fields. Place ID especially: a restaurant user pasting the wrong one would
  // silently send their diners to a competitor's review form, and nobody would notice for months.
  // Owner and subscription are the account's own wiring and are not the customer's to rewrite.
  // Owner's own floor operation, not admin-gated -- same reasoning as address/hours above: the
  // failure mode of a wrong value here is "the buttons are on or off", not a wrong review link.
  if ('serviceRequests' in req.body) patch.service_requests_enabled = !!req.body.serviceRequests;
  // Null = staff dismiss only. See service_request_auto_dismiss.sql for why a number reaches the
  // display through the poll rather than a new cron.
  if ('autoDismissMinutes' in req.body) {
    const n = Number(req.body.autoDismissMinutes);
    patch.service_requests_auto_dismiss_minutes = n > 0 ? Math.min(180, Math.round(n)) : null;
  }
  // Hard lock, not a default -- browser autoplay can't force sound ON for a device that hasn't
  // unmuted itself, so this is the only direction a restaurant-wide chime setting can guarantee.
  if ('chimeMuted' in req.body) patch.service_requests_chime_muted = !!req.body.chimeMuted;

  // Branding. logoUrl is normally only ever written by POST .../logo below; PATCHing it directly
  // is how "remove logo" clears it, the same escape hatch every other nullable text field here has.
  if ('logoUrl' in req.body) patch.logo_url = req.body.logoUrl || null;
  if ('accentColor' in req.body) {
    patch.accent_color = Object.hasOwn(ACCENT_PRESETS, req.body.accentColor) ? req.body.accentColor : null;
  }

  if (req.isAdmin) {
    if ('googlePlaceId' in req.body) patch.google_place_id = req.body.googlePlaceId || null;
    if ('ownerUserId' in req.body) patch.owner_user_id = req.body.ownerUserId || null;
    if ('subscriptionId' in req.body) patch.subscription_id = req.body.subscriptionId || null;
  }

  const { data, error } = await db
    .from('restaurants')
    .update(patch)
    .eq('id', ctx.restaurant.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- Branding: logo --------------------------------------------------------------------------
//
// Base64 in the JSON body, not multipart -- same shape as the QR upload above, and this codebase
// has no multipart-parsing code to reuse. Stored in Supabase Storage (not a DB column, unlike
// qr_codes) because a logo is re-served on every diner's menu load, not downloaded once by an
// admin: a public object URL means Storage's own CDN serves it, not this API.
router.post('/restaurants/:id/logo', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;

  const { error: badImage, bytes, mime } = decodeLogo(req.body.image);
  if (badImage) return res.status(400).json({ error: badImage });

  // Fixed, extension-free path with upsert: true -- always overwrites the same object even if the
  // format changes between uploads, so switching PNG -> JPEG never leaves an orphaned file behind.
  const { error: uploadError } = await supabase.storage
    .from('branding')
    .upload(ctx.restaurant.id, bytes, { contentType: mime, upsert: true });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(ctx.restaurant.id);
  // Cache-busted so the header updates the moment this response lands, rather than however long a
  // diner's browser had cached the previous logo under this same URL.
  const logoUrl = `${publicUrl}?v=${Date.now()}`;

  const { error } = await db.from('restaurants').update({ logo_url: logoUrl }).eq('id', ctx.restaurant.id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ logoUrl });
});

// --- Overview ------------------------------------------------------------------------------

// The dashboard's numbers in one request: today's count, the all-time average, how many open
// issues need a response, the most recent three of those in full, and how many times the QR code
// has been scanned (today, and lifetime).
router.get('/restaurants/:id/summary', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const { data: visits, error } = await db
    .from('visits')
    .select('id, rating, comment, contact, resolved, created_at')
    .eq('restaurant_id', ctx.restaurant.id)
    .not('rating', 'is', null)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const summary = summarizeOverview(visits, ctx.restaurant.alert_threshold);

  // Dish counts for the urgent preview only -- bounded to the (at most 3) visits being shown,
  // not every visit, so this stays a cheap second query rather than the full feedback join.
  if (summary.urgent.length) {
    const { data: ratings } = await db
      .from('item_ratings')
      .select('visit_id')
      .in('visit_id', summary.urgent.map((v) => v.id));
    const counts = new Map();
    (ratings || []).forEach((r) => counts.set(r.visit_id, (counts.get(r.visit_id) || 0) + 1));
    summary.urgent = summary.urgent.map((v) => ({ ...v, itemCount: counts.get(v.id) || 0 }));
  }

  // Counted, not fetched -- qr_scans can hold 30 days of one row per page load, and nothing here
  // needs the rows themselves. UTC day boundary, same reasoning as summarizeOverview's todayCount:
  // deterministic regardless of which timezone the process happens to run in.
  const todayStartIso = new Date(Math.floor(Date.now() / 86400000) * 86400000).toISOString();
  const [{ count: scansToday }, { count: totalScans }] = await Promise.all([
    db.from('qr_scans').select('*', { count: 'exact', head: true })
      .eq('restaurant_id', ctx.restaurant.id).gte('created_at', todayStartIso),
    db.from('qr_scans').select('*', { count: 'exact', head: true })
      .eq('restaurant_id', ctx.restaurant.id),
  ]);
  summary.scansToday = scansToday || 0;
  summary.totalScans = totalScans || 0;

  res.json(summary);
});

// Fixed 30-day window, matching qr_scans' own retention (routes/cron.js purges past that) --
// a longer range would show ratings trending back further than scans ever can.
router.get('/restaurants/:id/analytics', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const windowStartIso = new Date(Math.floor(Date.now() / 86400000) * 86400000 - (WINDOW_DAYS - 1) * 86400000).toISOString();

  const [{ data: scans, error: scansErr }, { data: visits, error: visitsErr }, { data: requests, error: requestsErr }] = await Promise.all([
    db.from('qr_scans').select('created_at')
      .eq('restaurant_id', ctx.restaurant.id).gte('created_at', windowStartIso),
    db.from('visits').select('rating, created_at')
      .eq('restaurant_id', ctx.restaurant.id).not('rating', 'is', null).gte('created_at', windowStartIso),
    // Skipped entirely for restaurants that never turned the feature on -- no point querying a
    // table that will only ever answer zero rows for them.
    ctx.restaurant.service_requests_enabled
      ? db.from('service_requests').select('kind, created_at').eq('restaurant_id', ctx.restaurant.id).gte('created_at', windowStartIso)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (scansErr) return res.status(500).json({ error: scansErr.message });
  if (visitsErr) return res.status(500).json({ error: visitsErr.message });
  if (requestsErr) return res.status(500).json({ error: requestsErr.message });

  res.json(buildAnalytics(scans, visits, requests));
});

// --- Menu --------------------------------------------------------------------------------

// The console's menu editor loads in one request. Archived items are included so the editor can
// offer "restore"; the diner surface filters them out separately.
router.get('/restaurants/:id/menu', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const { data: categories, error } = await db
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', ctx.restaurant.id)
    .order('position');
  if (error) return res.status(500).json({ error: error.message });

  const ids = categories.map((c) => c.id);
  const { data: items } = ids.length
    ? await db.from('menu_items').select('*').in('category_id', ids).order('position')
    : { data: [] };

  // Rating count next to each name in the editor -- popularity at a glance while managing the
  // menu. The same raw count diners see on the live page (routes/public.js), not the
  // honesty-gated average lib/dishes.js computes for the Dishes page.
  const itemIds = items.map((i) => i.id);
  const { data: ratingRows } = itemIds.length
    ? await db.from('item_ratings').select('menu_item_id').in('menu_item_id', itemIds)
    : { data: [] };
  const ratingCounts = new Map();
  (ratingRows || []).forEach((r) => ratingCounts.set(r.menu_item_id, (ratingCounts.get(r.menu_item_id) || 0) + 1));

  res.json(
    categories.map((c) => ({
      ...c,
      items: items
        .filter((i) => i.category_id === c.id)
        .map((i) => ({ ...i, rating_count: ratingCounts.get(i.id) || 0 })),
    }))
  );
});

router.post('/restaurants/:id/categories', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;
  if (!req.body.name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await db
    .from('menu_categories')
    .insert({
      restaurant_id: ctx.restaurant.id,
      name: req.body.name,
      position: Number(req.body.position) || 0,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/restaurants/:id/categories/:categoryId', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;

  const patch = {};
  if ('name' in req.body) patch.name = req.body.name;
  if ('position' in req.body) patch.position = Number(req.body.position) || 0;
  if ('hours' in req.body) {
    const problem = hoursError(req.body.hours);
    if (problem) return res.status(400).json({ error: problem });
    patch.hours = req.body.hours;
  }

  // Scoped by restaurant_id as well as id: without that second filter, a valid category id
  // belonging to another restaurant would be editable by anyone who could guess it.
  const { data, error } = await db
    .from('menu_categories')
    .update(patch)
    .eq('id', req.params.categoryId)
    .eq('restaurant_id', ctx.restaurant.id)
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Category not found' });
  res.json(data);
});

// Cascades to its items, and through them would cascade to their ratings -- so this refuses once
// any dish under it has been rated. Deleting an empty section is tidying; deleting a section with
// history destroys the analytics the restaurant is paying to look at. Archive the dishes instead.
router.delete('/restaurants/:id/categories/:categoryId', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;

  const { data: items } = await db
    .from('menu_items')
    .select('id')
    .eq('category_id', req.params.categoryId);

  const itemIds = (items || []).map((i) => i.id);
  if (itemIds.length) {
    const { count } = await db
      .from('item_ratings')
      .select('id', { count: 'exact', head: true })
      .in('menu_item_id', itemIds);
    if (count > 0) {
      return res.status(409).json({ error: 'This section has rated dishes. Archive the dishes instead.' });
    }
  }

  const { error } = await db
    .from('menu_categories')
    .delete()
    .eq('id', req.params.categoryId)
    .eq('restaurant_id', ctx.restaurant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Every category id the caller's restaurant owns. This is the scope for all item writes below --
// items hang off categories, not off the restaurant, so there is no restaurant_id to filter on.
async function ownCategoryIds(restaurantId) {
  const { data } = await db.from('menu_categories').select('id').eq('restaurant_id', restaurantId);
  return (data || []).map((c) => c.id);
}

router.post('/restaurants/:id/items', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;

  const { categoryId, name, description, price, position, spiceLevel, diet, allergens, promoLabel } = req.body;
  if (!categoryId || !name) return res.status(400).json({ error: 'categoryId and name are required' });

  const owned = await ownCategoryIds(ctx.restaurant.id);
  if (!owned.includes(categoryId)) return res.status(404).json({ error: 'Category not found' });

  const cents = parsePrice(price);
  // NaN means they typed something that was not a price. Distinct from null (no price), which is
  // a legitimate menu state -- collapsing the two would put a free dish on the menu.
  if (Number.isNaN(cents)) return res.status(400).json({ error: 'price is not a valid amount' });

  const dietErr = dietError(diet);
  if (dietErr) return res.status(400).json({ error: dietErr });
  const allergensErr = allergensError(allergens);
  if (allergensErr) return res.status(400).json({ error: allergensErr });
  const promoErr = promoLabelError(promoLabel);
  if (promoErr) return res.status(400).json({ error: promoErr });

  const { data, error } = await db
    .from('menu_items')
    .insert({
      category_id: categoryId,
      name,
      description: description || null,
      price_cents: cents,
      position: Number(position) || 0,
      spice_level: spiceLevelOf(spiceLevel),
      diet: diet || null,
      allergens: allergens || [],
      promo_label: promoLabel || null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/restaurants/:id/items/:itemId', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;

  const patch = {};
  if ('name' in req.body) patch.name = req.body.name;
  if ('description' in req.body) patch.description = req.body.description || null;
  if ('available' in req.body) patch.available = !!req.body.available;
  if ('position' in req.body) patch.position = Number(req.body.position) || 0;
  // Un-archiving is how the console restores a dish. Its ratings were never deleted, so its whole
  // history comes back with it.
  if ('archived' in req.body) patch.archived_at = req.body.archived ? new Date().toISOString() : null;
  if ('price' in req.body) {
    const cents = parsePrice(req.body.price);
    if (Number.isNaN(cents)) return res.status(400).json({ error: 'price is not a valid amount' });
    patch.price_cents = cents;
  }
  if ('categoryId' in req.body) patch.category_id = req.body.categoryId;
  if ('spiceLevel' in req.body) patch.spice_level = spiceLevelOf(req.body.spiceLevel);
  if ('diet' in req.body) {
    const dietErr = dietError(req.body.diet);
    if (dietErr) return res.status(400).json({ error: dietErr });
    patch.diet = req.body.diet || null;
  }
  if ('allergens' in req.body) {
    const allergensErr = allergensError(req.body.allergens);
    if (allergensErr) return res.status(400).json({ error: allergensErr });
    patch.allergens = req.body.allergens;
  }
  if ('promoLabel' in req.body) {
    const promoErr = promoLabelError(req.body.promoLabel);
    if (promoErr) return res.status(400).json({ error: promoErr });
    patch.promo_label = req.body.promoLabel || null;
  }

  const owned = await ownCategoryIds(ctx.restaurant.id);
  if (patch.category_id && !owned.includes(patch.category_id)) {
    return res.status(404).json({ error: 'Category not found' });
  }
  if (!owned.length) return res.status(404).json({ error: 'Item not found' });

  const { data, error } = await db
    .from('menu_items')
    .update(patch)
    .eq('id', req.params.itemId)
    .in('category_id', owned) // scopes the write to this restaurant's own menu
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Item not found' });
  res.json(data);
});

// --- Feedback ----------------------------------------------------------------------------

// The inbox. Visits newest first, each carrying the dishes rated during that visit -- which is the
// whole reason visits exist as a row: "table 4 hated the ribs AND the service" is one story, not
// two unrelated data points.
router.get('/restaurants/:id/feedback', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  let query = db
    .from('visits')
    .select('*')
    .eq('restaurant_id', ctx.restaurant.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (req.query.maxRating) query = query.lte('rating', Number(req.query.maxRating));
  if (req.query.resolved === 'true') query = query.eq('resolved', true);
  if (req.query.resolved === 'false') query = query.eq('resolved', false);

  const { data: visits, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!visits.length) return res.json([]);

  const { data: ratings } = await db
    .from('item_ratings')
    .select('visit_id, menu_item_id, rating, comment')
    .in('visit_id', visits.map((v) => v.id));

  // Dish names come from a second lookup rather than a PostgREST embed: menu_items is reached
  // through menu_categories, and spelling that join out here is clearer than a nested select
  // string that breaks silently when a foreign key is renamed.
  const itemIds = [...new Set((ratings || []).map((r) => r.menu_item_id))];
  const { data: items } = itemIds.length
    ? await db.from('menu_items').select('id, name').in('id', itemIds)
    : { data: [] };
  const nameOf = new Map((items || []).map((i) => [i.id, i.name]));

  res.json(
    visits.map((v) => ({
      ...v,
      items: (ratings || [])
        .filter((r) => r.visit_id === v.id)
        .map((r) => ({ ...r, name: nameOf.get(r.menu_item_id) || 'Removed dish' })),
    }))
  );
});

// Mark handled, with an internal note. The note is for the restaurant's own record -- it is never
// shown to a diner, and there is no route that would show it to one.
router.patch('/restaurants/:id/visits/:visitId', async (req, res) => {
  const ctx = await resolve(req, res, { write: true });
  if (!ctx) return;

  const patch = {};
  if ('resolved' in req.body) patch.resolved = !!req.body.resolved;
  if ('resolvedNote' in req.body) patch.resolved_note = req.body.resolvedNote || null;

  const { data, error } = await db
    .from('visits')
    .update(patch)
    .eq('id', req.params.visitId)
    .eq('restaurant_id', ctx.restaurant.id) // scopes the write to this restaurant
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Feedback not found' });
  res.json(data);
});

// --- Dishes ------------------------------------------------------------------------------

// "What is working and what needs work." Archived dishes are included in the per-dish rows so the
// console can show their history, and excluded from every leaderboard by lib/dishes.js.
router.get('/restaurants/:id/dishes', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const { data: cats } = await db.from('menu_categories').select('id, name').eq('restaurant_id', ctx.restaurant.id).order('position');
  const catIds = (cats || []).map((c) => c.id);
  if (!catIds.length) return res.json({ dishes: [], boards: { ...leaderboards([]), byCategory: [] }, minRatings: MIN_RATINGS });

  const { data: items } = await db
    .from('menu_items')
    .select('id, name, category_id, archived_at')
    .in('category_id', catIds);

  const { data: ratings } = items.length
    ? await db.from('item_ratings').select('menu_item_id, rating, created_at').in('menu_item_id', items.map((i) => i.id))
    : { data: [] };

  const dishes = summarize(items || [], ratings || []);
  res.json({
    dishes: dishes.sort((a, b) => b.count - a.count),
    boards: { ...leaderboards(dishes), byCategory: categoryBoard(cats, items || [], ratings || []) },
    minRatings: MIN_RATINGS,
  });
});

// --- QR ----------------------------------------------------------------------------------
//
// This repo no longer draws QR codes. They are generated in subscription_management_system --
// which is fed `PUBLIC_BASE_URL/<slug>`, the address this app owns and never changes -- and the
// resulting files are uploaded here. Stored once per restaurant, reprinted from forever after.

// Admin only. Owners download their code; they never replace it. Same reasoning that gates
// google_place_id at the PATCH above: the wrong file here is not noticed until a print run of
// several thousand coasters lands, pointing at somebody else's restaurant.
router.put('/restaurants/:id/qr', requireAdmin, async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const problem = qr.assetError(req.body);
  if (problem) return res.status(400).json({ error: problem });

  // Both formats in one write. Uploading them separately is how a restaurant ends up holding its
  // own SVG next to a neighbour's PNG, and the two files are never compared again after this.
  const { error } = await db.from('qr_codes').upsert({
    restaurant_id: ctx.restaurant.id,
    svg: req.body.svg,
    png: req.body.png,
    updated_at: new Date().toISOString(),
  });
  if (error) return res.status(500).json({ error: error.message });

  res.status(204).end();
});

// Serves what was uploaded, byte for byte. SVG unless PNG is named: it scales to any coaster size
// without softening the edges, and a blurred module is a code that does not scan.
router.get('/restaurants/:id/qr', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const { data, error } = await db
    .from('qr_codes')
    .select('svg, png')
    .eq('restaurant_id', ctx.restaurant.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  // Every restaurant sits here between being created and having its code generated, so this is a
  // normal state rather than a fault. The console reads the 404 as "not ready yet" and says so.
  if (!data) {
    return res.status(404).json({ error: 'No QR code has been uploaded for this restaurant yet' });
  }

  const { buffer, contentType, filename } = qr.asset(data, ctx.restaurant.slug, req.query.format);
  res.set('Content-Type', contentType);
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// --- Service requests (kitchen display) -----------------------------------------------------
//
// Call waiter / request bill, raised from the diner menu (routes/public.js) and cleared here.
// Polled by admin/src/pages/Display.jsx every 5s -- kept to one query on purpose.

// Staleness is handled by acknowledging old rows, never by hiding them here. The dedupe index in
// service_requests.sql keys on acknowledged_at is null, so filtering an old-but-still-open row out
// of this list would let it silently keep blocking that table+kind from ever raising another card
// while diners kept getting told "ok". Absent a restaurant-configured auto-dismiss, cron's fixed
// 4h sweepServiceRequests (routes/cron.js) is the only backstop; with one set, the acknowledge
// below rides this same poll instead, so a display sitting open clears itself on schedule without
// a dedicated cron (Vercel Hobby allows only one).
router.get('/restaurants/:id/service-requests', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const autoDismissMinutes = ctx.restaurant.service_requests_auto_dismiss_minutes;
  if (autoDismissMinutes) {
    const cutoff = new Date(Date.now() - autoDismissMinutes * 60000).toISOString();
    await db
      .from('service_requests')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('restaurant_id', ctx.restaurant.id)
      .is('acknowledged_at', null)
      .lt('created_at', cutoff); // created_at only -- never nudged_at, see service_request_nudge.sql
  }

  const { data, error } = await db
    .from('service_requests')
    .select('id, table_label, kind, created_at, nudged_at')
    .eq('restaurant_id', ctx.restaurant.id)
    .is('acknowledged_at', null)
    .order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Plain resolve(), not { write: true } -- deliberately diverges from every other write in this
// file. The diner buttons above keep working on a lapsed subscription (the menu is never
// billing-gated), so blocking acknowledge here would leave staff unable to clear a screen that
// keeps filling up: an overdue invoice becoming a jammed kitchen display is worse than the
// inconsistency. Everything else in the console still goes read-only as normal.
router.patch('/restaurants/:id/service-requests/:requestId', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;

  const { data, error } = await db
    .from('service_requests')
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: req.user.id })
    .eq('id', req.params.requestId)
    .eq('restaurant_id', ctx.restaurant.id) // scopes the write to this restaurant
    .select('id')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Request not found' });
  res.status(204).end();
});

module.exports = router;
