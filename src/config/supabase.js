require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Service-role client: bypasses RLS. Every route that uses it does its own authz -- same
// contract as subscription_management_system. This key must never reach the admin build.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Everything this product owns lives in the `restaurant` schema; the shared billing/auth tables
// (products, subscriptions, app_users) live in public and are reached via `supabase` directly.
// One line here so no call site has to remember .schema().
const db = supabase.schema('restaurant');

module.exports = supabase;
module.exports.db = db;
