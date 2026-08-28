const { formatCents } = require('./money');
const { DAYS, status, CLOSING_SOON_MINS } = require('./hours');

// The diner surface, rendered as one HTML string. No build step, no bundle, no hydration: this
// loads on a phone on restaurant wifi, from a coaster, while someone waits for food. Everything
// needed for first paint is in the first response.
//
// Read COMPLIANCE.md before changing anything below the menu. The Google link rules are not
// styling decisions.
//
// Visual language is the Kasi Flame Grill canvas: 4A in light, 3A in dark. One screen, two
// palettes -- warm ivory + ink + brass by day, near-black + brass by night.

// 1..5. Shown next to the stars so a tap reads back in words, not just filled shapes. Neutral by
// construction -- COMPLIANCE.md 4 forbids copy that names a target score.
const WORDS = ['', 'Poor', 'Fair', 'Good', 'Excellent', 'Exceptional'];

// Everything interpolated below is restaurant-controlled text (dish names, descriptions) typed
// into the console. It is not trusted: a menu item called `<script>` must render as a dish, not
// execute. Attribute values get the quote/ampersand treatment too, since some land in attributes.
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Light by default, dark when the phone asks for it. Deliberately the opposite default from the
// console: that is a dark product with a light escape hatch, this is a menu read in daylight as
// often as in a dim dining room, so it follows the device instead of imposing.
//
// A few tokens are not inversions and cannot be. The light CTA is a solid ink pill, the dark one
// an outlined brass pill; the light open card is solid paper with a lifted shadow, the dark one a
// brass-tinted gradient. Those get their own tokens rather than being forced through one value.
const STYLE = `
:root{
  /* One easing curve for the whole surface, so everything decelerates the same way. */
  --ease:cubic-bezier(.2,.8,.2,1);
  /* Lets block-size:0 -> auto interpolate. It is the single line that makes the accordion
     glide rather than snap. Browsers without it fall back to the snap, which is what we had. */
  interpolate-size:allow-keywords;
  --bg:#faf7f1; --raised:#fffdf8; --card:#fdfbf6; --panel:#f4efe4;
  --heading:#1d1a16; --text:#1d1a16; --muted:#6d665c; --dim:#8a8378;
  --accent:#8a6526; --lit:#b8873a; --lit-bg:rgba(184,135,58,.1); --unlit:#ddd6c8;
  --border:rgba(29,26,22,.12); --border-strong:rgba(29,26,22,.16); --hair:rgba(29,26,22,.09);
  --dots:rgba(29,26,22,.2);
  --card-open-border:rgba(150,112,47,.35); --card-open-bg:#fffdf8;
  --card-open-shadow:0 18px 40px -26px rgba(60,45,20,.45);
  --header-bg:rgba(250,247,241,.93);
  --fade:linear-gradient(180deg,rgba(250,247,241,0),rgba(250,247,241,.97) 45%);
  --cta-bg:#1d1a16; --cta-border:#1d1a16; --cta-ink:#faf7f1; --cta-arrow:#dcb974;
  --serif:'Cormorant Garamond',Georgia,'Times New Roman',serif;
  --sans:Jost,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0f0e0c; --raised:rgba(232,228,220,.03); --card:rgba(232,228,220,.02);
    --panel:rgba(232,228,220,.035);
    --heading:#f4eee2; --text:#e8e4dc; --muted:#918a7d; --dim:#7f7768;
    --accent:#c9a25c; --lit:#dcb974; --lit-bg:rgba(201,162,92,.1); --unlit:#3d382f;
    --border:rgba(232,228,220,.08); --border-strong:rgba(232,228,220,.13);
    --hair:rgba(232,228,220,.09); --dots:rgba(232,228,220,.16);
    --card-open-border:rgba(201,162,92,.32);
    --card-open-bg:linear-gradient(180deg,rgba(201,162,92,.07),rgba(201,162,92,.015));
    --card-open-shadow:none;
    --header-bg:rgba(15,14,12,.94);
    --fade:linear-gradient(180deg,rgba(15,14,12,0),rgba(15,14,12,.97) 45%);
    --cta-bg:rgba(201,162,92,.09); --cta-border:rgba(201,162,92,.45); --cta-ink:#dcb974;
    --cta-arrow:#c9a25c;
  }
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
[hidden]{display:none}
body{margin:0;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;
  font-family:var(--sans);font-weight:300;padding-bottom:112px}
/* Extra footer height for the service-request row -- only paid by restaurants that have it on. */
body[data-service]{padding-bottom:172px}
header{position:sticky;top:0;z-index:6;background:var(--header-bg);
  -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);
  border-bottom:1px solid var(--hair);padding:18px 24px 0}
.head-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
h1{margin:0;font-family:var(--serif);font-size:29px;font-weight:500;line-height:1;
  color:var(--heading)}
/* 44px tap floor, same as every other control on this page -- this one gets hit one-handed too. */
.burger{flex:0 0 auto;width:44px;height:44px;margin-bottom:-8px;border-radius:12px;border:0;
  background:none;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.sub{margin:8px 0 0;font-size:10px;letter-spacing:.34em;text-transform:uppercase;
  color:var(--accent)}
/* Hidden by default and only ever un-hidden client-side, in the inline script below -- the page
   is cached 60s at a shared edge (routes/public.js), so a status baked in at render time could
   go stale or, worse, be served to a different diner than the one it was computed for. */
.hours-badge{margin:8px 0 0;font-size:11.5px;letter-spacing:.04em;color:var(--dim)}
.hours-badge[data-state="open"]{color:var(--lit)}
.hours-badge[data-state="closing-soon"]{color:var(--accent)}
.hours-badge::before{content:"";display:inline-block;width:6px;height:6px;margin-right:7px;
  border-radius:50%;background:currentColor;vertical-align:middle}
.search{width:100%;height:48px;margin:14px 0;border-radius:999px;
  border:1px solid var(--border-strong);background:var(--raised);color:var(--text);
  padding:0 20px;font:inherit;font-size:16px;font-weight:300;outline:none}
.search::placeholder{color:var(--dim)}
/* Category chips. A scrolling rail, not a wrapping set: eight categories wrapped would eat half
   the first screen, and the menu is what someone scanned the coaster for. 44px tall like every
   other tap target here -- these get hit one-handed, by someone holding a fork. */
.chips{display:flex;gap:8px;margin:0 0 14px;overflow-x:auto;scrollbar-width:none;
  -webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--border);
  background:var(--raised);color:var(--muted);font:inherit;font-size:10px;letter-spacing:.2em;
  text-transform:uppercase;white-space:nowrap;cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  transition:color .18s var(--ease),background .18s var(--ease),border-color .18s var(--ease),
    transform .14s var(--ease)}
.chip:active{transform:scale(.94)}
.chip[aria-pressed="true"]{color:var(--lit);background:var(--lit-bg);
  border-color:var(--card-open-border)}
.cat{margin:0;padding:26px 24px 12px;display:flex;align-items:center;gap:14px;
  font-size:10px;font-weight:400;letter-spacing:.38em;text-transform:uppercase;color:var(--dim)}
.cat::after{content:"";flex:1;height:1px;background:var(--hair)}
.list{padding:0 24px 8px;display:flex;flex-direction:column;gap:12px}
.item{border-radius:22px;border:1px solid var(--border);background:var(--card);overflow:hidden;
  scroll-margin:120px 0;
  transition:background .24s var(--ease),border-color .24s var(--ease),box-shadow .24s var(--ease),
    opacity .22s var(--ease),transform .22s var(--ease),display .22s allow-discrete}
.item[open]{border-color:var(--card-open-border);background:var(--card-open-bg);
  box-shadow:var(--card-open-shadow)}
.row{padding:20px 20px 18px;cursor:pointer;list-style:none;display:block}
.row::-webkit-details-marker{display:none}
.line{display:flex;align-items:baseline;gap:14px}
.item-name{font-family:var(--serif);font-size:23px;font-weight:500;line-height:1.1;
  color:var(--heading)}
.leader{flex:1;border-bottom:1px dotted var(--dots);transform:translateY(-5px)}
.price{font-size:15px;letter-spacing:.04em;color:var(--accent);white-space:nowrap;
  font-variant-numeric:tabular-nums}
.line2{margin-top:7px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.desc{font-size:14px;line-height:1.5;color:var(--muted);text-wrap:pretty}
.caret{font-size:12px;color:var(--dim);transition:transform .2s}
.item[open] .caret{transform:rotate(180deg)}
.out{margin-left:10px;padding:6px 12px;border-radius:999px;border:1px solid var(--border-strong);
  font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);
  white-space:nowrap;vertical-align:middle}
.panel{padding:0 20px 20px}
.rule{height:1px;background:var(--hair);margin-bottom:18px}
.rate{padding:18px;border-radius:16px;background:var(--panel);border:1px solid var(--hair)}
.rate-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lbl{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--dim)}
.opt{letter-spacing:.08em;text-transform:none;opacity:.75}
.word{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
/* 44px minimum tap target, per the accessibility floor in the plan. These are tapped one-handed,
   by someone holding a fork. */
.faces{display:flex;gap:6px;margin-top:12px}
.face{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;
  justify-content:center;font-size:24px;line-height:1;border:0;padding:0;background:none;
  color:var(--unlit);cursor:pointer;-webkit-tap-highlight-color:transparent;
  transition:color .18s var(--ease),background .18s var(--ease),transform .14s var(--ease)}
.face:active{transform:scale(.92)}
.face[aria-pressed="true"]{color:var(--lit);background:var(--lit-bg)}
.rule2{margin:14px 0;height:1px;background:var(--hair)}
.note{width:100%;margin-top:10px;padding:13px 14px;border-radius:12px;
  border:1px solid var(--border-strong);background:var(--raised);color:var(--text);font:inherit;
  font-size:16px;font-weight:300;outline:none}
.note::placeholder{color:var(--dim)}
footer{position:fixed;left:0;right:0;bottom:0;z-index:7;padding:16px 24px 26px;
  background:var(--fade);pointer-events:none}
.visit-cta{pointer-events:auto;display:flex;width:100%;align-items:center;
  justify-content:space-between;height:56px;padding:0 22px;border-radius:999px;
  border:1px solid var(--cta-border);background:var(--cta-bg);color:var(--cta-ink);
  font:inherit;font-size:12px;letter-spacing:.22em;text-transform:uppercase;cursor:pointer}
.visit-cta::after{content:"\\2192";letter-spacing:0;color:var(--cta-arrow)}
/* Quieter than .visit-cta on purpose -- an outline pill, not a filled one. Equal weight with the
   feedback CTA would hijack the page's primary purpose. Also reachable from the burger sheet
   below (same data-kind, same handlers) as a second, less prominent path -- not a replacement:
   burying it there alone would make "Request bill" undiscoverable on first visit. */
.service-row{pointer-events:auto;display:flex;gap:8px;margin-bottom:10px}
.service-btn{flex:1;height:48px;border-radius:999px;border:1px solid var(--border-strong);
  background:var(--raised);color:var(--text);font:inherit;font-size:11px;letter-spacing:.16em;
  text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent;
  transition:transform .16s var(--ease),opacity .2s var(--ease),background .2s var(--ease)}
.service-btn:active{transform:scale(.96)}
/* Covers both the footer pill and the sheet row below -- one request can be triggered from
   either place, and both must grey out together while it's cooling down or sending. */
[data-kind][disabled]{opacity:.55;cursor:default;pointer-events:none}
.overlay{position:fixed;inset:0;z-index:20;background:var(--bg);padding:26px 24px 34px;
  display:flex;flex-direction:column;justify-content:center;overflow-y:auto}
.overlay h2{margin:0;font-family:var(--serif);font-size:34px;font-weight:500;line-height:1.15;
  color:var(--heading);text-wrap:pretty}
.overlay p{margin:12px 0 26px;font-size:14px;line-height:1.6;color:var(--muted)}
.overlay .faces{justify-content:space-between;gap:4px;margin-top:14px}
.overlay .face{width:56px;height:56px;font-size:30px}
.field{width:100%;margin-top:16px;padding:14px 16px;border-radius:16px;
  border:1px solid var(--border-strong);background:var(--raised);color:var(--text);font:inherit;
  font-size:16px;font-weight:300;outline:none}
.field::placeholder{color:var(--dim)}
.purpose{margin:9px 0 0;font-size:11.5px;line-height:1.5;color:var(--dim)}
.btn{display:flex;width:100%;margin-top:20px;height:56px;align-items:center;
  justify-content:center;border-radius:999px;border:1px solid var(--cta-border);
  background:var(--cta-bg);color:var(--cta-ink);font:inherit;font-size:12px;letter-spacing:.22em;
  text-transform:uppercase;cursor:pointer;text-decoration:none}
.btn[disabled]{opacity:.4;cursor:not-allowed}
.btn-ghost{background:none;border-color:var(--border);color:var(--dim)}
.btn-quiet{display:inline-block;margin-top:18px;font-size:11px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--muted);text-decoration:underline;text-underline-offset:4px}
.close{position:absolute;top:18px;right:24px;width:38px;height:38px;border-radius:50%;
  border:1px solid var(--border);background:none;color:var(--dim);font:inherit;font-size:15px;
  cursor:pointer}
.empty{padding:36px 24px;color:var(--dim);font-size:14px}

/* The burger sheet and the info modal both reuse .overlay -- see the block below it in the
   markup for why a second full-screen pattern was not worth building for two menu rows. */
.sheet-list{display:flex;flex-direction:column;gap:2px;margin-top:4px}
.sheet-row{display:flex;align-items:center;justify-content:space-between;width:100%;
  height:56px;padding:0 4px;border:0;border-bottom:1px solid var(--hair);background:none;
  color:var(--text);font:inherit;font-size:15px;text-align:left;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.sheet-row:last-child{border-bottom:0}
.sheet-row .chev{color:var(--dim);font-size:14px}
.copied{margin-top:10px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--lit)}

.hours-table{margin-top:16px;display:flex;flex-direction:column}
.hours-row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;
  border-bottom:1px solid var(--hair);font-size:13px;color:var(--muted)}
.hours-row:last-child{border-bottom:0}
.hours-row.today{color:var(--heading);font-weight:400}
.hours-row .day{text-transform:uppercase;letter-spacing:.08em;font-size:10.5px}
.map-link{display:block;margin-top:16px;font-size:13.5px;line-height:1.5;color:var(--accent);
  text-decoration:underline;text-underline-offset:3px}
.closed-note{margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--panel);
  font-size:12.5px;line-height:1.5;color:var(--muted)}

/* --- Motion ------------------------------------------------------------------------------
   All of it is CSS. An animation library would be a blocking script in front of a menu someone
   is reading on restaurant wifi, and nothing here needs a timeline to sequence -- the two
   one-shot flourishes are keyframes the browser already knows how to run.

   The two modern pieces are transition-behavior:allow-discrete and @starting-style, which are
   what let an element that is display:none animate at all. Phones too old for them get today's
   instant show/hide, not a broken page. */
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(1)}42%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes swap{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}

/* Entrance. Header, CTA and the first screenful only: animating sixty dishes on load is paint
   work nobody sees, and someone scrolling to the mains should find them already there.
   Fill mode is backwards, never both: a forwards fill would pin opacity at 1 forever and the
   search filter below could never fade anything out again. */
header{animation:rise .45s var(--ease) backwards}
footer{animation:rise .45s var(--ease) .1s backwards}
section:first-of-type .item{animation:rise .45s var(--ease) backwards;
  animation-delay:calc(var(--i,0)*45ms + 60ms)}

/* The accordion. ponytail: native ::details-content, so open/close costs no JS at all. Reach
   for a WAAPI height animation only if the older-phone floor turns out to matter. */
.item::details-content{block-size:0;overflow:clip;opacity:0;
  transition:block-size .34s var(--ease),opacity .24s var(--ease),
    content-visibility .34s allow-discrete}
.item[open]::details-content{block-size:auto;opacity:1}

/* Search. Non-matches fade out, matches appear instantly: results that snap in read as fast,
   results that snap out read as broken. The section fades with its dishes rather than vanishing
   out from under them mid-fade. */
.item[hidden]{display:none;opacity:0;transform:scale(.97)}
section{transition:opacity .22s var(--ease),display .22s allow-discrete}
section[hidden]{display:none;opacity:0}
#no-hits{transition:opacity .25s var(--ease),display .25s allow-discrete}
#no-hits[hidden]{display:none;opacity:0}
@starting-style{#no-hits:not([hidden]){opacity:0}}

/* The rating sweeps on left to right instead of snapping as a block. Only colour is delayed --
   the press scale stays instant, or the tap itself feels laggy. */
.face:nth-child(2){transition-delay:22ms,22ms,0s}
.face:nth-child(3){transition-delay:44ms,44ms,0s}
.face:nth-child(4){transition-delay:66ms,66ms,0s}
.face:nth-child(5){transition-delay:88ms,88ms,0s}
.face.pop{animation:pop .34s var(--ease)}
.word.swap{animation:swap .26s var(--ease)}

/* Overlays. */
.overlay{transition:opacity .3s var(--ease),transform .3s var(--ease),
  display .3s allow-discrete}
.overlay[hidden]{display:none;opacity:0;transform:translateY(14px)}
@starting-style{.overlay:not([hidden]){opacity:0;transform:translateY(14px)}}
#thanks:not([hidden])>div>*{animation:rise .42s var(--ease) backwards}
#thanks>div>*:nth-child(2){animation-delay:.06s}
#thanks>div>*:nth-child(3){animation-delay:.12s}
#thanks>div>*:nth-child(4){animation-delay:.18s}
#thanks>div>*:nth-child(5){animation-delay:.24s}

/* The contact field opens on a 0fr->1fr grid row rather than appearing at full height, so the
   Send button slides down under the thumb instead of jumping out from under it. */
#contact-wrap{display:grid;grid-template-rows:1fr;
  transition:grid-template-rows .32s var(--ease),opacity .24s var(--ease),
    display .32s allow-discrete}
#contact-wrap>div{overflow:hidden}
#contact-wrap[hidden]{display:none;grid-template-rows:0fr;opacity:0}
@starting-style{#contact-wrap:not([hidden]){grid-template-rows:0fr;opacity:0}}

/* Touch feedback. */
.search,.note,.field{transition:border-color .2s var(--ease),box-shadow .2s var(--ease)}
.search:focus,.note:focus,.field:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--lit-bg)}
.row{-webkit-tap-highlight-color:transparent;transition:background .18s var(--ease)}
.item:not([open]) .row:active{background:var(--panel)}
.visit-cta,.btn{transition:transform .16s var(--ease),opacity .2s var(--ease),
  background .2s var(--ease),border-color .2s var(--ease)}
.visit-cta:active,.btn:not([disabled]):active{transform:scale(.975)}
.visit-cta::after{transition:transform .22s var(--ease)}
.visit-cta:active::after{transform:translateX(4px)}
.close{transition:transform .18s var(--ease)}
.close:active{transform:scale(.9)}
.btn-quiet{transition:opacity .18s var(--ease)}
.btn-quiet:active{opacity:.55}

/* Off means off: keyframes as well as transitions, and the smooth scroll the toggle handler
   below leans on. */
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation:none!important;transition:none!important}
}
`;

// The stylesheet above is written to be read: comments explaining why a transition exists, one
// rule per line, indentation. None of that is worth sending to a phone -- the comments alone are
// 2.2KB, and the whole lot costs about 14% of the compressed page for nothing a diner benefits
// from. Stripped here rather than by hand up there, so the source stays editable.
//
// Comments out, every whitespace run down to a single space, then the spaces that are never
// load-bearing in CSS removed entirely. Single spaces survive everywhere else on purpose: that
// is where descendant selectors (`.item[open] .caret`) and calc operands (`+ 60ms`) live, and
// both break if the space goes.
//
// ponytail: a regex, not a CSS parser -- correct for this stylesheet and pinned by
// dinerPage.test.js. The known ceiling is a brace, semicolon or comma inside a quoted value
// (content:"a, b"), where this would eat the space. Reach for a real parser then, not before.
function squeeze(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    .trim();
}

// Once, at module load. renderPage runs on every scan.
const STYLE_MIN = squeeze(STYLE);

// The inline <script> below is deliberately NOT put through this. Minifying JS with a regex is
// how you ship a page that breaks on one phone and nothing else -- ASI, a `//` inside a string,
// a regex literal. It is the smaller half anyway (5.7KB against 13.3KB), and it gzips well.

// The rating control, shared by the per-dish strip and the visit overlay. aria-label is spelled
// "N out of 5" rather than naming the shape: COMPLIANCE.md 4 keeps every number in the copy well
// away from anything that reads as a target.
const scale = () =>
  [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<button class="face" type="button" aria-pressed="false" data-r="${n}" aria-label="${n} out of 5">★</button>`
    )
    .join('');

// `i` arrives free from Array#map. It only feeds the entrance stagger, capped because past the
// eighth dish nobody is watching the load animation any more.
function renderItem(item, i) {
  const stagger = `--i:${Math.min(i || 0, 8)}`;
  const price = formatCents(item.price_cents);
  // Name and description both feed the search box -- someone hunting "peri" should find the dish
  // whose description mentions it, not only the ones with it in the title.
  const haystack = esc(`${item.name} ${item.description || ''}`.toLowerCase());

  const row = `<span class="line">
      <span class="item-name">${esc(item.name)}</span>${item.available ? '' : '<span class="out">sold out</span>'}
      <span class="leader"></span>
      ${price ? `<span class="price">${esc(price)}</span>` : ''}
    </span>
    ${
      item.description || item.available
        ? `<span class="line2">
      <span class="desc">${esc(item.description || '')}</span>
      ${item.available ? '<span class="caret">⌄</span>' : ''}
    </span>`
        : ''
    }`;

  // An unavailable dish carries no rating strip: there is no point inviting a rating for
  // something nobody at this table could have ordered tonight. With nothing to reveal it stays a
  // flat card rather than an accordion that opens onto nothing. The API is deliberately more
  // permissive -- a diner on a stale page who DID eat it still gets through. See
  // routes/public.js for why that asymmetry is intended.
  if (!item.available) {
    return `<div class="item" style="${stagger}" data-name="${haystack}"><div class="row" style="cursor:default">${row}</div></div>`;
  }

  // <details name="dish"> is the entire accordion: one open at a time, keyboard-operable, no JS.
  // Browsers without exclusive-accordion support simply allow several open, which is harmless.
  return `<details class="item" name="dish" style="${stagger}" data-name="${haystack}">
  <summary class="row">${row}</summary>
  <div class="panel">
    <div class="rule"></div>
    <div class="rate">
      <div class="rate-head">
        <span class="lbl">Rate this dish</span>
        <span class="word">Tap to rate</span>
      </div>
      <div class="faces" data-item="${esc(item.id)}" role="group" aria-label="Rate ${esc(item.name)}">${scale()}</div>
      <div class="rule2"></div>
      <div class="lbl">Add a note <span class="opt">(optional)</span></div>
      <input class="note" type="text" placeholder="Tell the chef…" aria-label="Comment on ${esc(item.name)}">
    </div>
  </div>
</details>`;
}

// Monday-first for display, which is the order people actually read a hours list in -- unrelated
// to DAYS' Sunday-first order in hours.js, which exists only to line up with Date's getUTCDay().
const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DISPLAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function formatPeriods(periods) {
  if (!periods || !periods.length) return 'Closed';
  return periods.map(([open, close]) => `${open}–${close}`).join(', ');
}

// Not time-sensitive -- the schedule itself is the same regardless of who is looking at it or
// when, so unlike the open/closed badge this renders once, server-side. Only which row is
// "today" depends on the viewer's moment, and that class is added client-side (see the inline
// script), off the same SAST clock the badge uses.
function renderHoursTable(hours) {
  if (!hours) return '';
  return DISPLAY_ORDER.map(
    (day) =>
      `<div class="hours-row" data-day="${day}"><span class="day">${DAY_LABEL[day]}</span><span>${esc(formatPeriods(hours[day]))}</span></div>`
  ).join('');
}

function renderPage({ restaurant, menu }) {
  // An empty category is not a filter anyone wants offered, and it renders as a heading with a
  // gap under it. Filtered once here so the chips and the sections cannot disagree about indices.
  const cats = menu.filter((c) => c.items.length);

  // Off by default (src/db/service_requests.sql) -- when off, not one byte of the buttons, the
  // table-number prompt or their CSS/script wiring ships. renderPage's signature stays exactly
  // { restaurant, menu } either way; this reads off the restaurant row already in scope, the same
  // one dinerPage.test.js pins to prove no rating can ever reach this function.
  const serviceEnabled = !!restaurant.service_requests_enabled;

  const sections = cats
    .map(
      (c, i) => `<section data-cat="${i}">
  <h2 class="cat">${esc(c.name)}</h2>
  <div class="list">${c.items.map(renderItem).join('')}</div>
</section>`
    )
    .join('');

  // One category needs no filter -- the rail would read "All | Mains" and cost a row of the first
  // screen to say nothing. Two or more and it earns the space.
  const chips =
    cats.length > 1
      ? `<nav class="chips" aria-label="Filter by category">
    <button class="chip" type="button" data-cat="all" aria-pressed="true">All</button>
    ${cats
      .map((c, i) => `<button class="chip" type="button" data-cat="${i}" aria-pressed="false">${esc(c.name)}</button>`)
      .join('')}
  </nav>`
      : '';

  // The review form URL is built from the Place ID alone -- no API, no OAuth, no approval. When a
  // restaurant has no Place ID yet, the CTA is simply absent rather than pointing at a broken
  // link; the rest of the thank-you screen still works.
  const reviewUrl = restaurant.google_place_id
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(restaurant.google_place_id)}`
    : '';

  // Share Menu needs no data and works from minute one, so it always shows. Hours & Address is
  // hidden from the sheet entirely -- rather than shown with a placeholder -- when nothing has
  // been filled in, which is every restaurant's state between creation and someone using
  // Settings. A row that says "not added yet" tells a diner about the owner's admin backlog.
  const hasInfo = !!(restaurant.address || restaurant.hours || restaurant.closed_note);
  const hoursTable = renderHoursTable(restaurant.hours);
  const mapUrl = restaurant.address
    ? `https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}`
    : '';

  // The sheet and the info modal below both reuse .overlay rather than a new anchored-dropdown
  // pattern -- two rows do not justify a second full-screen mechanism when this one is already
  // themed for both palettes and already handles [hidden] + @starting-style + reduced motion.
  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(restaurant.name)}</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Jost:wght@300;400&display=swap">
<style>${STYLE_MIN}</style>
</head>
<body data-slug="${esc(restaurant.slug)}"
      data-hours="${esc(JSON.stringify(restaurant.hours || null))}"
      data-closed-note="${esc(restaurant.closed_note || '')}"
      ${serviceEnabled ? 'data-service' : ''}>
<header>
  <div class="head-row">
    <h1>${esc(restaurant.name)}</h1>
    <button class="burger" type="button" id="open-sheet" aria-label="More options" aria-haspopup="true">☰</button>
  </div>
  <p class="sub">Menu</p>
  <p class="hours-badge" id="hours-badge" hidden></p>
  <input class="search" id="q" type="search" placeholder="Wings, ribs, pap…" aria-label="Search the menu">
  ${chips}
</header>

${sections || '<p class="empty">This menu is being set up.</p>'}
<p class="empty" id="no-hits" hidden>Nothing on the menu matches that.</p>

<footer>
  ${
    serviceEnabled
      ? `<div class="service-row">
    <button class="service-btn" type="button" data-kind="waiter"><span class="label">Call waiter</span></button>
    <button class="service-btn" type="button" data-kind="bill"><span class="label">Request bill</span></button>
  </div>`
      : ''
  }
  <button class="visit-cta" type="button" id="open-visit">How was your visit?</button>
</footer>

${
  // Reuses the .overlay pattern below rather than a bespoke prompt: it is already themed for both
  // palettes and already handles [hidden] + @starting-style + reduced motion, and a second
  // full-screen mechanism for one text field would not earn its keep.
  serviceEnabled
    ? `<div class="overlay" id="table-ask" hidden role="dialog" aria-modal="true" aria-labelledby="table-h">
  <button class="close" type="button" id="close-table" aria-label="Close">✕</button>
  <div>
    <h2 id="table-h">Which table are you at?</h2>
    <p>So the right table gets served. We only ask once a visit.</p>
    <input class="field" id="table-input" type="text" inputmode="numeric" maxlength="12"
           autocomplete="off" placeholder="12" aria-label="Table number">
    <button class="btn" type="button" id="table-go" disabled>Send</button>
  </div>
</div>`
    : ''
}

<div class="overlay" id="visit" hidden role="dialog" aria-modal="true" aria-labelledby="visit-h">
  <button class="close" type="button" id="close-visit" aria-label="Close">✕</button>
  <div>
    <h2 id="visit-h">How was your visit?</h2>
    <p>One tap. Anything else is optional.</p>
    <div class="rate-head">
      <span class="lbl">Service &amp; room</span>
      <span class="word">Tap to rate</span>
    </div>
    <div class="faces" id="visit-faces" role="group" aria-label="Rate your visit">${scale()}</div>
    <input class="field" id="visit-note" type="text" placeholder="Tell us more (optional)" aria-label="Comment">
    <div id="contact-wrap" hidden>
      <div>
        <input class="field" id="visit-contact" type="text" inputmode="email"
               placeholder="Phone or email (optional)" aria-label="Contact details">
        <p class="purpose">Only so the owner can get back to you about this visit. Nothing else,
        and we delete it after 90 days.</p>
      </div>
    </div>
    <button class="btn" type="button" id="visit-send" disabled>Send</button>
  </div>
</div>

<div class="overlay" id="thanks" hidden role="dialog" aria-modal="true" aria-labelledby="thanks-h">
  <div>
    <h2 id="thanks-h" data-high="Glad we got it right." data-low="Thanks — that's been passed on.">Thanks</h2>
    <p id="thanks-body"
       data-high="Mind sharing it publicly? It genuinely helps a small restaurant."
       data-low="The owner has been notified and will look into it."></p>
    ${
      // COMPLIANCE.md rule 2. This link is rendered for EVERY rating, 1 through 5. Only its
      // prominence changes -- primary button at 4-5, quiet text link at 1-3. Hiding it from
      // unhappy diners is review gating and is itself a policy violation. Do not add a
      // condition here.
      reviewUrl
        ? `<a class="btn" id="review-primary" href="${esc(reviewUrl)}" target="_blank" rel="noopener">Share this on Google</a>
    <a class="btn-quiet" id="review-quiet" href="${esc(reviewUrl)}" target="_blank" rel="noopener">You can also leave a public Google review.</a>`
        : ''
    }
    <button class="btn btn-ghost" type="button" id="thanks-close">Back to the menu</button>
  </div>
</div>

<div class="overlay" id="sheet" hidden role="dialog" aria-modal="true" aria-labelledby="sheet-h">
  <button class="close" type="button" id="close-sheet" aria-label="Close">✕</button>
  <div>
    <p class="sub" id="sheet-h">More</p>
    <nav class="sheet-list">
      ${
        hasInfo
          ? `<button class="sheet-row" type="button" id="open-info">
        <span>Hours &amp; Address</span><span class="chev">›</span>
      </button>`
          : ''
      }
      <button class="sheet-row" type="button" id="share-menu">
        <span>Share Menu</span><span class="chev">›</span>
      </button>
      ${
        serviceEnabled
          ? `<button class="sheet-row" type="button" data-kind="waiter">
        <span class="label">Call waiter</span><span class="chev">›</span>
      </button>
      <button class="sheet-row" type="button" data-kind="bill">
        <span class="label">Request bill</span><span class="chev">›</span>
      </button>`
          : ''
      }
    </nav>
    <p class="copied" id="share-copied" hidden>Link copied</p>
  </div>
</div>

${
  hasInfo
    ? `<div class="overlay" id="info" hidden role="dialog" aria-modal="true" aria-labelledby="info-h">
  <button class="close" type="button" id="close-info" aria-label="Close">✕</button>
  <div>
    <h2 id="info-h">Hours &amp; Address</h2>
    <p class="hours-badge" id="info-badge" hidden></p>
    ${
      restaurant.closed_note
        ? `<p class="closed-note">${esc(restaurant.closed_note)}</p>`
        : hoursTable
        ? `<div class="hours-table">${hoursTable}</div>`
        : ''
    }
    ${mapUrl ? `<a class="map-link" href="${esc(mapUrl)}" target="_blank" rel="noopener">${esc(restaurant.address)}</a>` : ''}
  </div>
</div>`
    : ''
}

<script>
(function(){
  var slug = document.body.dataset.slug;
  var WORDS = ${JSON.stringify(WORDS)};
  var sending = false;

  function post(path, body){
    return fetch('/api/public/' + encodeURIComponent(slug) + path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      credentials:'same-origin', body:JSON.stringify(body)
    });
  }

  // Restarts a one-shot keyframe class. Removing and re-adding is not enough on its own -- the
  // layout read wedged in between is what actually resets the animation.
  function replay(el, cls){
    if(!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // The scale fills cumulatively, so everything up to the chosen point reads as pressed. The
  // chosen value itself lives on the group -- reading it back off the DOM is now ambiguous.
  function select(group, rating){
    group.dataset.rating = rating;
    group.querySelectorAll('.face').forEach(function(b){
      b.setAttribute('aria-pressed', String(Number(b.dataset.r) <= rating));
    });
    replay(group.querySelector('.face[data-r="' + rating + '"]'), 'pop');
    var word = group.parentNode.querySelector('.word');
    if(word){ word.textContent = WORDS[rating]; replay(word, 'swap'); }
    group.classList.add('done');
  }

  // Opening a dish near the fold pushes its own panel off screen, and one-at-a-time accordions
  // can close a row above it and shift it further. Nudge it back once the height has settled --
  // 340ms is the ::details-content duration. No behavior option is passed, so CSS scroll-behavior
  // stays in charge and prefers-reduced-motion still wins.
  document.querySelectorAll('details.item').forEach(function(d){
    d.addEventListener('toggle', function(){
      if(d.open) setTimeout(function(){ d.scrollIntoView({ block: 'nearest' }); }, 340);
    });
  });

  // Item ratings save on the tap itself. A diner who rates two dishes and then closes the tab
  // still gave us two ratings -- which on a restaurant table is the normal case, not the edge.
  document.querySelectorAll('.faces[data-item]').forEach(function(group){
    var note = group.parentNode.querySelector('.note');
    group.addEventListener('click', function(e){
      var btn = e.target.closest('.face');
      if(!btn) return;
      var rating = Number(btn.dataset.r);
      select(group, rating);          // optimistic: the tap reads as instant on bad signal
      post('/item-rating', { itemId: group.dataset.item, rating: rating });
    });
    note.addEventListener('change', function(){
      if(!group.classList.contains('done')) return;
      post('/item-rating', {
        itemId: group.dataset.item,
        rating: Number(group.dataset.rating),
        comment: note.value
      });
    });
  });

  // Menu search and category chips, client side. No request and no index -- the whole menu is
  // already in the document, and on restaurant wifi a round trip per keystroke would be the
  // slowest thing here.
  //
  // One pass applies both, because they compose: the chip narrows to a category and the search
  // narrows within whatever the chip left standing. Two independent handlers each setting
  // hidden would fight over the same attribute and the last one to run would win.
  var q = document.getElementById('q');
  var noHits = document.getElementById('no-hits');
  var chips = document.querySelectorAll('.chip');
  var cat = 'all';

  function apply(){
    var term = q.value.trim().toLowerCase();
    var hits = 0;
    document.querySelectorAll('section').forEach(function(sec){
      var inCat = cat === 'all' || sec.dataset.cat === cat;
      var shown = 0;
      sec.querySelectorAll('.item').forEach(function(el){
        var hit = inCat && (!term || el.dataset.name.indexOf(term) > -1);
        el.hidden = !hit;
        if(hit) shown++;
      });
      // A category whose dishes are all filtered out hides its heading too, otherwise the page
      // reads as a list of empty sections.
      sec.hidden = !shown;
      hits += shown;
    });
    // Only a real miss earns the message. A chip on its own always has dishes behind it, so
    // "nothing matches" would be a lie the moment someone taps Desserts.
    noHits.hidden = hits > 0 || (!term && cat === 'all');
  }

  q.addEventListener('input', apply);

  chips.forEach(function(chip){
    chip.addEventListener('click', function(){
      cat = chip.dataset.cat;
      chips.forEach(function(c){ c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
      apply();
      // Tapping Desserts from halfway down the mains is a request to see desserts, not to stay at
      // the same offset in a page that just got shorter. No behavior option, so CSS
      // scroll-behavior stays in charge and prefers-reduced-motion still wins.
      window.scrollTo({ top: 0 });
    });
  });

  // Burger sheet, info modal, and the open/closed badge. status() is lib/hours.js's own function,
  // inlined here via toString() so there is exactly one implementation of the open/closed math --
  // see that file's header for why it has to run on the client rather than at render time.
  var hours = JSON.parse(document.body.dataset.hours || 'null');
  var closedNote = document.body.dataset.closedNote;

  ${status.toString()}

  // One status() call feeds both badges (header + modal) and the "today" row highlight, so all
  // three can never disagree about what moment they are describing. closedNote suppresses the
  // badge entirely -- a confident "Open now" on a day the owner has flagged as an exception is
  // worse than showing nothing.
  var hoursStatus = (!closedNote && hours) ? status(hours, new Date()) : null;

  function applyBadge(el){
    if(!el) return;
    if(!hoursStatus){ el.hidden = true; return; }
    el.textContent = hoursStatus.state === 'open' ? 'Open now'
      : hoursStatus.state === 'closing-soon' ? ('Closing soon — until ' + hoursStatus.until)
      : (hoursStatus.until ? ('Closed — opens ' + hoursStatus.until) : 'Closed');
    el.dataset.state = hoursStatus.state;
    el.hidden = false;
  }
  applyBadge(document.getElementById('hours-badge'));

  var sheet = document.getElementById('sheet');
  var info = document.getElementById('info');

  if(info){
    applyBadge(document.getElementById('info-badge'));
    if(hoursStatus){
      var todayRow = info.querySelector('.hours-row[data-day="' + hoursStatus.day + '"]');
      if(todayRow) todayRow.classList.add('today');
    }
  }

  document.getElementById('open-sheet').onclick = function(){ sheet.hidden = false; };
  document.getElementById('close-sheet').onclick = function(){ sheet.hidden = true; };

  var openInfo = document.getElementById('open-info');
  if(openInfo){
    // One overlay at a time: the sheet closes as the modal opens, and closing the modal returns
    // to the menu, not back to the sheet -- worth revisiting once this list has more than two
    // rows, not before.
    openInfo.onclick = function(){ sheet.hidden = true; info.hidden = false; };
    document.getElementById('close-info').onclick = function(){ info.hidden = true; };
  }

  document.getElementById('share-menu').onclick = function(){
    var url = window.location.href;
    if(navigator.share){
      // A cancelled OS share sheet rejects the promise -- that is the diner changing their mind,
      // not a failure, so it is swallowed rather than surfaced.
      navigator.share({ title: document.title, url: url }).catch(function(){});
    } else if(navigator.clipboard){
      navigator.clipboard.writeText(url).then(function(){
        var note = document.getElementById('share-copied');
        note.hidden = false;
        setTimeout(function(){ note.hidden = true; }, 2000);
      });
    }
  };

  // Call waiter / Request bill. Reachable from two places -- the footer pill and, if the sheet has
  // it, the burger sheet row -- sharing one data-kind attribute so both stay in sync. serviceBtns
  // is empty when the restaurant has this off, and every handler below is scoped inside the length
  // check, so the whole block is a no-op rather than throwing on elements it would expect to find.
  var serviceBtns = document.querySelectorAll('[data-kind]');
  if(serviceBtns.length){
    var tableAsk = document.getElementById('table-ask');
    var tableInput = document.getElementById('table-input');
    var tableGo = document.getElementById('table-go');
    var tableKey = 'rt:' + slug;
    // 4h, matching the visit cookie's TTL in routes/public.js, for the same reason: long enough
    // for a leisurely meal, short enough that tomorrow's diner on a shared family phone does not
    // inherit last night's table.
    var TABLE_TTL = 4 * 60 * 60 * 1000;
    var pendingKind = null;
    var LABELS = { waiter: 'Call waiter', bill: 'Request bill' };

    // Safari in private mode throws on a localStorage READ as well as a write, so both are
    // wrapped. Losing the memory just means asking again -- annoying, never broken.
    function rememberedTable(){
      try {
        var r = JSON.parse(localStorage.getItem(tableKey) || 'null');
        return (r && Date.now() - r.t < TABLE_TTL) ? r.v : null;
      } catch(e){ return null; }
    }
    function rememberTable(v){
      try { localStorage.setItem(tableKey, JSON.stringify({ v: v, t: Date.now() })); } catch(e){}
    }

    // Every element sharing this data-kind -- the footer pill and the sheet row are the same
    // request wearing two hats, and both must show the same label/disabled state at once.
    function ofKind(kind){ return document.querySelectorAll('[data-kind="' + kind + '"]'); }
    function setLabel(el, text){ (el.querySelector('.label') || el).textContent = text; }

    // NOT optimistic, unlike the item ratings above. A rating that silently failed costs a data
    // point; a bill request that silently failed leaves someone waiting for a waiter who was
    // never called, and they will blame the restaurant for it, not a dropped packet.
    function send(kind, table){
      var els = ofKind(kind);
      els.forEach(function(el){ el.disabled = true; });
      post('/service-request', { kind: kind, table: table }).then(function(res){
        if(!res.ok) throw new Error();
        var sent = kind === 'bill' ? 'Bill requested ✓' : 'Waiter called ✓';
        els.forEach(function(el){ setLabel(el, sent); });
        // The cooldown is UX, not the guard -- the dedupe index in service_requests.sql is what
        // actually protects the display. This just stops the buttons reading as unanswered.
        setTimeout(function(){
          els.forEach(function(el){ setLabel(el, LABELS[kind]); el.disabled = false; });
        }, 90000);
      }).catch(function(){
        els.forEach(function(el){ setLabel(el, 'Could not send — tap to retry'); el.disabled = false; });
      });
    }

    serviceBtns.forEach(function(btn){
      btn.onclick = function(){
        // One overlay at a time, same rule as Hours & Address below: a tap from the sheet closes
        // it first, whether that leads straight to sending or to the table prompt opening on top.
        sheet.hidden = true;
        var table = rememberedTable();
        // The first tap of a visit can never send anything on its own -- it opens the prompt.
        // That doubles as the mis-tap guard: a stray thumb on a fixed footer costs a dialog, not
        // an actual waiter's walk across the room.
        if(table) return send(btn.dataset.kind, table);
        pendingKind = btn.dataset.kind;
        tableAsk.hidden = false;
        tableInput.value = '';
        tableGo.disabled = true;
        tableInput.focus();
      };
    });

    tableInput.addEventListener('input', function(){
      tableGo.disabled = !tableInput.value.trim();
    });
    document.getElementById('close-table').onclick = function(){ tableAsk.hidden = true; };
    tableGo.onclick = function(){
      var v = tableInput.value.trim().slice(0, 12);
      if(!v) return;
      rememberTable(v);
      tableAsk.hidden = true;
      send(pendingKind, v);
    };
  }

  var visit = document.getElementById('visit');
  var thanks = document.getElementById('thanks');
  var vFaces = document.getElementById('visit-faces');
  var vSend = document.getElementById('visit-send');
  var contactWrap = document.getElementById('contact-wrap');
  var chosen = 0;

  document.getElementById('open-visit').onclick = function(){ visit.hidden = false; };
  document.getElementById('close-visit').onclick = function(){ visit.hidden = true; };
  document.getElementById('thanks-close').onclick = function(){ thanks.hidden = true; };

  vFaces.addEventListener('click', function(e){
    var btn = e.target.closest('.face');
    if(!btn) return;
    chosen = Number(btn.dataset.r);
    select(vFaces, chosen);
    vSend.disabled = false;
    // Contact is offered only on a poor visit, and only ever as an option. See COMPLIANCE.md 6.
    contactWrap.hidden = chosen > 3;
  });

  vSend.onclick = function(){
    if(!chosen || sending) return;
    sending = true;
    vSend.disabled = true;
    post('/visit-rating', {
      rating: chosen,
      comment: document.getElementById('visit-note').value,
      contact: chosen <= 3 ? document.getElementById('visit-contact').value : ''
    }).catch(function(){}).then(function(){
      sending = false;
      visit.hidden = true;
      var high = chosen >= 4;
      var h = document.getElementById('thanks-h');
      var body = document.getElementById('thanks-body');
      h.textContent = high ? h.dataset.high : h.dataset.low;
      body.textContent = high ? body.dataset.high : body.dataset.low;
      // Prominence flips; presence does not. Both nodes stay in the DOM at every rating.
      var primary = document.getElementById('review-primary');
      var quiet = document.getElementById('review-quiet');
      if(primary){ primary.style.display = high ? 'flex' : 'none'; }
      if(quiet){ quiet.style.display = high ? 'none' : 'inline-block'; }
      thanks.hidden = false;
    });
  };
})();
</script>
</body>
</html>`;
}

module.exports = { renderPage, esc, WORDS, squeeze, formatPeriods };
