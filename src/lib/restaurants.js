const { db } = require('../config/supabase');
const billing = require('./billing');

// Loads a restaurant and decides what the caller may do with it.
//
// Two things this does NOT do, both because billing lives in a different Supabase project:
// there is no join to a subscriptions table, and there is no foreign key to trust. The paid/
// lapsed answer is an HTTP call with its own cache and fail-open rules -- see lib/billing.js.

async function load(match) {
  const { data: restaurant } = await db.from('restaurants').select('*').match(match).maybeSingle();
  if (!restaurant) return null;

  return { restaurant, active: await billing.isActive(restaurant.subscription_id) };
}

const byId = (id) => load({ id });
// Slug is stored lowercase by the API and the unique index is on lower(slug), so the lookup
// normalizes too -- otherwise a coaster printed before that rule existed stops resolving.
const bySlug = (slug) => load({ slug: String(slug || '').toLowerCase() });

// Resolves the :id in the path to a restaurant this caller is allowed to touch, or answers the
// request itself and returns null. Call sites read:
//   const ctx = await resolve(req, res, { write: true });
//   if (!ctx) return;
async function resolve(req, res, { write = false } = {}) {
  const ctx = await byId(req.params.id);
  if (!ctx) {
    res.status(404).json({ error: 'Restaurant not found' });
    return null;
  }

  // Ownership is one column. A restaurant is one paying customer, so there is no membership
  // table -- add one the day a restaurant genuinely needs two logins. Admins pass through to
  // every restaurant.
  if (!req.isAdmin && ctx.restaurant.owner_user_id !== req.user.id) {
    // 404 rather than 403: a restaurant that isn't yours shouldn't be confirmable by probing ids.
    res.status(404).json({ error: 'Restaurant not found' });
    return null;
  }

  // Lapsed subscription = read-only console. The diner surface is deliberately unaffected -- see
  // COMPLIANCE.md and routes/public.js; breaking a printed coaster mid-service is not a billing
  // lever we are willing to pull.
  if (write && !ctx.active && !req.isAdmin) {
    res.status(402).json({ error: 'Subscription inactive — the console is read-only', code: 'inactive' });
    return null;
  }

  return ctx;
}

module.exports = { byId, bySlug, resolve };
