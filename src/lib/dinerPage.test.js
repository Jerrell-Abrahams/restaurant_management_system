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

test('one confirm button per rateable dish, none for the sold-out one', () => {
  // 2 available dishes in the fixture (i1, i3); i2 is sold out and gets no rating strip at all.
  const hits = html.match(/class="confirm-wrap"/g) || [];
  assert.strictEqual(hits.length, 2);
  assert.ok(html.includes('<div class="confirm-wrap" hidden>'));
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

// --- promotions ----------------------------------------------------------------------------

test('a promo label renders as text, not the emoji from the original spec', () => {
  const promoted = renderPage({
    restaurant,
    menu: [{ id: 'c1', name: 'Mains', items: [{ id: 'i1', name: 'Ribs', promo_label: 'best_seller', price_cents: 100, available: true }] }],
  });
  assert.ok(promoted.includes('<span class="promo-badge">Best Seller</span>'));
  // This pins that the promo pill specifically stays text, matching every other badge in .line.
  assert.ok(!/[⭐🔥🆕💰]/.test(promoted.match(/<span class="promo-badge">[^<]*<\/span>/)[0]));
});

test('no promo badge when the item carries no label', () => {
  // Not a bare `promo-badge` substring check -- that class name legitimately ships in the CSS
  // regardless (same as `.cta-btn`/`.chip{}` elsewhere in this file). What must be absent is the
  // element itself.
  assert.ok(!html.includes('<span class="promo-badge">'));
});

test('an unrecognised promo_label renders no badge rather than throwing', () => {
  // The check constraint in menu_promotions.sql is the real guard; this is what happens if a row
  // somehow predates it or is edited outside the API.
  const weird = renderPage({
    restaurant,
    menu: [{ id: 'c1', name: 'Mains', items: [{ id: 'i1', name: 'Ribs', promo_label: 'discontinued', price_cents: 100, available: true }] }],
  });
  assert.ok(!weird.includes('<span class="promo-badge">'));
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
// the first screen. The search box rides in that rail, so it goes with it -- and the inline
// script is guarded on the rail existing, so a one-category menu must ship no #no-hits either.
test('no chip rail when there is only one category, and no search with it', () => {
  assert.ok(!html.includes('class="chips"'));
  assert.ok(!html.includes('id="q"'));
  assert.ok(!html.includes('id="no-hits"'));
});

// --- menu search ------------------------------------------------------------------------------
// The filter runs in the browser, and there is no DOM here to run it against. What these pin is
// the markup contract it queries by id -- every element the inline script reaches for, plus the
// per-dish haystack it matches against. Renaming any of them breaks search silently in the phone
// and nowhere else, which is the failure this file exists to catch.

test('every element the search script queries by id is in the markup', () => {
  for (const id of ['chips', 'search-toggle', 'search-wrap', 'q', 'search-clear', 'no-hits']) {
    assert.ok(chipped.includes(`id="${id}"`), `#${id} is missing`);
  }
});

test('the search field starts collapsed and the X starts hidden', () => {
  assert.ok(/id="search-toggle"[^>]*aria-expanded="false"/.test(chipped.replace(/\s+/g, ' ')));
  assert.ok(/<button class="search-x"[^>]*\shidden>/.test(chipped));
  // The expand is a pure CSS width transition keyed off one attribute on the rail -- no JS
  // measuring, and it reverses for free. If this rule goes, the animation silently becomes a snap.
  assert.ok(chipped.includes('.chips[data-searching] .search-wrap{width:calc(100% - 52px)}'));
});

test('name and description both feed the haystack, lowercased and escaped', () => {
  const searchable = renderPage({
    restaurant,
    menu: [
      { id: 'a', name: 'Mains', items: [{ id: 'i', name: 'Peri Wings', description: 'Hot & smoky', price_cents: 100, available: true }] },
      { id: 'b', name: 'Sides', items: [{ id: 'j', name: 'Pap', price_cents: 100, available: true }] },
    ],
  });
  assert.ok(searchable.includes('data-name="peri wings hot &amp; smoky"'));
  // A dish with no description still gets the attribute -- the script reads it unconditionally.
  assert.ok(searchable.includes('data-name="pap "'));
});

test('sold-out dishes are searchable too, even though they carry no rating strip', () => {
  // They render as a flat .item, and the filter walks .item -- a dish missing its data-name would
  // throw inside the loop and take the whole filter down with it.
  const items = [...html.matchAll(/<(?:details|div) class="item"[^>]*>/g)].map((m) => m[0]);
  assert.strictEqual(items.length, 3, 'fixture has 3 dishes, one of them sold out');
  assert.ok(items.every((el) => el.includes('data-name=')));
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

// The zero-top-padding rule under the chip rail only ever matched the literal first <section> in
// the document (`.chips + section`). Filtering to any other category hides that section and
// leaves a later, un-zeroed one on top, so the gap under the chips visibly grew. `.cat-top` is the
// client-side fix -- these pin that both halves of it actually shipped, since neither one alone
// does anything.
test('the client script retargets the zero-top-padding rule to whichever section is actually first, not just the literal first one', () => {
  assert.ok(chipped.includes('.cat-top .cat{padding-top:0}'), 'the CSS half of the fix is missing');
  assert.ok(/classList\.toggle\(\s*['"]cat-top['"]/.test(chipped), 'the script never applies .cat-top to a section');
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

test('phone back closes an open overlay instead of leaving the page', () => {
  assert.ok(/addEventListener\(\s*['"]popstate['"]/.test(html), 'no popstate handler for the back gesture');
  assert.ok(/new MutationObserver/.test(html), 'overlay open/close is not watched to drive history state');
});

// --- Branding: logo + accent color --------------------------------------------------------

test('no logo_url renders no <img>, and the header still works', () => {
  assert.ok(!html.includes('<img'));
  assert.ok(/<h1>[^<]+<\/h1>/.test(html));
});

test('a logo_url renders as an <img>, escaped, alongside the name', () => {
  const branded = renderPage({ restaurant: { ...restaurant, logo_url: 'https://cdn.example/"><script>x</script>' }, menu });
  assert.match(branded, /<img class="logo" src="https:\/\/cdn\.example\/&quot;&gt;/);
  assert.ok(!branded.includes('<script>x</script>'));
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

// --- QR scans -----------------------------------------------------------------------------
// The menu route is cached 60s at a shared edge (routes/public.js), so a scan can only be counted
// from the browser -- this pins that the beacon actually ships, unconditionally, with a fallback
// for the one browser without sendBeacon.
test('every render fires a scan beacon at the uncached /scan endpoint, with a post() fallback', () => {
  assert.ok(html.includes("navigator.sendBeacon('/api/public/' + encodeURIComponent(slug) + '/scan')"));
  assert.ok(html.includes("else post('/scan', {})"));
});

test('the info-modal badge exists hidden by default -- only client JS un-hides it', () => {
  assert.ok(/<p class="hours-badge" id="info-badge" hidden><\/p>/.test(withInfo));
});

// --- Call waiter / Request bill -----------------------------------------------------------
// Off by default (restaurant.service_requests_enabled). These pin that a restaurant which has
// never touched the setting -- the base `restaurant` fixture above has no such field -- ships not
// one byte of this feature, same standard as the Hours & Address modal above.

test('no service-request markup ships when the toggle is absent or false', () => {
  // Not a bare `.cta-btn` check -- that class name legitimately appears once in the shipped
  // CSS regardless (same as `.chip{}` shipping for a single-category menu, and Rate us always
  // rendering one). What must be absent is the waiter/bill elements themselves.
  assert.ok(!html.includes('data-kind="waiter"'));
  assert.ok(!html.includes('data-kind="bill"'));
  assert.ok(!html.includes('id="table-ask"'));
  assert.ok(!html.includes('id="manage-request"'));
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

test('the manage-request dialog (nudge/cancel) exists, starts hidden, and offers both actions', () => {
  const manage = /<div class="overlay" id="manage-request" hidden[\s\S]*?<\/div>\s*<\/div>/.exec(withService)[0];
  assert.ok(manage.includes('id="manage-nudge"'));
  assert.ok(manage.includes('id="manage-cancel"'));
});

test('the service buttons sit before Rate us in the footer, not inside the burger sheet', () => {
  const footer = /<footer>([\s\S]*?)<\/footer>/.exec(withService)[1];
  assert.ok(footer.includes('data-kind="waiter"') && footer.includes('data-kind="bill"'));
  assert.ok(footer.indexOf('data-kind="bill"') < footer.indexOf('id="open-visit"'));
});

test('the same two actions are also reachable from the burger sheet, in their own group before Share Menu', () => {
  const sheet = /<div class="overlay" id="sheet"[\s\S]*?<p class="copied"/.exec(withService)[0];
  const waiterIdx = sheet.indexOf('data-kind="waiter"');
  const billIdx = sheet.indexOf('data-kind="bill"');
  assert.ok(waiterIdx > -1 && billIdx > -1);
  assert.ok(waiterIdx < sheet.indexOf('share-menu'), 'Call waiter comes before Share Menu');
  assert.ok(waiterIdx < billIdx, 'Call waiter before Request bill');
});

// --- Rating count badge --------------------------------------------------------------------
// Removed from the diner page -- a raw popularity count next to the name ("234★") is still
// computed for the console's own list (routes/admin.js), just no longer rendered here or fetched
// by routes/public.js. This pins that a `rating_count` on the input data is inert on this page.

test('rating_count on an item renders no badge -- the diner page ignores it entirely', () => {
  const withCounts = renderPage({
    restaurant,
    menu: [{ ...menu[0], items: [{ ...menu[0].items[0], rating_count: 234 }] }],
  });
  assert.ok(!withCounts.includes('rating-count'));
  assert.ok(!withCounts.includes('234'));
});

// --- Spice, diet, allergens -----------------------------------------------------------------

test('none of it renders for a plain fixture item -- absent, not zero-valued', () => {
  assert.ok(!html.includes('class="spice"'));
  assert.ok(!html.includes('class="diet-badge"'));
  assert.ok(!html.includes('class="allergens"'));
});

const withDietary = renderPage({
  restaurant,
  menu: [
    {
      ...menu[0],
      items: [
        { ...menu[0].items[0], spice_level: 2, diet: 'vegan', allergens: ['gluten', 'milk'] },
        { ...menu[0].items[2], spice_level: 0, diet: null, allergens: [] },
      ],
    },
  ],
});

test('spice renders as that many flame icons, none for spice_level 0', () => {
  const spice = /<span class="spice">([\s\S]*?)<\/span>/.exec(withDietary)[1];
  assert.strictEqual((spice.match(/<svg/g) || []).length, 2);
  const soup = /<span class="item-name">Soup of the day<\/span>([\s\S]{0,60})/.exec(withDietary)[1];
  assert.ok(!soup.includes('class="spice"'));
});

test('the diet badge shows the human label, not the stored value', () => {
  assert.ok(withDietary.includes('<span class="diet-badge">Vegan</span>'));
  assert.ok(!withDietary.includes('>vegan<'));
});

test('spice never collapses -- it stays in the row even with nothing to merge into', () => {
  // i1 in withDietary carries spice_level:2 and diet:vegan, no promo. Diet is the only "badge"
  // here, so there is nothing for it to collapse against -- both sit in the row together.
  const dish = /<details[\s\S]*?<\/details>/.exec(withDietary)[0];
  const row = /<summary class="row">([\s\S]*?)<\/summary>/.exec(dish)[1];
  assert.ok(row.includes('class="spice"'));
  assert.ok(row.includes('<span class="diet-badge">Vegan</span>'));
  assert.ok(!row.includes('class="more-badge"'));
});

test('promo and diet collapse into one another; spice stays visible alongside them either way', () => {
  const merged = renderPage({
    restaurant,
    menu: [{ id: 'c1', name: 'Mains', items: [{ id: 'i1', name: 'Ribs', promo_label: 'popular', spice_level: 1, diet: 'vegan', price_cents: 100, available: true }] }],
  });
  const dish = /<details[\s\S]*?<\/details>/.exec(merged)[0];
  const row = /<summary class="row">([\s\S]*?)<\/summary>/.exec(dish)[1];
  const panel = dish.slice(dish.indexOf('</summary>'));
  assert.ok(row.includes('<span class="promo-badge">Popular<span class="badge-sep">·</span><span class="badge-more">+1</span></span>'));
  assert.ok(row.includes('class="spice"'));       // spice is never one of the collapsible two
  assert.ok(!row.includes('class="diet-badge"'));  // diet is what collapsed
  assert.ok(!row.includes('class="more-badge"'));  // merged into the promo pill, not a second pill
  assert.ok(panel.includes('<div class="more-pills">'));
  assert.ok(panel.includes('<span class="diet-badge">Vegan</span>'));
});

test('promo and spice alone never collapse -- diet is the only thing promo can pair with', () => {
  const both = renderPage({
    restaurant,
    menu: [{ id: 'c1', name: 'Mains', items: [{ id: 'i1', name: 'Ribs', promo_label: 'popular', spice_level: 1, price_cents: 100, available: true }] }],
  });
  assert.ok(both.includes('<span class="promo-badge">Popular</span>'));
  assert.ok(both.includes('class="spice"'));
  assert.ok(!both.includes('<span class="more-badge">'));
  // Not a bare 'badge-more' substring check -- that class name legitimately ships in the CSS
  // regardless. What must be absent is the element.
  assert.ok(!both.includes('<span class="badge-more">'));
});

test('a single pill never collapses -- no "+1" pill for one badge alone', () => {
  const promoted = renderPage({
    restaurant,
    menu: [{ id: 'c1', name: 'Mains', items: [{ id: 'i1', name: 'Ribs', promo_label: 'best_seller', price_cents: 100, available: true }] }],
  });
  // Not a bare 'more-badge' substring check -- that class name legitimately ships in the CSS
  // regardless (same reasoning as the promo-badge test above). What must be absent is the element.
  assert.ok(!promoted.includes('<span class="more-badge">'));
});

test('a sold-out item never collapses its pills -- there is no panel to reveal them in', () => {
  const soldOut = renderPage({
    restaurant,
    menu: [{
      id: 'c1', name: 'Mains',
      items: [{ id: 'i1', name: 'Ribs', promo_label: 'best_seller', spice_level: 1, diet: 'vegan', price_cents: 100, available: false }],
    }],
  });
  assert.ok(!soldOut.includes('<span class="more-badge">'));
  assert.ok(soldOut.includes('<span class="promo-badge">Best Seller</span>'));
  assert.ok(soldOut.includes('<span class="diet-badge">Vegan</span>'));
});

test('allergens render as "Contains: ..." with display labels, milk reading as Dairy', () => {
  assert.ok(withDietary.includes('<p class="allergens">Contains: Gluten, Dairy</p>'));
});

test('an empty allergens list renders nothing -- never a false "Contains: " all-clear', () => {
  const soup = /Soup of the day[\s\S]*?<\/details>/.exec(withDietary)[0];
  assert.ok(!soup.includes('class="allergens"'));
});

// --- Section hours ---------------------------------------------------------------------------
// Same shape and the same status() as the restaurant's own hours (lib/hours.js), run again
// per section, client-side only -- see the inline script comment for why (60s shared cache).

test('a section with no hours set still carries the attribute, as null, and a note that starts hidden', () => {
  assert.ok(html.includes('data-hours="null"'));
  assert.ok(html.includes('<span class="cat-note" hidden></span>'));
});

test('a scheduled section carries its own hours as JSON, independent of the restaurant\'s own hours', () => {
  const withHours = renderPage({
    restaurant,
    menu: [{ ...menu[0], hours: { mon: [['07:00', '11:00']] } }],
  });
  assert.ok(withHours.includes('data-hours="{&quot;mon&quot;:[[&quot;07:00&quot;,&quot;11:00&quot;]]}"'));
});

test('the client script re-runs status() per section rather than only once for the restaurant', () => {
  // Pins the mechanism, not just the markup: a regression that stops re-evaluating status() per
  // section would leave every scheduled section looking permanently open with no test above
  // catching it, since the markup alone (data-hours, .cat-note) would still be present.
  assert.ok(html.includes("querySelectorAll('section[data-hours]')"));
  assert.ok(html.includes('cat-paused'));
});

// --- Suggestions -------------------------------------------------------------------------

test('the sheet has a Suggestions row, and its modal renders with the send button disabled', () => {
  assert.ok(html.includes('id="open-suggest"'));
  assert.ok(html.includes('<span class="sheet-row-title">Suggestions</span>'));
  assert.ok(html.includes('id="suggest"'));
  assert.ok(html.includes('id="suggest-input"'));
  assert.ok(html.includes('id="suggest-send" disabled'));
});

test('Suggestions is always the last row in the sheet', () => {
  const withService = renderPage({ restaurant: { ...restaurant, service_requests_enabled: true }, menu });
  [html, withService].forEach((page) => {
    const sheet = /<div class="overlay" id="sheet"[\s\S]*?<p class="copied"/.exec(page)[0];
    const rowStarts = [...sheet.matchAll(/<button class="sheet-row[^"]*"/g)].map((m) => m.index);
    assert.ok(rowStarts.length > 1, 'the sheet has more than one row to order');
    assert.equal(sheet.indexOf('id="open-suggest"') > rowStarts[rowStarts.length - 1], true, 'Suggestions is the last row');
  });
});
