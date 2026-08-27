// Billing lives in a different Supabase project (and a different app) from everything else here,
// so "is this restaurant paid up?" cannot be a join -- it is an HTTP call to
// subscription_management_system.
//
// Posture is copied deliberately from that project's own /api/site/status, which gates customer
// websites: cache briefly, and FAIL OPEN. A status-API outage must never dark every restaurant's
// console at once. The failure we are willing to accept is a lapsed restaurant keeping its
// console for a few extra minutes; the one we are not is every paying customer losing theirs
// because a token expired somewhere else.

const CACHE_MS = 5 * 60 * 1000;
// ponytail: per-process Map, so each Vercel lambda warms its own. Fine at this scale -- the worst
// case is a few extra calls per cold start. Move to Upstash/Redis only if the subscription API
// starts noticing the traffic.
const cache = new Map();

function cached(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.active;
  return undefined;
}

/**
 * @param subscriptionId  The subscriptions.id from the OTHER project, or null.
 * @returns true if the console should be writable.
 *
 * A null subscriptionId is "not gated", not "lapsed" -- a restaurant can be created and have its
 * menu built before billing is attached, and locking it out at that moment would make onboarding
 * impossible.
 */
async function isActive(subscriptionId, { fetchImpl = fetch, now = Date.now } = {}) {
  if (!subscriptionId) return true;

  const hit = cached(subscriptionId);
  if (hit !== undefined) return hit;

  const base = process.env.SUBSCRIPTION_API_URL;
  const secret = process.env.SUBSCRIPTION_API_SECRET;
  // Unconfigured is not the same as lapsed. In local dev, and before the endpoint is deployed,
  // the gate is simply off rather than blocking every write.
  if (!base || !secret) return true;

  try {
    const res = await fetchImpl(`${base}/api/site/subscription?id=${encodeURIComponent(subscriptionId)}`, {
      headers: { 'x-platform-secret': secret },
      signal: AbortSignal.timeout(4000), // a slow biller must not hang a console request
    });
    if (!res.ok) return true; // fail open, and do not cache a failure as a fact
    const body = await res.json();
    const active = body.active !== false;
    cache.set(subscriptionId, { active, at: now() });
    return active;
  } catch {
    return true; // network error, timeout, bad JSON -- all fail open
  }
}

// Exposed for tests and for the admin console's "refresh billing" affordance.
function clearCache() {
  cache.clear();
}

module.exports = { isActive, clearCache, CACHE_MS };
