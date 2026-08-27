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

  const out = { swept: 0, purged: 0, warm: false };

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
