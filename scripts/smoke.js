// End-to-end smoke test against the LIVE complex management project.
//
// Creates a throwaway restaurant, drives the real HTTP API and the real diner surface, checks what
// actually landed in Postgres, then deletes everything it made. `npm test` covers the pure logic;
// this covers the wiring -- grants, schema exposure, the staff boundary, cookies, upserts.
//
//   1. npm run dev            (or: PORT=3222 node src/server.js)
//   2. npm run smoke
//
// It signs in as SMOKE_EMAIL without needing a password and without sending mail: generateLink
// mints a magic-link token with the service-role key and verifyOtp exchanges it for a session.
// Everything it writes is scoped to the slug below and removed at the end.
require('dotenv').config();
const zlib = require('node:zlib');
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.SMOKE_BASE || 'http://localhost:3222';
const ANON = process.env.SMOKE_ANON;
const ADMIN_EMAIL = process.env.SMOKE_EMAIL;

if (!ANON || !ADMIN_EMAIL) {
  console.error('Set SMOKE_ANON (the project anon key) and SMOKE_EMAIL (an admin in restaurant.staff) in .env');
  process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const db = admin.schema('restaurant');

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
}

// Mints a real session for the admin user without needing their password and without sending
// mail: generateLink returns the token, verifyOtp exchanges it for an access token.
async function sessionToken() {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL });
  if (error) throw new Error('generateLink: ' + error.message);
  const anon = createClient(process.env.SUPABASE_URL, ANON);
  const { data: s, error: e2 } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (e2) throw new Error('verifyOtp: ' + e2.message);
  return s.session.access_token;
}

const api = (token) => async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
};

(async () => {
  const slug = 'smoke-test-grill';
  // Leftovers from a previous aborted run would trip the unique slug index.
  await db.from('restaurants').delete().eq('slug', slug);

  console.log('\n== auth boundary ==');
  const anonCall = await fetch(BASE + '/api/admin/restaurants');
  check('no token is rejected', anonCall.status === 401, `got ${anonCall.status}`);
  const junk = await fetch(BASE + '/api/admin/restaurants', { headers: { Authorization: 'Bearer junk' } });
  check('junk token is rejected', junk.status === 401, `got ${junk.status}`);

  const token = await sessionToken();
  const call = api(token);

  console.log('\n== admin routes ==');
  const { data: staff } = await db.from('staff').select('user_id').eq('is_admin', true).limit(1).single();

  let r = await call('POST', '/api/admin/restaurants', {
    name: 'Smoke Test Grill', slug, googlePlaceId: 'ChIJsmokeTest123',
    ownerUserId: staff.user_id, alertEmail: 'nobody@example.com',
  });
  check('create restaurant', r.status === 201, `got ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  const restaurantId = r.body.id;
  if (!restaurantId) { console.log('\nCannot continue without a restaurant.'); process.exit(1); }

  r = await call('POST', '/api/admin/restaurants', { name: 'Dupe', slug });
  check('duplicate slug is 409', r.status === 409, `got ${r.status}`);

  console.log('\n== platform provisioning ==');
  const provisionSecret = process.env.PROVISION_SECRET;
  let provisionUserId;
  if (!provisionSecret) {
    console.log('  SKIP  provisioning checks (PROVISION_SECRET not set)');
  } else {
    const platformCall = async (headers, body) => {
      const res = await fetch(BASE + '/api/platform/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    };
    const provisionSlug = 'smoke-test-provision';
    const provisionEmail = `smoke-provision-${Date.now()}@example.com`;
    // Leftovers from a previous aborted run would trip both the slug index and (via the auth
    // user it created) a re-run's email uniqueness -- the email is timestamped precisely to
    // sidestep the latter, but the slug is fixed and needs its own sweep.
    await db.from('restaurants').delete().eq('slug', provisionSlug);
    // Subject to change per run since subscriptionId is the idempotency key under test below --
    // a real subscriptions.id from the OTHER project would also work, but this endpoint never
    // reads it as anything but an opaque string, so a random one keeps this test self-contained.
    const subscriptionId = crypto.randomUUID();
    const payload = {
      subscriptionId, email: provisionEmail, password: 'smoke-test-password-1', fullName: 'Smoke Owner',
      restaurantName: 'Smoke Test Provision', slug: provisionSlug,
    };

    let pr = await platformCall({}, payload);
    check('no secret is rejected', pr.status === 401, `got ${pr.status}`);

    pr = await platformCall({ 'x-provision-secret': 'wrong' }, payload);
    check('wrong secret is rejected', pr.status === 401, `got ${pr.status}`);

    pr = await platformCall({ 'x-provision-secret': provisionSecret }, payload);
    check('provision creates the restaurant', pr.status === 201, `got ${pr.status} ${JSON.stringify(pr.body).slice(0, 120)}`);
    const provisionedId = pr.body.id;
    provisionUserId = pr.body.owner_user_id;
    check('owner login was created', !!provisionUserId);
    check('qr_target_url is present', typeof pr.body.qr_target_url === 'string' && pr.body.qr_target_url.includes(provisionSlug));

    // The retry a failed caller would send: same subscriptionId, same everything. Must return
    // the SAME restaurant rather than a second one or a duplicate-email error.
    pr = await platformCall({ 'x-provision-secret': provisionSecret }, payload);
    check('retry with the same subscriptionId is idempotent', pr.status === 200 && pr.body.id === provisionedId, `got ${pr.status}`);

    const { data: ownerLogin } = await db.from('restaurants').select('owner_user_id').eq('id', provisionedId).single();
    check('restaurant row points at the created login', ownerLogin?.owner_user_id === provisionUserId);

    await db.from('restaurants').delete().eq('id', provisionedId);
  }

  r = await call('POST', `/api/admin/restaurants/${restaurantId}/categories`, { name: 'Starters', position: 0 });
  const catStarters = r.body.id;
  check('create category', r.status === 201, `got ${r.status}`);

  r = await call('POST', `/api/admin/restaurants/${restaurantId}/categories`, { name: 'Mains', position: 1 });
  const catMains = r.body.id;

  r = await call('POST', `/api/admin/restaurants/${restaurantId}/items`, {
    categoryId: catStarters, name: 'Calamari', description: 'Grilled, lemon butter', price: 'R89.00',
  });
  const itemCalamari = r.body.id;
  check('create item parses R89.00 to 8900 cents', r.body.price_cents === 8900, `got ${r.body.price_cents}`);

  r = await call('POST', `/api/admin/restaurants/${restaurantId}/items`, {
    categoryId: catMains, name: 'Ribs 500g', description: 'Basted, chips and slaw', price: '189,50',
  });
  const itemRibs = r.body.id;
  check('en-ZA decimal comma parses', r.body.price_cents === 18950, `got ${r.body.price_cents}`);

  r = await call('POST', `/api/admin/restaurants/${restaurantId}/items`, {
    categoryId: catMains, name: 'Sold Out Burger', price: '125',
  });
  const itemBurger = r.body.id;
  await call('PATCH', `/api/admin/restaurants/${restaurantId}/items/${itemBurger}`, { available: false });

  r = await call('POST', `/api/admin/restaurants/${restaurantId}/items`, {
    categoryId: catStarters, name: 'Junk price', price: 'abc',
  });
  check('junk price is 400', r.status === 400, `got ${r.status}`);

  r = await call('GET', `/api/admin/restaurants/${restaurantId}/menu`);
  check('menu returns 2 categories', Array.isArray(r.body) && r.body.length === 2, `got ${r.body.length}`);

  r = await call('PATCH', `/api/admin/restaurants/${restaurantId}`, { slug: 'hacked-slug' });
  const { data: afterSlug } = await db.from('restaurants').select('slug').eq('id', restaurantId).single();
  check('slug is immutable', afterSlug.slug === slug, `now ${afterSlug.slug}`);

  console.log('\n== restaurant info (hours, address, burger menu) ==');
  r = await call('PATCH', `/api/admin/restaurants/${restaurantId}`, {
    address: '12 Vilakazi St, Soweto', hours: { funday: [['09:00', '17:00']] },
  });
  check('rejects an unknown day key', r.status === 400, `got ${r.status}`);

  r = await call('PATCH', `/api/admin/restaurants/${restaurantId}`, {
    address: '12 Vilakazi St, Soweto',
    hours: { mon: [['11:00', '22:00']], tue: [], thu: [['18:00', '02:00']] },
    closedNote: '',
  });
  check('accepts address + hours together', r.status === 200, `got ${r.status}`);
  check('the after-midnight period round-trips (close <= open is a feature, not an error)', r.body.hours.thu[0][1] === '02:00');

  console.log('\n== diner surface (unauthenticated) ==');
  const pageRes = await fetch(`${BASE}/${slug}`);
  const page = await pageRes.text();
  check('menu page renders', pageRes.status === 200, `got ${pageRes.status}`);
  check('dishes present', page.includes('Calamari') && page.includes('Ribs 500g'));
  check('prices formatted', page.includes('R89.00') && page.includes('R189.50'));
  check('sold-out dish shown but not ratable', page.includes('Sold Out Burger') && !page.includes(`data-item="${itemBurger}"`));
  check('Google CTA present at render time', (page.match(/writereview/g) || []).length === 2);
  check('burger menu present', page.includes('id="open-sheet"'));
  check('Hours & Address row present now that address+hours are set', page.includes('id="open-info"'));
  check('hours table has 7 rows, Monday first', /data-day="mon"[\s\S]*?data-day="sun"/.test(page));
  check('after-midnight period formatted as entered, not silently corrected', page.includes('18:00–02:00'));
  check('address reaches the client for the badge/highlight script', page.includes('data-hours='));
  // What a phone on restaurant wifi actually downloads. Vercel gzips text responses at the
  // edge, and a stylesheet built from repeated tokens compresses hard -- the raw string is
  // roughly 3-4x this. Asserting on the uncompressed length measured an axis no diner pays for.
  //
  // 14KB, not 10KB: search, category chips, the burger sheet, the info modal and the open/closed
  // badge (with lib/hours.js's status() inlined via toString()) are now fixed page chrome that
  // ships regardless of menu size -- roughly 9.5-10KB gzipped on their own, before a single dish
  // is added. This budget was raised here, deliberately, to fit that; it is not a hunt for a
  // squeeze() bug, there wasn't one. Revisit downward only if some of that chrome turns out unused.
  const wire = zlib.gzipSync(page).length;
  check('page under 14KB on the wire', wire < 14000, `${wire} gzipped, ${page.length} raw`);

  const cookie = pageRes.headers.get('set-cookie');
  check('no visit row created by merely reading the menu', !cookie || !/rv=/.test(cookie));

  console.log('\n== ratings ==');
  const post = async (path, body, jar) => {
    const res = await fetch(`${BASE}/api/public/${slug}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(jar ? { Cookie: jar } : {}) },
      body: JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    return { status: res.status, jar: setCookie ? setCookie.split(';')[0] : jar, body: await res.json() };
  };

  let out = await post('/item-rating', { itemId: itemCalamari, rating: 5, comment: 'Best in Boksburg' });
  check('first item rating creates the visit', out.status === 200 && /rv=/.test(out.jar || ''), `got ${out.status}`);
  const jar = out.jar;

  out = await post('/item-rating', { itemId: itemRibs, rating: 2 }, jar);
  check('second dish rated on the same visit', out.status === 200);

  out = await post('/item-rating', { itemId: itemRibs, rating: 4, comment: 'changed my mind' }, jar);
  check('re-tapping updates rather than duplicates', out.status === 200);

  out = await post('/item-rating', { itemId: itemBurger, rating: 5 }, jar);
  check('sold-out dish IS still ratable (ate it before it sold out)', out.status === 200, `got ${out.status}`);

  out = await post('/item-rating', { itemId: itemCalamari, rating: 9 }, jar);
  check('rating out of range is 400', out.status === 400, `got ${out.status}`);

  out = await post('/visit-rating', { rating: 2, comment: 'Slow service', contact: '0821234567' }, jar);
  check('low visit rating accepted', out.status === 200);

  console.log('\n== what actually landed ==');
  const { data: visits } = await db.from('visits').select('*').eq('restaurant_id', restaurantId);
  check('exactly one visit', visits.length === 1, `got ${visits.length}`);
  check('visit rating stored', visits[0].rating === 2);
  check('contact kept at rating 2', visits[0].contact === '0821234567', `got ${visits[0].contact}`);
  check('ip_hash recorded', !!visits[0].ip_hash);

  const { data: ratings } = await db.from('item_ratings').select('*').eq('visit_id', visits[0].id);
  check('three item ratings, one per dish', ratings.length === 3, `got ${ratings.length}`);
  const ribs = ratings.find((x) => x.menu_item_id === itemRibs);
  check('re-tap overwrote 2 with 4', ribs.rating === 4, `got ${ribs.rating}`);
  check('comment saved on update', ribs.comment === 'changed my mind');

  // COMPLIANCE.md 6: contact is server-side gated, so a crafted request at a high rating must
  // not be able to store one.
  const jar2 = (await post('/visit-rating', { rating: 5, contact: 'sneaky@example.com' })).jar;
  const { data: v2 } = await db.from('visits').select('rating, contact').eq('restaurant_id', restaurantId).eq('rating', 5).single();
  check('contact REFUSED at rating 5 (POPIA gate is server-side)', v2.contact === null, `got ${v2.contact}`);

  console.log('\n== console endpoints ==');
  r = await call('GET', '/api/admin/me');
  check('me returns admin + restaurants', r.body.isAdmin === true && Array.isArray(r.body.restaurants));

  r = await call('GET', `/api/admin/restaurants/${restaurantId}/feedback`);
  check('feedback lists both visits', r.body.length === 2, `got ${r.body.length}`);
  const lowVisit = r.body.find((v) => v.rating === 2);
  check('visit carries the dishes rated during it', lowVisit.items.length === 3, `got ${lowVisit.items.length}`);
  check('dish names resolved, not just ids', lowVisit.items.some((i) => i.name === 'Calamari'));

  r = await call('GET', `/api/admin/restaurants/${restaurantId}/feedback?maxRating=3&resolved=false`);
  check('needs-attention filter narrows to the low visit', r.body.length === 1 && r.body[0].rating === 2, `got ${r.body.length}`);

  r = await call('PATCH', `/api/admin/restaurants/${restaurantId}/visits/${lowVisit.id}`, { resolved: true, resolvedNote: 'Spoke to the kitchen' });
  check('resolve with a note', r.status === 200 && r.body.resolved === true && r.body.resolved_note === 'Spoke to the kitchen');

  r = await call('GET', `/api/admin/restaurants/${restaurantId}/feedback?resolved=false`);
  check('resolved visit drops out of the unresolved filter', r.body.length === 1, `got ${r.body.length}`);

  r = await call('GET', `/api/admin/restaurants/${restaurantId}/dishes`);
  check('dishes returns every menu item', r.body.dishes.length === 3, `got ${r.body.dishes.length}`);
  check('nothing is ranked on 1 rating each', r.body.boards.best.length === 0);
  check('unranked dishes are counted, not hidden', r.body.boards.unrankedCount === 3, `got ${r.body.boards.unrankedCount}`);
  const calamariRow = r.body.dishes.find((d) => d.name === 'Calamari');
  check('per-dish average present with its count', calamariRow.average === 5 && calamariRow.count === 1);

  console.log('');
  console.log('== QR ==');
  // Nothing here draws a code any more -- it is generated in subscription_management_system and
  // uploaded. What this checks is that the bytes come back exactly as they went in: anything that
  // re-encodes a QR somewhere in the round trip is something that can stop it scanning.
  const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
  const QR_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const qrPath = `/api/admin/restaurants/${restaurantId}/qr`;
  const getQr = (fmt) =>
    fetch(`${BASE}${qrPath}?format=${fmt}`, { headers: { Authorization: `Bearer ${token}` } });

  let qrRes = await getQr('svg');
  check('404s until a code has been uploaded', qrRes.status === 404, `got ${qrRes.status}`);

  r = await call('PUT', qrPath, { svg: '<html><body>nope</body></html>', png: QR_PNG });
  check('rejects an SVG that is not an SVG', r.status === 400, `got ${r.status}`);

  r = await call('PUT', qrPath, { svg: QR_SVG, png: Buffer.from('not a png at all').toString('base64') });
  check('rejects a PNG that is not a PNG', r.status === 400, `got ${r.status}`);

  r = await call('PUT', qrPath, { svg: QR_SVG.replace('<rect', '<script>fetch("//evil")</script><rect'), png: QR_PNG });
  check('rejects a scripted SVG', r.status === 400, `got ${r.status}`);

  r = await call('PUT', qrPath, { svg: QR_SVG });
  check('rejects a half pair', r.status === 400, `got ${r.status}`);

  r = await call('PUT', qrPath, { svg: QR_SVG, png: QR_PNG });
  check('admin uploads both formats together', r.status === 204, `got ${r.status}`);

  for (const [fmt, sent] of [['svg', QR_SVG], ['png', QR_PNG]]) {
    qrRes = await getQr(fmt);
    const buf = Buffer.from(await qrRes.arrayBuffer());
    const back = fmt === 'png' ? buf.toString('base64') : buf.toString('utf8');
    const disp = qrRes.headers.get('content-disposition') || '';
    check(`${fmt} comes back byte-identical`, qrRes.status === 200 && back === sent, `${qrRes.status}, ${buf.length} bytes`);
    check(`${fmt} offered as a download`, disp.includes(`${slug}-qr.${fmt}`), disp);
  }

  // Upsert, not insert: a code can legitimately be regenerated before the coasters are printed,
  // and a primary-key 409 at that point helps nobody.
  r = await call('PUT', qrPath, { svg: QR_SVG, png: QR_PNG });
  check('re-upload overwrites the existing pair', r.status === 204, `got ${r.status}`);

  console.log('');
  console.log('== cron ==');
  let cronRes = await fetch(`${BASE}/api/cron/daily`);
  check('cron rejects an unauthenticated call', cronRes.status === 401, `got ${cronRes.status}`);
  cronRes = await fetch(`${BASE}/api/cron/daily`, { headers: { Authorization: 'Bearer wrong' } });
  check('cron rejects a wrong secret', cronRes.status === 401, `got ${cronRes.status}`);

  if (process.env.CRON_SECRET) {
    cronRes = await fetch(`${BASE}/api/cron/daily`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const out = await cronRes.json();
    check('cron runs with the right secret', cronRes.status === 200, `got ${cronRes.status}`);
    // The keep-warm read is what stops the Supabase free tier pausing after seven idle days and
    // taking every printed coaster down with it.
    check('cron kept the database warm', out.warm === true, JSON.stringify(out));
    check('cron reported a purge count', typeof out.purged === 'number', JSON.stringify(out));
    check('POPIA purge did not error', !out.purgeError, out.purgeError || '');
  } else {
    console.log('  SKIP  cron run (CRON_SECRET not set)');
  }

  console.log('\n== cleanup ==');
  if (provisionUserId) {
    // staff cascades from auth.users on delete, but deleting it explicitly first means a
    // failure here still leaves a readable trail instead of an orphaned staff row hidden
    // behind a successful-looking auth deletion.
    await db.from('staff').delete().eq('user_id', provisionUserId);
    const { error: authDelErr } = await admin.auth.admin.deleteUser(provisionUserId);
    check('provisioned login removed', !authDelErr, authDelErr?.message || '');
  }
  const { error: delErr } = await db.from('restaurants').delete().eq('id', restaurantId);
  const { data: left } = await db.from('restaurants').select('id').eq('slug', slug);
  check('test data removed', !delErr && left.length === 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nSMOKE ERROR:', e.message);
  process.exit(1);
});
