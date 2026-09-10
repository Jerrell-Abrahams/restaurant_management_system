const express = require('express');
const { db } = require('../config/supabase');
const alerts = require('../lib/alerts');
const email = require('../lib/email');

const router = express.Router();

// Vercel Hobby allows one cron a day, so this is one route doing three small jobs rather than
// three schedules. Registered in vercel.json as `0 4 * * *`; Vercel sends CRON_SECRET
// automatically as a bearer token.

// COMPLIANCE.md rule 6. Diner contact details are personal information under POPIA and this is the
// retention limit, not housekeeping -- it must not be disabled. The visit itself is kept: feedback
// is not personal information, and deleting it would destroy the restaurant's history.
const RETENTION_DAYS = 90;

async function purgeContacts(now = Date.now()) {
  const cutoff = new Date(now - RETENTION_DAYS * 86400000).toISOString();
  const { data, error } = await db
    .from('visits')
    .update({ contact: null })
    .not('contact', 'is', null)
    .lt('created_at', cutoff)
    .select('id');
  if (error) throw new Error(`contact purge failed: ${error.message}`);
  return (data || []).length;
}

// service_requests has a partial unique index keyed on acknowledged_at is null (see
// src/db/service_requests.sql) -- deliberately no time filter on the console's read side, so a
// request nobody cleared would otherwise block that table+kind from ever raising another card.
// This is what makes that safe: 4h mirrors VISIT_TTL_MS, one sitting -- anything still open after
// that belongs to a service that's over. Acknowledged, not deleted, so it stays counted for the
// 30-day abuse-detection trail below.
const SERVICE_REQUEST_STALE_MS = 4 * 3600000;
const SERVICE_REQUEST_RETENTION_DAYS = 30;

async function sweepServiceRequests(now = Date.now()) {
  const staleCutoff = new Date(now - SERVICE_REQUEST_STALE_MS).toISOString();
  const { data: staled } = await db
    .from('service_requests')
    .update({ acknowledged_at: new Date(now).toISOString() })
    .is('acknowledged_at', null)
    .lt('created_at', staleCutoff)
    .select('id');

  // Housekeeping, not a legal obligation -- unlike purgeContacts below, this is here to keep the
  // table small, not because COMPLIANCE.md requires it.
  const oldCutoff = new Date(now - SERVICE_REQUEST_RETENTION_DAYS * 86400000).toISOString();
  await db.from('service_requests').delete().lt('created_at', oldCutoff);

  return (staled || []).length;
}

// Housekeeping, not a legal obligation -- there is no personal information in this table, just a
// salted ip_hash (COMPLIANCE.md 5). Same posture as service_requests' own retention sweep above:
// purged purely to keep the table small.
const QR_SCAN_RETENTION_DAYS = 30;

async function purgeScans(now = Date.now()) {
  const cutoff = new Date(now - QR_SCAN_RETENTION_DAYS * 86400000).toISOString();
  const { error } = await db.from('qr_scans').delete().lt('created_at', cutoff);
  if (error) throw new Error(`scan purge failed: ${error.message}`);
}

// Longer than a scan because an order is a business record -- "what did we sell last month" is a
// question an owner asks, and a scan is not. Still bounded: nothing here is a legal archive, and
// the table grows per plate rather than per visit.
//
// Also unlike a scan, an order carries nothing personal at all -- a table number is not a person
// -- so this window is about table size, not POPIA. order_items cascades on delete.
const ORDER_RETENTION_DAYS = 90;

async function purgeOrders(now = Date.now()) {
  const cutoff = new Date(now - ORDER_RETENTION_DAYS * 86400000).toISOString();
  const { error } = await db.from('orders').delete().lt('created_at', cutoff);
  if (error) throw new Error(`order purge failed: ${error.message}`);
}

// The backstop for the one case the on-submit debounce misses: a burst whose final bad rating
// lands inside the fifteen-minute window and is never followed by another submission, so nothing
// ever triggers the send. Calling maybeAlert here is safe and idempotent -- it debounces and
// checks for anything to report on its own.
async function sweepAlerts() {
  const { data: restaurants } = await db
    .from('restaurants')
    .select('id')
    .not('alert_email', 'is', null);

  const results = [];
  for (const r of restaurants || []) {
    try {
      const result = await alerts.maybeAlert(r.id);
      if (result.sent) results.push(r.id);
    } catch (err) {
      // One restaurant's failure must not stop the sweep, and definitely must not stop the purge
      // below it -- that one is a legal obligation.
      console.error(`[cron] alert sweep failed for ${r.id}:`, err.message);
    }
  }
  return results.length;
}

router.get('/daily', async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  const out = { swept: 0, purged: 0, staled: 0, warm: false };

  if (email.configured()) {
    out.swept = await sweepAlerts().catch((err) => {
      console.error('[cron] sweep failed:', err.message);
      return 0;
    });
  } else {
    // One clear line rather than a failure per restaurant. Alerts are off until complexai.co.za is
    // verified in Resend, and that is a setup step, not a fault.
    console.log('[cron] alerts skipped: RESEND_API_KEY / ALERT_FROM_EMAIL not set');
  }

  // Runs even if the sweep threw. This is the retention limit and it is not optional.
  try {
    out.purged = await purgeContacts();
  } catch (err) {
    console.error('[cron] POPIA purge FAILED:', err.message);
    out.purgeError = err.message;
  }

  // Independent of the two above: a failure here must not skip the retention purge, and the
  // purge must not skip this. Nothing downstream depends on this order beyond that.
  try {
    out.staled = await sweepServiceRequests();
  } catch (err) {
    console.error('[cron] service-request sweep failed:', err.message);
  }

  try {
    await purgeScans();
  } catch (err) {
    console.error('[cron] scan purge failed:', err.message);
  }

  // Its own try, not folded into the one above: an ordering restaurant losing its scan purge
  // because a purge it does not even use threw is the kind of coupling that makes one bad night
  // two bad nights.
  try {
    await purgeOrders();
  } catch (err) {
    console.error('[cron] order purge failed:', err.message);
  }

  // Keeps the Supabase free tier from pausing after seven idle days. A live restaurant's coasters
  // going dead because nobody queried the database is unacceptable, and this costs one row read.
  const { error: warmErr } = await db.from('restaurants').select('id').limit(1);
  out.warm = !warmErr;

  console.log('[cron] daily:', JSON.stringify(out));
  res.json(out);
});

module.exports = router;
module.exports.purgeContacts = purgeContacts;
module.exports.RETENTION_DAYS = RETENTION_DAYS;
