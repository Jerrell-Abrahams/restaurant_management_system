const { db } = require('../config/supabase');
const email = require('./email');

// "You will know within fifteen minutes when a table was unhappy" is the line that sells this
// product, so this file is the product working.
//
// There is no scheduler. Alerts fire on submission, debounced against restaurants.last_alert_at:
// more than fifteen minutes since the last one, send everything that has happened since; inside
// the window, stay quiet and let the next submission carry it. One column, no per-row alert flags,
// no queue -- and a bad lunch service sends one email instead of eleven.
//
// The daily cron (routes/cron.js) is the backstop for the one case this misses: a burst whose last
// bad rating lands inside the window and is never followed by another.

const WINDOW_MS = 15 * 60 * 1000;

// Dish ratings alert at 2, not at the restaurant's visit threshold. A single 3-star dish is
// ordinary and would drown the signal; a 1 or a 2 on a plate of food is somebody actually
// complaining.
const ITEM_ALERT_AT = 2;

// How far back a first-ever alert looks. Without a bound, a restaurant that sets an alert email
// months after going live would get one enormous email covering its entire history.
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function shouldSend(lastAlertAt, now = Date.now()) {
  if (!lastAlertAt) return true;
  return now - new Date(lastAlertAt).getTime() >= WINDOW_MS;
}

// The window an alert covers: everything since the last one, or the last 24 hours on a first run.
function since(lastAlertAt, now = Date.now()) {
  return lastAlertAt ? new Date(lastAlertAt) : new Date(now - FIRST_RUN_LOOKBACK_MS);
}

// Filled/empty stars, inline-styled since this renders in an email client, not the console.
const stars = (n) =>
  `<span style="color:#d6a83f;letter-spacing:1px">${'★'.repeat(n)}</span>` +
  `<span style="color:#d8d1c4;letter-spacing:1px">${'☆'.repeat(5 - n)}</span>`;

const esc = (s) =>
  String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const time = (iso) =>
  new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * The alert email. Pure, so its copy is testable -- and it is tested, because COMPLIANCE.md rule 3
 * forbids incentive language and this is the one place a well-meaning edit would add "offer them a
 * free dessert".
 */
function renderEmail({ restaurant, visits, itemRatings, consoleUrl }) {
  const total = visits.length + itemRatings.length;
  const subject =
    visits.length && itemRatings.length
      ? `${restaurant.name}: ${visits.length} unhappy visit${visits.length === 1 ? '' : 's'}, ${itemRatings.length} poor dish rating${itemRatings.length === 1 ? '' : 's'}`
      : visits.length
        ? `${restaurant.name}: ${visits.length} unhappy visit${visits.length === 1 ? '' : 's'}`
        : `${restaurant.name}: ${itemRatings.length} poor dish rating${itemRatings.length === 1 ? '' : 's'}`;

  const visitBlocks = visits
    .map(
      (v) => `
      <tr><td style="padding:14px 0;border-top:1px solid #eaeaea">
        <div style="font-size:15px;line-height:1">${stars(v.rating)}</div>
        <div style="margin-top:6px;font-size:14px;color:#0a0a0a">
          ${v.comment ? esc(v.comment) : '<span style="color:#8a8a8a">No comment left</span>'}
        </div>
        <div style="margin-top:5px;font-size:12px;color:#8a8a8a">${esc(time(v.created_at))}</div>
        ${
          v.contact
            ? `<div style="margin-top:8px;padding:8px 10px;background:#f5f6f7;border-radius:6px;font-size:13px;color:#0a0a0a">
                 They asked to be contacted: <strong>${esc(v.contact)}</strong>
               </div>`
            : ''
        }
      </td></tr>`
    )
    .join('');

  const itemBlocks = itemRatings
    .map(
      (i) => `
      <tr><td style="padding:12px 0;border-top:1px solid #eaeaea">
        <div style="font-size:14px;color:#0a0a0a">
          <span style="font-size:13px;vertical-align:middle">${stars(i.rating)}</span>
          <strong style="margin-left:6px">${esc(i.name)}</strong>
        </div>
        ${i.comment ? `<div style="margin-top:5px;font-size:13px;color:#5f6268">${esc(i.comment)}</div>` : ''}
        <div style="margin-top:4px;font-size:12px;color:#8a8a8a">${esc(time(i.created_at))}</div>
      </td></tr>`
    )
    .join('');

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <h1 style="margin:0;font-size:18px;color:#0a0a0a">${esc(restaurant.name)}</h1>
    <p style="margin:4px 0 20px;font-size:14px;color:#5f6268">
      ${total} thing${total === 1 ? '' : 's'} worth looking at since your last alert.
    </p>
    <table style="width:100%;border-collapse:collapse">
      ${visitBlocks}
      ${itemBlocks}
    </table>
    <a href="${consoleUrl}" style="display:inline-block;margin-top:24px;padding:11px 18px;background:#00c08b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
      Open the feedback inbox
    </a>
    <p style="margin-top:24px;font-size:11.5px;line-height:1.5;color:#8a8a8a">
      Sent because these ratings were at or below your alert threshold. Several in a row arrive as
      one email, not several. Change the threshold or turn alerts off in Settings.
    </p>
  </div>`;

  return { subject, html };
}

/**
 * Sends an alert for one restaurant if the debounce window has elapsed and there is anything to
 * report. Safe to call on every low rating -- that is the intended use.
 */
async function maybeAlert(restaurantId, { now = Date.now, sendEmail = email.send } = {}) {
  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, name, alert_email, alert_threshold, last_alert_at')
    .eq('id', restaurantId)
    .maybeSingle();

  // No address configured is the ordinary "alerts off" state, not an error.
  if (!restaurant || !restaurant.alert_email) return { sent: false, reason: 'no-recipient' };
  if (!shouldSend(restaurant.last_alert_at, now())) return { sent: false, reason: 'debounced' };

  const previous = restaurant.last_alert_at;
  const stamp = new Date(now()).toISOString();

  // Compare-and-swap on last_alert_at. Two diners submitting bad ratings in the same second would
  // otherwise both read a stale timestamp and both send -- duplicate emails being exactly what
  // this feature exists to prevent. Only the writer that matches the value it read proceeds.
  let claim = db.from('restaurants').update({ last_alert_at: stamp }).eq('id', restaurant.id);
  claim = previous ? claim.eq('last_alert_at', previous) : claim.is('last_alert_at', null);
  const { data: won } = await claim.select('id');
  if (!won || won.length === 0) return { sent: false, reason: 'lost-race' };

  const cutoff = since(previous, now()).toISOString();

  const { data: visits } = await db
    .from('visits')
    .select('id, rating, comment, contact, created_at')
    .eq('restaurant_id', restaurant.id)
    .lte('rating', restaurant.alert_threshold)
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false });

  const { data: cats } = await db.from('menu_categories').select('id').eq('restaurant_id', restaurant.id);
  const catIds = (cats || []).map((c) => c.id);
  const { data: items } = catIds.length
    ? await db.from('menu_items').select('id, name').in('category_id', catIds)
    : { data: [] };
  const nameOf = new Map((items || []).map((i) => [i.id, i.name]));

  const { data: rawItemRatings } = items && items.length
    ? await db
        .from('item_ratings')
        .select('menu_item_id, rating, comment, created_at')
        .in('menu_item_id', items.map((i) => i.id))
        .lte('rating', ITEM_ALERT_AT)
        .gt('created_at', cutoff)
        .order('created_at', { ascending: false })
    : { data: [] };

  const itemRatings = (rawItemRatings || []).map((r) => ({ ...r, name: nameOf.get(r.menu_item_id) || 'A dish' }));

  if (!visits?.length && !itemRatings.length) {
    // Nothing to report. Hand the timestamp back so the window is not silently consumed -- the
    // next genuinely bad rating should alert immediately, not wait out a window it never used.
    await db.from('restaurants').update({ last_alert_at: previous }).eq('id', restaurant.id);
    return { sent: false, reason: 'nothing-to-report' };
  }

  const consoleUrl = `${(process.env.CONSOLE_URL || 'https://res.complexai.co.za').replace(/\/+$/, '')}/r/${restaurant.id}`;
  const { subject, html } = renderEmail({ restaurant, visits, itemRatings, consoleUrl });

  try {
    await sendEmail({ to: restaurant.alert_email, subject, html });
  } catch (err) {
    // Roll the timestamp back so the next submission retries rather than the batch vanishing into
    // a window that was claimed but never delivered.
    await db.from('restaurants').update({ last_alert_at: previous }).eq('id', restaurant.id);
    return { sent: false, reason: 'send-failed', error: err.message };
  }

  return { sent: true, visits: visits.length, items: itemRatings.length };
}

// ponytail: email only, called directly. WhatsApp would slot in here as a second call rather than
// behind a channel interface -- one implementation does not need an abstraction, and Boksburg
// owners reading WhatsApp faster than email is a guess until a customer says so.
module.exports = { maybeAlert, shouldSend, since, renderEmail, WINDOW_MS, ITEM_ALERT_AT };
