const { Resend } = require('resend');

// Adapted from subscription_management_system's src/lib/email.js. One difference matters: that
// system only ever mails its own operator, so an unverified resend.dev sender is fine there. This
// one mails RESTAURANT OWNERS, and Resend will not deliver to a third party from an unverified
// domain -- every alert would vanish silently. So complexai.co.za has to be verified in Resend
// (DNS at Host Africa) before alerts do anything.
//
// The client is built on first use, not at require() time. `new Resend(undefined)` throws, and
// this module is reachable from the request path -- eagerly constructing it would take the whole
// API down, diner surface included, purely because alerts are not configured yet. An unconfigured
// optional feature must never be able to break a required one.
let client = null;
function resend() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Throws on failure. Callers decide whether that is fatal: lib/alerts.js rolls its debounce
// timestamp back so the next submission retries, and the cron logs and moves on.
async function send({ to, subject, html }) {
  const from = process.env.ALERT_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  if (!from) throw new Error('ALERT_FROM_EMAIL is not set');
  if (!to) throw new Error('no recipient');

  const { error } = await resend().emails.send({
    from: from.includes('<') ? from : `Complex AI <${from}>`,
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message);
}

// True when mail can actually be delivered. Used by the cron so an unconfigured install logs one
// clear line instead of a failure per restaurant.
const configured = () => !!(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);

module.exports = { send, configured };
