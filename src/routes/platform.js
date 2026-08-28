const express = require('express');
const supabase = require('../config/supabase');
const { db } = require('../config/supabase');
const { normalizeSlug, slugError } = require('../lib/slug');
const qr = require('../lib/qr');

const router = express.Router();

// Server-to-server only: called by subscription_management_system's admin console right after
// it creates the billing subscription there, never by a browser or by the console in this repo.
// Its own namespace rather than a route on /api/admin, because that router's `auth` middleware
// expects a staff Supabase session -- there is no user in this request, only a shared secret,
// the same shape as /api/cron's CRON_SECRET and the mirror image of GET /api/site/subscription
// on the other side (that one guards restaurant-repo-asks-about-billing; this one guards
// subscription-repo-asks-us-to-provision-a-restaurant).
const DUPLICATE = '23505';

// One call does what would otherwise be three manual steps (create the owner's Supabase Auth
// account in THIS project, add them to restaurant.staff, create the restaurants row) -- see
// README.md's "Staff rows are added in the SQL editor" note, which this replaces for the
// restaurant-onboarding path specifically. Staff rows for ComplexAI's own admins are unaffected
// and still SQL-only.
router.post('/provision', async (req, res) => {
  const expected = process.env.PROVISION_SECRET;
  if (!expected || req.headers['x-provision-secret'] !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { subscriptionId, email, password, fullName, restaurantName, slug: slugInput, googlePlaceId } = req.body || {};
  if (!subscriptionId || !email || !password || !restaurantName) {
    return res.status(400).json({ error: 'subscriptionId, email, password and restaurantName are required' });
  }

  // Idempotent on subscriptionId: the caller retries this exact call on failure (see its own
  // comments), and a subscription is only ever provisioned once. Checked first so a retry after
  // full success is a no-op read, not a second restaurant.
  const { data: existing, error: existingError } = await db
    .from('restaurants')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (existing) {
    return res.json({ ...existing, qr_target_url: qr.targetUrl(existing.slug) });
  }

  const slug = normalizeSlug(slugInput || restaurantName);
  const bad = slugError(slug);
  if (bad) return res.status(400).json({ error: bad });

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    // ponytail: no lookup-and-reuse on email_exists. listUsers() has no email filter to search
    // by, and guessing that a duplicate email belongs to THIS retry (rather than an unrelated
    // apartment/funeral/auto-repair customer who happens to share it, or an earlier unrelated
    // signup) risks attaching a stranger's account to this restaurant. Surfacing loudly and
    // asking for a fresh email is the safe failure here; it only bites the rare case where the
    // auth user was created on a prior attempt but the restaurant row after it was not.
    const status = createError.code === 'email_exists' ? 409 : 400;
    return res.status(status).json({ error: createError.message });
  }

  const { error: staffError } = await db.from('staff').insert({ user_id: created.user.id, name: fullName || null });
  if (staffError) return res.status(500).json({ error: staffError.message });

  const { data: restaurant, error: restaurantError } = await db
    .from('restaurants')
    .insert({ subscription_id: subscriptionId, owner_user_id: created.user.id, name: restaurantName, slug, google_place_id: googlePlaceId || null })
    .select()
    .single();

  if (restaurantError && restaurantError.code === DUPLICATE) {
    return res.status(409).json({ error: `Slug "${slug}" is already taken` });
  }
  if (restaurantError) return res.status(500).json({ error: restaurantError.message });

  res.status(201).json({ ...restaurant, qr_target_url: qr.targetUrl(restaurant.slug) });
});

module.exports = router;
