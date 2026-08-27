const supabase = require('../config/supabase');
const { db } = require('../config/supabase');

// Verifies a Supabase session token and establishes that the caller belongs to THIS application.
//
// The second half is the load-bearing part. This is a shared Supabase project -- the apartment
// system, the funeral app and the auto-repair app all sign users into the same auth.users -- so a
// valid token proves someone is signed into something, not that they have any business here. A
// row in restaurant.staff is the boundary; being `authenticated` is not.
//
// Note what is NOT consulted: public.users / roles / tenants. Those model apartment residents and
// complexes, and a restaurant owner is neither.
module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { data: staff } = await db
    .from('staff')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle();

  // A signed-in user of one of the sibling apps lands here. 403, not 401: their token is fine,
  // they simply are not a user of this product.
  if (!staff) {
    return res.status(403).json({ error: 'Not authorized for this application' });
  }

  req.user = user;
  req.isAdmin = !!staff.is_admin;
  next();
};

// For the routes only ComplexAI may call: creating restaurants, and setting slugs, Place IDs,
// owners and the subscription link.
module.exports.requireAdmin = function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  next();
};
