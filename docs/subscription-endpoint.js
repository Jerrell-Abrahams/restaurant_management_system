// ============================================================================================
// PASTE THIS INTO subscription_management_system, in src/routes/site.js
// (above `module.exports = router;`). Then set PLATFORM_SECRET in that project's env, matching
// SUBSCRIPTION_API_SECRET here.
//
// It is NOT applied automatically -- that repo is a deployed production API and this is a change
// to it, not to us. Nothing else in that project needs touching: `supabase` and `isActive` are
// already imported at the top of site.js, and the router is already mounted with permissive CORS
// and a per-IP cap in server.js.
//
// Why this exists: billing lives in that project's Postgres, the restaurant tables live in the
// complex management project's. A cross-project foreign key is impossible, so the restaurant app
// asks over HTTP instead. See src/lib/billing.js here for the calling side.
// ============================================================================================

// Server-to-server only: called by the restaurant platform, never by a browser. Guarded by a
// shared secret rather than a session, because there is no user in this request -- the restaurant
// API is asking on its own behalf about a subscription its own database cannot see.
router.get('/subscription', async (req, res) => {
  // Explicit unset check first. Without it an unset PLATFORM_SECRET compares undefined to a
  // missing header, matches, and the endpoint is wide open the moment someone forgets an env var.
  const expected = process.env.PLATFORM_SECRET;
  if (!expected || req.headers['x-platform-secret'] !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id query parameter is required' });

  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('id', id)
    .maybeSingle();

  // ponytail: fail open on our own error, matching /status directly above -- an outage here must
  // not turn every restaurant console read-only at once.
  if (error) return res.json({ active: true, reason: 'unavailable' });

  // ponytail: fail open on an unknown id too, and for the same reason /status fails open on an
  // unregistered domain: a restaurant is only ever blocked after its subscription is correctly
  // wired here AND has lapsed. A typo'd id must not lock a paying customer out of their console.
  if (!subscription) return res.json({ active: true, reason: 'unknown' });

  const active = isActive(subscription);
  res.set('Cache-Control', 'private, max-age=60'); // the caller caches for 5 minutes as well
  res.json({ active, reason: subscription.status });
});
