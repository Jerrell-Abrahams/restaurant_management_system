const test = require('node:test');
const assert = require('node:assert');
const { renderPage, squeeze } = require('./dinerPage');

const restaurant = {
  id: 'r1',
  name: "Mario's Kitchen",
  slug: 'marios',
  google_place_id: 'ChIJexample123',
};

const menu = [
  {
    id: 'c1',
    name: 'Starters',
    items: [
      { id: 'i1', name: 'Calamari', description: 'Grilled, lemon butter', price_cents: 8900, available: true },
      { id: 'i2', name: 'Buffalo Wings', description: null, price_cents: 7500, available: false },
      { id: 'i3', name: 'Soup of the day', description: null, price_cents: null, available: true },
    ],
  },
];

const html = renderPage({ restaurant, menu });

// --- COMPLIANCE.md rule 2 ----------------------------------------------------------------
// The single most important test in this repo. Review gating -- hiding the Google link from
// diners who rated badly -- is a policy violation that gets the RESTAURANT's listing penalised,
// and it looks entirely reasonable to whoever adds it. These tests are the tripwire.

test('the Google review link is in the page, unconditionally', () => {
  assert.ok(html.includes('search.google.com/local/writereview'));
  assert.ok(html.includes('placeid=ChIJexample123'));
});

test('BOTH the prominent and the quiet review link are present in the markup', () => {
  // Prominence is allowed to vary by rating; presence is not. Both nodes ship in every render, so
  // the client can only ever swap which one is visible -- it can never make the link absent.
  assert.ok(html.includes('id="review-primary"'));
  assert.ok(html.includes('id="review-quiet"'));
});

test('the renderer cannot see a rating, so it cannot gate on one', () => {
  // renderPage takes exactly one argument -- { restaurant, menu }. There is no rating in scope to
  // branch the review link on. If someone widens the signature to pass one in, this fails and
  // sends them to COMPLIANCE.md to find out why.
  assert.strictEqual(renderPage.length, 1);
  assert.ok(!/\brating\b/.test(renderPage.toString().split('\n')[0]));

  // And the link lands in the markup exactly twice -- once prominent, once quiet. Not once with a
  // condition around it, and not zero times.
  const hits = html.match(/search\.google\.com\/local\/writereview/g) || [];
  assert.strictEqual(hits.length, 2);
});

test('copy never names a target score', () => {
  // COMPLIANCE.md rule 4. "Leave us 5 stars" and friends.
  assert.ok(!/5\s*stars?/i.test(html));
  assert.ok(!/\bfive\s*stars?\b/i.test(html));
});

test('no incentive language anywhere', () => {
  // COMPLIANCE.md rule 3.
  for (const word of ['discount', 'voucher', 'free meal', 'reward', 'prize', 'loyalty']) {
    assert.ok(!new RegExp(word, 'i').test(html), `found "${word}" in the diner page`);
  }
});

test('contact capture carries its purpose line and a retention promise', () => {
  // COMPLIANCE.md rule 6 (POPIA).
  assert.ok(html.includes('get back to you about this visit'));
  assert.ok(html.includes('90 days'));
});

test('a restaurant with no Place ID gets no broken link', () => {
  const noPlace = renderPage({ restaurant: { ...restaurant, google_place_id: null }, menu });
  assert.ok(!noPlace.includes('writereview'));
  assert.ok(!noPlace.includes('id="review-primary"'));
});

// --- Rendering ---------------------------------------------------------------------------

test('escapes restaurant-controlled text', () => {
  const nasty = renderPage({
    restaurant: { ...restaurant, name: '<script>alert(1)</script>' },
    menu: [{ id: 'c1', name: 'X', items: [{ id: 'i1', name: '"><img onerror=alert(1)>', price_cents: 100, available: true }] }],
  });
  assert.ok(!nasty.includes('<script>alert(1)</script>'));
  assert.ok(!nasty.includes('<img onerror'));
  assert.ok(nasty.includes('&lt;script&gt;'));
});

test('sold-out dishes render but carry no rating strip', () => {
  assert.ok(html.includes('Buffalo Wings'));
  assert.ok(html.includes('sold out'));
  // A diner rating a dish the kitchen ran out of two hours ago is bad data.
  assert.ok(!html.includes('data-item="i2"'));
  assert.ok(html.includes('data-item="i1"'));
});

test('a dish with no price shows no price, not R0.00', () => {
  assert.ok(html.includes('Soup of the day'));
  assert.ok(!html.includes('R0.00'));
  assert.ok(html.includes('R89.00'));
});

test('empty menu still renders a page rather than blank', () => {
  const empty = renderPage({ restaurant, menu: [] });
  assert.ok(empty.includes('being set up'));
  // Even with no dishes the visit rating still works -- service is ratable without food.
  assert.ok(empty.includes('id="visit-faces"'));
});

test('tap targets are declared at the 44px accessibility floor or above', () => {
  const size = /\.face\{width:(\d+)px;height:(\d+)px/.exec(html);
  assert.ok(size, 'could not find the .face rule');
  assert.ok(Number(size[1]) >= 44 && Number(size[2]) >= 44, `got ${size[1]}x${size[2]}`);
});

// --- the CSS squeeze -------------------------------------------------------------------------
// It is a regex, not a parser, and it runs over a stylesheet people will keep editing. These pin
// the four things that actually break if the whitespace rules are ever loosened.

test('strips comments and the whitespace that carries nothing', () => {
  assert.strictEqual(squeeze('/* why */\n.a{color:red}\n\n.b{color:blue}'), '.a{color:red}.b{color:blue}');
});

test('keeps the space in a descendant selector', () => {
  // `.item[open] .caret` and `.item[open].caret` are different rules. Collapsing this one would
  // silently stop the caret rotating rather than throwing anything.
  assert.strictEqual(squeeze('.item[open]   .caret{transform:rotate(180deg)}'), '.item[open] .caret{transform:rotate(180deg)}');
});

test('keeps the spaces calc() needs around its operators', () => {
  // calc(...*45ms + 60ms) is invalid without the spaces -- the whole declaration is dropped.
  assert.ok(squeeze('.i{animation-delay:calc(var(--i,0)*45ms + 60ms)}').includes('*45ms + 60ms'));
});

test('keeps spaces inside quoted values', () => {
  assert.ok(squeeze(":root{--sans:Jost,'Segoe UI',sans-serif}").includes("'Segoe UI'"));
});

test('the rendered page ships no CSS comments', () => {
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.ok(!style.includes('/*'), 'a CSS comment reached the client');
  assert.ok(!/\n\s\s/.test(style), 'indentation reached the client');
  // Still a working stylesheet, not an empty one.
  assert.ok(style.includes('.face{') && style.includes('@media'));
});

// --- category chips --------------------------------------------------------------------------

const multi = [
  { id: 'c1', name: 'Starters', items: [{ id: 'i1', name: 'Calamari', price_cents: 8900, available: true }] },
  { id: 'c2', name: 'Mains', items: [{ id: 'i2', name: 'Beef Ribs', price_cents: 18900, available: true }] },
  { id: 'c3', name: 'Empty', items: [] },
];
const chipped = renderPage({ restaurant, menu: multi });

test('one chip per category that has dishes, plus All', () => {
  const chips = [...chipped.matchAll(/<button class="chip"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  assert.deepStrictEqual(chips, ['All', 'Starters', 'Mains']);
});

test('an empty category gets neither a chip nor a section', () => {
  assert.ok(!chipped.includes('>Empty<'));
  assert.strictEqual((chipped.match(/<section data-cat=/g) || []).length, 2);
});

// The chip and its section are matched by index, so anything that filters one list and not the
// other silently points "Mains" at the starters.
test('chip and section indices line up', () => {
  const chipCats = [...chipped.matchAll(/<button class="chip"[^>]*data-cat="(\d+)"/g)].map((m) => m[1]);
  const secCats = [...chipped.matchAll(/<section data-cat="(\d+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(chipCats, secCats);
});

// One category means the rail would read "All | Mains" and say nothing, at the cost of a row of
// the first screen.
test('no chip rail when there is only one category', () => {
  assert.ok(!html.includes('class="chips"'));
  assert.ok(html.includes('class="search"'), 'the search box is not conditional');
});

// Category names are restaurant-controlled text landing inside a button, same trust boundary as
// dish names.
test('category names are escaped in the chips', () => {
  const nasty = renderPage({
    restaurant,
    menu: [
      { id: 'a', name: '<script>x</script>', items: [{ id: 'i', name: 'A', price_cents: 100, available: true }] },
      { id: 'b', name: 'Mains', items: [{ id: 'j', name: 'B', price_cents: 100, available: true }] },
    ],
  });
  assert.ok(!nasty.includes('<button class="chip" type="button" data-cat="0" aria-pressed="false"><script>'));
  assert.ok(nasty.includes('&lt;script&gt;'));
});

test('the chip styling ships', () => {
  assert.ok(chipped.includes('.chip{'));
  const size = /\.chip\{[^}]*height:(\d+)px/.exec(chipped);
  assert.ok(size && Number(size[1]) >= 44, `chips must clear the 44px tap floor, got ${size && size[1]}`);
});

// --- burger sheet, info modal, hours & address --------------------------------------------

const withInfo = renderPage({
  restaurant: { ...restaurant, address: '12 Vilakazi St, Soweto', hours: { mon: [['11:00', '22:00']], tue: [] }, closed_note: null },
  menu,
});
const withoutInfo = renderPage({ restaurant: { ...restaurant, address: null, hours: null, closed_note: null }, menu });

test('the burger is always present, regardless of whether info exists', () => {
  assert.ok(html.includes('id="open-sheet"'));
  assert.ok(withoutInfo.includes('id="open-sheet"'));
});

test('Share Menu always renders; Hours & Address only when something has been filled in', () => {
  assert.ok(withInfo.includes('id="share-menu"'));
  assert.ok(withInfo.includes('id="open-info"'));
  assert.ok(withoutInfo.includes('id="share-menu"'));
  assert.ok(!withoutInfo.includes('id="open-info"'));
  // The modal itself must not ship at all when there is nothing to show it -- not just be
  // unreachable, since an empty overlay is still bytes on every page load.
  assert.ok(!withoutInfo.includes('id="info"'));
});

test('the hours table renders one row per day, in Monday-first display order, with periods formatted', () => {
  const rows = [...withInfo.matchAll(/<div class="hours-row" data-day="(\w+)"><span class="day">(\w+)<\/span><span>([^<]*)<\/span>/g)];
  assert.strictEqual(rows.length, 7);
  assert.strictEqual(rows[0][1], 'mon');
  assert.strictEqual(rows[0][3], '11:00–22:00');
  assert.strictEqual(rows[1][3], 'Closed'); // tue: []
});

test('a closed_note suppresses the hours table and shows the note instead', () => {
  const closed = renderPage({
    restaurant: { ...restaurant, address: null, hours: { mon: [['11:00', '22:00']] }, closed_note: 'Closed for a private function, back Monday' },
    menu,
  });
  assert.ok(!closed.includes('class="hours-table"'));
  assert.ok(closed.includes('Closed for a private function, back Monday'));
});

test('the address becomes a tap-to-map link built from the address text, not the Place ID', () => {
  assert.ok(withInfo.includes('https://maps.google.com/?q=12%20Vilakazi%20St%2C%20Soweto'));
});

test('address and closed_note are escaped', () => {
  const nasty = renderPage({
    restaurant: { ...restaurant, address: '<script>x</script>', hours: null, closed_note: '<img onerror=alert(1)>' },
    menu,
  });
  assert.ok(!nasty.includes('<script>x</script>'));
  assert.ok(!nasty.includes('<img onerror=alert(1)>'));
  assert.ok(nasty.includes('&lt;script&gt;'));
});

// The client can only compute the badge from what the server hands it, so the payload has to
// survive the HTML-attribute round trip intact.
test('hours and closed_note are carried to the client as data attributes', () => {
  assert.ok(withInfo.includes('data-hours='));
  assert.ok(withInfo.includes('"mon":[["11:00","22:00"]]'.replace(/"/g, '&quot;')));
});

// The whole reason status() lives in lib/hours.js instead of being written twice: this proves
// the actual shipped function, not a hand-copied stand-in that could drift from it.
test("lib/hours.js's status() reaches the client verbatim", () => {
  assert.ok(withInfo.includes('function status(hours, now)'));
  assert.ok(withInfo.includes("now.getUTCHours()"), 'the SAST conversion must ship, not a stub');
});

test('the badge elements exist hidden by default -- only client JS un-hides them', () => {
  assert.ok(/<p class="hours-badge" id="hours-badge" hidden><\/p>/.test(withInfo));
});

// --- Call waiter / Request bill -----------------------------------------------------------
// Off by default (restaurant.service_requests_enabled). These pin that a restaurant which has
// never touched the setting -- the base `restaurant` fixture above has no such field -- ships not
// one byte of this feature, same standard as the Hours & Address modal above.

test('no service-request markup ships when the toggle is absent or false', () => {
  // Not a bare `.service-btn` check -- that class name legitimately appears once in the shipped
  // CSS regardless (same as `.chip{}` shipping for a single-category menu). What must be absent is
  // the elements themselves.
  assert.ok(!html.includes('data-kind="waiter"'));
  assert.ok(!html.includes('data-kind="bill"'));
  assert.ok(!html.includes('id="table-ask"'));
  // Not a bare substring check: `body[data-service]{...}` in the CSS legitimately contains this
  // text unconditionally (it's the padding-bottom override, dead weight when unused but harmless).
  // What must be absent is the attribute actually landing on the <body> tag.
  assert.ok(!/<body[^>]*\sdata-service(\s|>)/.test(html));
});

const withService = renderPage({ restaurant: { ...restaurant, service_requests_enabled: true }, menu });

test('both buttons render when the toggle is on, and the body carries the padding hook', () => {
  assert.ok(withService.includes('data-kind="waiter"'));
  assert.ok(withService.includes('data-kind="bill"'));
  assert.ok(/<body[^>]*\sdata-service(\s|>)/.test(withService));
});

test('the table-number prompt exists and starts hidden', () => {
  assert.ok(/<div class="overlay" id="table-ask" hidden/.test(withService));
});

test('the buttons sit above the visit CTA in the footer, not inside the burger sheet', () => {
  const footer = /<footer>([\s\S]*?)<\/footer>/.exec(withService)[1];
  assert.ok(footer.includes('service-row'));
  assert.ok(footer.indexOf('service-row') < footer.indexOf('id="open-visit"'));
});

test('the same two actions are also reachable from the burger sheet, after Share Menu', () => {
  const sheet = /<div class="overlay" id="sheet"[\s\S]*?<\/nav>/.exec(withService)[0];
  const waiterIdx = sheet.indexOf('data-kind="waiter"');
  const billIdx = sheet.indexOf('data-kind="bill"');
  assert.ok(waiterIdx > -1 && billIdx > -1);
  assert.ok(sheet.indexOf('share-menu') < waiterIdx, 'Share Menu comes first');
  assert.ok(waiterIdx < billIdx, 'Call waiter before Request bill');
});
