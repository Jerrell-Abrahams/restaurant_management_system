const { formatCents } = require('./money');
const { DAYS, status, CLOSING_SOON_MINS } = require('./hours');
const { ALLERGEN_LABELS } = require('./dietary');
const { PROMO_LABEL_TEXT } = require('./promotions');

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
  /* Softer than near-black on purpose: #1d1a16 on this cream bg was 16.2:1, well past the 7:1
     AAA needs even for body text. #403a30 lands at 10.5:1 -- still comfortably AAA, less glare. */
  --heading:#403a30; --text:#403a30; --muted:#6d665c; --dim:#8a8378;
  --accent:#8a6526; --lit:#b8873a; --lit-bg:rgba(184,135,58,.1); --unlit:#ddd6c8;
  --border:rgba(29,26,22,.12); --border-strong:rgba(29,26,22,.16); --hair:rgba(29,26,22,.09);
  --dots:rgba(29,26,22,.2);
  --card-open-border:rgba(150,112,47,.35); --card-open-bg:#fffdf8;
  --card-open-shadow:0 18px 40px -26px rgba(60,45,20,.45);
  --header-bg:rgba(250,247,241,.93);
  --fade:linear-gradient(180deg,rgba(250,247,241,0) 0,rgba(250,247,241,1) 16px);
  --cta-bg:#1d1a16; --cta-border:#1d1a16; --cta-ink:#faf7f1; --cta-arrow:#dcb974;
  --serif:'Cormorant Garamond',Georgia,'Times New Roman',serif;
  --sans:Jost,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
/* Dark vars are declared twice on purpose: once behind the media query (system preference, unless
   the diner picked light explicitly) and once behind [data-theme="dark"] (the manual toggle below,
   which must win even when the system is in light mode). One block feeding both would mean the
   toggle can only ever agree with the system, never override it. */
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
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
    --fade:linear-gradient(180deg,rgba(15,14,12,0) 0,rgba(15,14,12,1) 16px);
    --cta-bg:rgba(201,162,92,.09); --cta-border:rgba(201,162,92,.45); --cta-ink:#dcb974;
    --cta-arrow:#c9a25c;
  }
}
:root[data-theme="dark"]{
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
  --fade:linear-gradient(180deg,rgba(15,14,12,0) 0,rgba(15,14,12,1) 16px);
  --cta-bg:rgba(201,162,92,.09); --cta-border:rgba(201,162,92,.45); --cta-ink:#dcb974;
  --cta-arrow:#c9a25c;
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
  border-bottom:1px solid var(--hair);padding:18px 18px 16px}
/* center, not baseline: the right-hand item used to be .burger alone, whose text glyph gave the
   row a real baseline to align to. It is now .head-actions, an icon-only flex group with no text
   -- flex's baseline forwarding would synthesize one from an SVG's box edge instead, which does
   not land in the same place. Center is the reference point icons and a heading actually share. */
.head-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
h1{margin:0;font-family:var(--serif);font-size:24.5px;font-weight:500;line-height:1;
  color:var(--heading)}
/* Groups the theme toggle and the burger as one flex item so space-between above still puts a
   single block on the right. */
.head-actions{display:flex;align-items:center;gap:2px}
/* 44px tap floor, same as every other control on this page -- these get hit one-handed too. */
.burger{flex:0 0 auto;width:44px;height:44px;border-radius:7px;border:0;
  background:none;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.theme-toggle{flex:0 0 auto;width:44px;height:44px;display:flex;align-items:center;
  justify-content:center;border-radius:7px;border:0;background:none;color:var(--muted);
  cursor:pointer;-webkit-tap-highlight-color:transparent}
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
/* Category chips. Below the header's hairline now, not inside the sticky header itself, so they
   scroll away with the menu instead of pinning at the top. A scrolling rail, not a wrapping set:
   eight categories wrapped would eat half the first screen, and the menu is what someone scanned
   the coaster for. 44px tall like every other tap target here -- these get hit one-handed, by
   someone holding a fork -- read smaller through tighter padding and type, not a shorter target. */
.chips{display:flex;gap:8px;margin:14px 0;padding:0 18px;overflow-x:auto;scrollbar-width:none;
  -webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;height:44px;padding:0 13px;border-radius:999px;border:1px solid var(--border);
  background:var(--raised);color:var(--muted);font:inherit;font-size:9.5px;letter-spacing:.18em;
  text-transform:uppercase;white-space:nowrap;cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  transition:color .18s var(--ease),background .18s var(--ease),border-color .18s var(--ease),
    transform .14s var(--ease)}
.chip:active{transform:scale(.94)}
.chip[aria-pressed="true"]{color:var(--lit);background:var(--lit-bg);
  border-color:var(--card-open-border)}
/* Square, so the icon sits centred rather than in a pill sized for a word. */
.chip-search{width:44px;padding:0;display:flex;align-items:center;justify-content:center}
.chip-search[aria-expanded="true"]{color:var(--lit);background:var(--lit-bg);
  border-color:var(--card-open-border)}
/* The whole expand/collapse, in one transitioned width. The field grows into the row and the
   chips are pushed out of the scroll port rather than being hidden or re-laid-out -- one property
   animating, no JS measuring, and it reverses for free. overflow-x flips to hidden while open so
   the pushed-away chips cannot be scrolled back into view mid-search. */
.search-wrap{position:relative;flex:0 0 auto;width:0;overflow:hidden;
  transition:width .32s var(--ease)}
.chips[data-searching]{overflow-x:hidden}
.chips[data-searching] .search-wrap{width:calc(100% - 52px)}
.search{width:100%;height:44px;padding:0 38px 0 16px;border-radius:999px;
  border:1px solid var(--border-strong);background:var(--raised);color:var(--text);
  font:inherit;font-size:16px;font-weight:300;outline:none}
.search::placeholder{color:var(--dim)}
/* We ship our own X (below) so it can sit in the themed position and clear on one tap; WebKit's
   would be a second one right beside it. */
.search::-webkit-search-cancel-button{display:none}
.search-x{position:absolute;right:2px;top:0;width:36px;height:44px;border:0;background:none;
  color:var(--dim);font-size:13px;line-height:1;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.cat{margin:0;padding:26px 18px 12px;display:flex;align-items:center;gap:14px;
  font-size:10px;font-weight:400;letter-spacing:.38em;text-transform:uppercase;color:var(--dim)}
.cat::after{content:"";flex:1;height:1px;background:var(--hair)}
/* Centers the chip row in the gap between the header's hairline and the first heading: above
   is exactly .chips' own 14px margin-top, so this zeroes the equivalent padding here rather than
   stacking on top of .chips' 14px margin-bottom -- 14px on both sides of the chips, instead of
   14 above and 26 below. Every OTHER section still gets the full 26px, unaffected: it comes
   entirely from this same padding, undisturbed, since sections butt against each other with no
   margin of their own.
   The structural "+" selector only ever matches the literal first section in the document, which
   is exactly right before any filtering happens. Once a chip hides that section, whichever section
   is now topmost is a later, un-zeroed one -- the gap would jump to 26px on every category but the
   first. .cat-top (set client-side in apply() below) is the same zeroing, just retargetable as
   the filter moves which section is actually on top. */
.chips + section .cat, .cat-top .cat{padding-top:0}
/* Only ever un-hidden client-side (see the inline script) -- same reasoning as .hours-badge: a
   status baked in at render time could go stale on this page's 60s shared cache. */
.cat-note{margin-left:2px;font-size:10px;font-weight:400;letter-spacing:.04em;
  text-transform:none;color:var(--dim);white-space:nowrap}
.list{padding:0 18px 8px;display:flex;flex-direction:column;gap:12px}
/* Dimmed, not hidden and not pointer-events:none -- a diner who ate a breakfast item before the
   section closed can still open it and rate it later. This is a display-only cue, same asymmetry
   as the sold-out toggle: what a diner sees now and what feedback the API accepts are not the
   same question. */
.cat-paused .list{opacity:.5}
.item{border-radius:12px;border:1px solid var(--border);background:var(--card);overflow:hidden;
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
/* Promo/spice/diet's own row -- below the title, above the description, so a long name never has
   to fight a pill for the same 23px line. Each pill still carries its own margin-left (shared with
   the sold-out badge's spacing in .line), so :first-child resets it here rather than that being
   duplicated per pill class. */
.badges{margin-top:6px;padding:4px 0;display:flex;flex-wrap:wrap;align-items:center}
.badges>:first-child{margin-left:0}
.line2{margin-top:7px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.desc{font-size:14px;line-height:1.5;color:var(--muted);text-wrap:pretty}
.caret{display:flex;color:var(--dim);transition:transform .22s var(--ease)}
.item[open] .caret{transform:rotate(180deg)}
.out{margin-left:10px;padding:6px 12px;border-radius:999px;border:1px solid var(--border-strong);
  font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);
  white-space:nowrap;vertical-align:middle}
.spice{margin-left:8px;display:inline-flex;align-items:center;gap:1px;color:var(--accent);vertical-align:middle}
.diet-badge{margin-left:8px;padding:3px 8px;border-radius:999px;
  border:1px solid var(--card-open-border);color:var(--lit);font-size:9px;letter-spacing:.16em;
  text-transform:uppercase;white-space:nowrap;vertical-align:middle}
/* The one badge with marketing weight, so it gets the CTA's own solid-ink-pill treatment instead
   of the outline the other badges use -- same three tokens the footer buttons use (bg/ink/arrow),
   so it inherits their light/dark behaviour for free: solid ink pill by day, outlined brass pill
   by night. When it is also standing in for hidden pills, the count lives inside this one pill
   ("Popular · +1") rather than a second pill beside it -- see .more-badge below for the case
   where nothing led with a promo to merge into. */
.promo-badge{margin-left:8px;padding:4px 9px;border-radius:999px;border:1px solid var(--cta-border);
  background:var(--cta-bg);color:var(--cta-ink);font-size:9px;letter-spacing:.16em;
  text-transform:uppercase;white-space:nowrap;vertical-align:middle}
.promo-badge .badge-sep{margin:0 3px;opacity:.5}
.promo-badge .badge-more{color:var(--cta-arrow)}
/* The overflow count in the row (muted, not the lit/accent look of the pills it stands in for --
   it isn't itself a claim about the dish) and the pills it expands to, under the description. */
.more-badge{margin-left:8px;padding:3px 8px;border-radius:999px;border:1px solid var(--border-strong);
  color:var(--dim);font-size:9px;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;
  vertical-align:middle}
.more-pills{margin:0 0 14px}
.more-pills>:first-child{margin-left:0}
/* Only ever rendered when the admin ticked at least one box -- see renderItem. Sits above the
   rating prompt so a diner reads it before deciding whether to rate, not after. */
.allergens{margin:0 0 16px;font-size:12px;line-height:1.5;color:var(--dim)}
.panel{padding:0 20px 20px}
.rule{height:1px;background:var(--hair);margin-bottom:18px}
.rate{padding:18px;border-radius:9px;background:var(--panel);border:1px solid var(--hair)}
.rate-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lbl{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--dim)}
.opt{letter-spacing:.08em;text-transform:none;opacity:.75}
.word{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
/* 44px minimum tap target, per the accessibility floor in the plan. These are tapped one-handed,
   by someone holding a fork. */
.faces{display:flex;gap:6px;margin-top:12px}
.face{width:46px;height:46px;border-radius:7px;display:flex;align-items:center;
  justify-content:center;font-size:24px;line-height:1;border:0;padding:0;background:none;
  color:var(--unlit);cursor:pointer;-webkit-tap-highlight-color:transparent;
  transition:color .18s var(--ease),background .18s var(--ease),transform .14s var(--ease)}
.face:active{transform:scale(.92)}
.face[aria-pressed="true"]{color:var(--lit);background:var(--lit-bg)}
.rule2{margin:14px 0;height:1px;background:var(--hair)}
.note{width:100%;margin-top:10px;padding:13px 14px;border-radius:7px;
  border:1px solid var(--border-strong);background:var(--raised);color:var(--text);font:inherit;
  font-size:16px;font-weight:300;outline:none}
.note::placeholder{color:var(--dim)}
.confirm-wrap>div{overflow:hidden}
.confirm-btn{width:100%;margin-top:14px;height:44px;border-radius:999px;
  border:1px solid var(--cta-border);background:var(--cta-bg);color:var(--cta-ink);font:inherit;
  font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.confirm-btn.sent{background:var(--lit-bg);color:var(--lit);border-color:var(--card-open-border)}
footer{position:fixed;left:0;right:0;bottom:0;z-index:7;padding:16px 18px 26px;
  background:var(--fade);pointer-events:none}
/* --fade's solid-by-16px stop is matched to this padding-top on purpose: the buttons must sit on
   fully opaque backdrop from their first pixel, not partway through a gradient still ramping up --
   that's what read as "transparent" before. */
/* All three footer actions are equal-weight CTAs -- Call waiter and Request bill get exactly as
   much visual weight as Rate us, not a bold pill plus two quiet ones. Both service actions are
   also reachable from the burger sheet below (same data-kind, same handlers) as a second, quieter
   path -- not a replacement: burying them there alone would make "Request bill" undiscoverable on
   first visit. */
.cta-row{pointer-events:auto;display:flex;gap:8px}
.cta-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:5px;height:60px;border-radius:11px;border:1px solid var(--cta-border);
  background:var(--cta-bg);color:var(--cta-ink);font:inherit;font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.cta-btn svg{color:var(--cta-arrow)}
.cta-star{font-size:15px;line-height:1;color:var(--cta-arrow)}
/* Covers both the footer pill and the sheet row below -- one request can be triggered from
   either place, and both must grey out together while it's cooling down or sending. */
[data-kind][disabled]{opacity:.55;cursor:default;pointer-events:none}
.overlay{position:fixed;inset:0;z-index:20;background:var(--bg);padding:26px 18px 34px;
  display:flex;flex-direction:column;justify-content:center;overflow-y:auto}
.overlay h2{margin:0;font-family:var(--serif);font-size:34px;font-weight:500;line-height:1.15;
  color:var(--heading);text-wrap:pretty}
.overlay p{margin:12px 0 26px;font-size:14px;line-height:1.6;color:var(--muted)}
.overlay .faces{justify-content:space-between;gap:4px;margin-top:14px}
.overlay .face{width:56px;height:56px;font-size:30px}
.field{width:100%;margin-top:16px;padding:14px 16px;border-radius:9px;
  border:1px solid var(--border-strong);background:var(--raised);color:var(--text);font:inherit;
  font-size:16px;font-weight:300;outline:none}
.field::placeholder{color:var(--dim)}
textarea.field{resize:vertical;min-height:96px;font-family:inherit}
.purpose{margin:9px 0 0;font-size:11.5px;line-height:1.5;color:var(--dim)}
.btn{display:flex;width:100%;margin-top:20px;height:56px;align-items:center;
  justify-content:center;border-radius:999px;border:1px solid var(--cta-border);
  background:var(--cta-bg);color:var(--cta-ink);font:inherit;font-size:12px;letter-spacing:.22em;
  text-transform:uppercase;cursor:pointer;text-decoration:none}
.btn[disabled]{opacity:.4;cursor:not-allowed}
.btn-ghost{background:none;border-color:var(--border);color:var(--dim)}
.btn-quiet{display:inline-block;margin-top:18px;font-size:11px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--muted);text-decoration:underline;text-underline-offset:4px}
.close{position:absolute;top:18px;right:18px;width:38px;height:38px;border-radius:50%;
  border:1px solid var(--border);background:none;color:var(--dim);font:inherit;font-size:15px;
  cursor:pointer}
.empty{padding:36px 18px;color:var(--dim);font-size:14px}

/* The burger sheet and the info modal both reuse .overlay -- see the block below it in the
   markup for why a second full-screen pattern was not worth building for two menu rows.
   Rows are grouped into cards (design canvas: More Menu.dc.html, variant 1A) rather than one
   flat list -- table actions get their own group ahead of restaurant info, since they are what a
   diner mid-meal is most likely to want. Every color here is an existing token: the accent icon
   reuses --lit/--lit-bg, the same "this is lit up" pair the hours badge and active chip already
   use, rather than a new one-off color. */
.sheet-group{margin-top:22px}
.sheet-group:first-of-type{margin-top:18px}
.sheet-group-label{margin:0;padding:0 2px 10px;font-size:9.5px;font-weight:400;
  letter-spacing:.3em;text-transform:uppercase;color:var(--dim)}
.sheet-card{border:1px solid var(--border);border-radius:14px;background:var(--card);
  overflow:hidden}
.sheet-divider{height:1px;margin:0 16px 0 65px;background:var(--hair)}
.sheet-row{width:100%;border:0;background:none;display:flex;align-items:center;gap:13px;
  padding:14px;font:inherit;color:var(--text);text-align:left;cursor:pointer;
  -webkit-tap-highlight-color:transparent;transition:background .15s var(--ease)}
.sheet-row:active{background:var(--panel)}
.sheet-row-icon{flex:none;width:36px;height:36px;border-radius:10px;display:flex;
  align-items:center;justify-content:center;background:var(--panel);color:var(--dim)}
.sheet-row-icon--accent{background:var(--lit-bg);color:var(--lit)}
.sheet-row-text{flex:1;min-width:0;display:flex;flex-direction:column}
.sheet-row-title{font-size:15px}
.sheet-row-subtitle{margin-top:2px;font-size:11.5px;color:var(--muted)}
/* Overrides .hours-badge's own margin -- see the sheet's Hours & Address row below, which is
   the one subtitle that isn't static copy and reuses that class (and applyBadge()) verbatim. */
.sheet-row-subtitle.hours-badge{margin-top:2px}
.chev{color:var(--dim);font-size:14px}
.copied{margin-top:14px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--lit)}

.hours-table{margin-top:16px;display:flex;flex-direction:column}
.hours-row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;
  border-bottom:1px solid var(--hair);font-size:13px;color:var(--muted)}
.hours-row:last-child{border-bottom:0}
.hours-row.today{color:var(--heading);font-weight:400}
.hours-row .day{text-transform:uppercase;letter-spacing:.08em;font-size:10.5px}
.map-link{display:block;margin-top:16px;font-size:13.5px;line-height:1.5;color:var(--accent);
  text-decoration:underline;text-underline-offset:3px}
.closed-note{margin-top:14px;padding:12px 14px;border-radius:7px;background:var(--panel);
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
   chip filter below could never fade a section out again. */
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

/* Chip + search filter. Non-matches fade out, matches appear instantly: results that snap in read
   as fast, results that snap out read as broken. The section fades with its dishes rather than
   vanishing out from under them mid-fade. */
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

/* Same 0fr->1fr morph as the contact field above, for the button that confirms a dish rating.
   Hidden until the first tap on a star gives it something to confirm. */
.confirm-wrap{display:grid;grid-template-rows:1fr;
  transition:grid-template-rows .32s var(--ease),opacity .24s var(--ease),
    display .32s allow-discrete}
.confirm-wrap[hidden]{display:none;grid-template-rows:0fr;opacity:0}
@starting-style{.confirm-wrap:not([hidden]){grid-template-rows:0fr;opacity:0}}
.confirm-btn.pop{animation:pop .34s var(--ease)}

.list{transition:opacity .3s var(--ease)}

/* Touch feedback. */
.search,.note,.field{transition:border-color .2s var(--ease),box-shadow .2s var(--ease)}
.search:focus,.note:focus,.field:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--lit-bg)}
.row{-webkit-tap-highlight-color:transparent;transition:background .18s var(--ease)}
.item:not([open]) .row:active{background:var(--panel)}
.cta-btn,.btn,.confirm-btn{transition:transform .16s var(--ease),opacity .2s var(--ease),
  background .2s var(--ease),border-color .2s var(--ease),color .2s var(--ease)}
.cta-btn:active,.btn:not([disabled]):active,.confirm-btn:active{transform:scale(.975)}
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

// Line icons, inline rather than an icon font or library -- three glyphs don't earn a dependency
// on a page with a 14KB wire budget, and `currentColor` lets them pick up the ink/brass theming
// for free. Rate us reuses the ★ glyph the rating stars already use above, rather than a fourth
// icon, so the CTA row and the rating controls read as one language.
const ICON_SEARCH =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
const ICON_BELL =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 4.2 1.4 5.8 2 6.5H4c.6-.7 2-2.3 2-6.5Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/></svg>';
const ICON_RECEIPT =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>';
// Theme toggle. The button shows the CURRENT mode's glyph (sun while light, moon while dark) --
// both strings ride along into the inline script below, since the correct one depends on system
// preference and localStorage, neither of which exist at render time. See the script for why.
const ICON_SUN =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
const ICON_MOON =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>';
// A drawn chevron rather than the ⌄ glyph it replaces: every font renders that character at a
// different weight and optical center, so it never quite matched the rest of these icons. This one
// does, and .caret below is what actually flips it on open/close -- the path itself never changes.
const ICON_CHEVRON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
// Spice level, drawn rather than the 🌶️ emoji it replaces -- same reasoning as ICON_CHEVRON:
// a flat, single-color glyph that takes the theme's ink instead of each platform's own emoji art.
const ICON_FLAME =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/></svg>';
// The burger sheet's own row icons -- same 24x24/currentColor language as the set above, just three
// more glyphs for the three rows that had none (Hours & Address, Share Menu, Suggestions). Call
// waiter/Request bill reuse ICON_BELL/ICON_RECEIPT rather than drawing a second copy.
const ICON_CLOCK =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/></svg>';
const ICON_SHARE =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>';
const ICON_BULB =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M7 9a5 5 0 1 1 8.5 3.5c-.9.9-1.5 1.7-1.5 3.5h-6c0-1.8-.6-2.6-1.5-3.5A5 5 0 0 1 7 9Z"/></svg>';

// `i` arrives free from Array#map. It only feeds the entrance stagger, capped because past the
// eighth dish nobody is watching the load animation any more.
function renderItem(item, i) {
  const stagger = `--i:${Math.min(i || 0, 8)}`;
  const price = formatCents(item.price_cents);
  // Name and description both feed the search box -- someone hunting "peri" should find the dish
  // whose description mentions it, not only the ones with it in the title.
  const haystack = esc(`${item.name} ${item.description || ''}`.toLowerCase());

  const dietLabel = item.diet === 'vegan' ? 'Vegan' : item.diet === 'vegetarian' ? 'Vegetarian' : '';
  const promoLabel = PROMO_LABEL_TEXT[item.promo_label] || '';

  // Spice is never collapsed -- it sits right next to the badge always, since it's closer to a
  // safety cue than marketing. Promo and diet are the two that can crowd the row, so only those
  // two collapse into one "+N" pill and reappear in full, under the description, once the card
  // opens. Only worth doing when there IS a tap: a sold-out item is a flat row with no panel to
  // reveal them in, so its badges never collapse.
  const spicePill = item.spice_level ? `<span class="spice">${ICON_FLAME.repeat(item.spice_level)}</span>` : '';
  const badges = [
    promoLabel && `<span class="promo-badge">${esc(promoLabel)}</span>`,
    dietLabel && `<span class="diet-badge">${dietLabel}</span>`,
  ].filter(Boolean);
  const collapse = item.available && badges.length > 1;
  const hiddenPills = collapse ? badges.slice(1) : [];

  // Promo is always first in `badges` when it exists, so it is always the one left standing once
  // diet collapses -- the overflow count merges straight into it ("Popular · +1") rather than
  // sitting in a second .more-badge pill next to it. Diet with no promo to merge into still gets
  // the plain pill + separate count pill (impossible today with just these two, but cheap to keep
  // correct if a third badge type joins them later).
  const badgeMarkup = !collapse
    ? badges.join('')
    : promoLabel
      ? `<span class="promo-badge">${esc(promoLabel)}<span class="badge-sep">·</span><span class="badge-more">+${hiddenPills.length}</span></span>`
      : `${badges[0]}<span class="more-badge">+${hiddenPills.length}</span>`;
  const shownBadges = badgeMarkup + spicePill;

  const row = `<span class="line">
      <span class="item-name">${esc(item.name)}</span>${item.available ? '' : '<span class="out">sold out</span>'}
      <span class="leader"></span>
      ${price ? `<span class="price">${esc(price)}</span>` : ''}
    </span>
    ${shownBadges ? `<span class="badges">${shownBadges}</span>` : ''}
    ${
      item.description || item.available
        ? `<span class="line2">
      <span class="desc">${esc(item.description || '')}</span>
      ${item.available ? `<span class="caret">${ICON_CHEVRON}</span>` : ''}
    </span>`
        : ''
    }`;

  // "Contains: ..." only when the admin has ticked something -- an empty list means "not
  // specified", never "verified allergen-free", so it renders nothing rather than a false all-clear.
  const allergenLine = item.allergens && item.allergens.length
    ? `<p class="allergens">Contains: ${item.allergens.map((a) => esc(ALLERGEN_LABELS[a] || a)).join(', ')}</p>`
    : '';

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
    ${hiddenPills.length ? `<div class="more-pills">${hiddenPills.join('')}</div>` : ''}
    ${allergenLine}
    <div class="rate">
      <div class="rate-head">
        <span class="lbl">Rate this dish</span>
        <span class="word">Tap to rate</span>
      </div>
      <div class="faces" data-item="${esc(item.id)}" role="group" aria-label="Rate ${esc(item.name)}">${scale()}</div>
      <div class="rule2"></div>
      <div class="lbl">Add a note <span class="opt">(optional)</span></div>
      <input class="note" type="text" placeholder="Tell the chef…" aria-label="Comment on ${esc(item.name)}">
      <div class="confirm-wrap" hidden><div>
        <button class="confirm-btn" type="button">Confirm</button>
      </div></div>
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
      (c, i) => `<section data-cat="${i}" data-hours="${esc(JSON.stringify(c.hours || null))}">
  <h2 class="cat">${esc(c.name)}<span class="cat-note" hidden></span></h2>
  <div class="list">${c.items.map(renderItem).join('')}</div>
</section>`
    )
    .join('');

  // One category needs no filter -- the rail would read "All | Mains" and cost a row of the first
  // screen to say nothing. Two or more and it earns the space. The search field rides in the same
  // rail rather than sitting above it: collapsed it costs 44px that the chips needed anyway, and
  // expanded it takes the row over rather than adding a second one.
  const hasFilters = cats.length > 1;
  const chips = hasFilters
    ? `<nav class="chips" id="chips" aria-label="Filter by category">
    <button class="chip chip-search" type="button" id="search-toggle" aria-expanded="false"
            aria-controls="search-wrap" aria-label="Search the menu">${ICON_SEARCH}</button>
    <div class="search-wrap" id="search-wrap">
      <input class="search" id="q" type="search" placeholder="Wings, ribs, pap…" aria-label="Search the menu">
      <button class="search-x" type="button" id="search-clear" aria-label="Clear search" hidden>✕</button>
    </div>
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
<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body data-slug="${esc(restaurant.slug)}"
      data-hours="${esc(JSON.stringify(restaurant.hours || null))}"
      data-closed-note="${esc(restaurant.closed_note || '')}"
      ${serviceEnabled ? 'data-service' : ''}>
<header>
  <div class="head-row">
    <h1>${esc(restaurant.name)}</h1>
    <div class="head-actions">
      <button class="theme-toggle" type="button" id="theme-toggle" aria-label="Switch theme">${ICON_MOON}</button>
      <button class="burger" type="button" id="open-sheet" aria-label="More options" aria-haspopup="true">☰</button>
    </div>
  </div>
  <p class="sub">Menu</p>
</header>
${chips}
${sections || '<p class="empty">This menu is being set up.</p>'}
${hasFilters ? '<p class="empty" id="no-hits" hidden>Nothing on the menu matches that.</p>' : ''}

<footer>
  <div class="cta-row">
    ${
      serviceEnabled
        ? `<button class="cta-btn" type="button" data-kind="waiter">${ICON_BELL}<span class="label">Call waiter</span></button>
    <button class="cta-btn" type="button" data-kind="bill">${ICON_RECEIPT}<span class="label">Request bill</span></button>`
        : ''
    }
    <button class="cta-btn" type="button" id="open-visit"><span class="cta-star" aria-hidden="true">★</span><span class="label">Rate us</span></button>
  </div>
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
    ${
      serviceEnabled
        ? `<section class="sheet-group" aria-labelledby="sheet-g-table">
      <h3 class="sheet-group-label" id="sheet-g-table">At your table</h3>
      <div class="sheet-card">
        <button class="sheet-row" type="button" data-kind="waiter">
          <span class="sheet-row-icon sheet-row-icon--accent">${ICON_BELL}</span>
          <span class="sheet-row-text"><span class="sheet-row-title label">Call waiter</span><span class="sheet-row-subtitle">Someone comes to your table</span></span>
          <span class="chev">›</span>
        </button>
        <div class="sheet-divider"></div>
        <button class="sheet-row" type="button" data-kind="bill">
          <span class="sheet-row-icon sheet-row-icon--accent">${ICON_RECEIPT}</span>
          <span class="sheet-row-text"><span class="sheet-row-title label">Request bill</span><span class="sheet-row-subtitle">Card, cash or split</span></span>
          <span class="chev">›</span>
        </button>
      </div>
    </section>`
        : ''
    }
    <section class="sheet-group" aria-labelledby="sheet-g-restaurant">
      <h3 class="sheet-group-label" id="sheet-g-restaurant">The restaurant</h3>
      <div class="sheet-card">
        ${
          hasInfo
            ? `<button class="sheet-row" type="button" id="open-info">
          <span class="sheet-row-icon">${ICON_CLOCK}</span>
          <span class="sheet-row-text"><span class="sheet-row-title">Hours &amp; Address</span><span class="sheet-row-subtitle hours-badge" id="sheet-hours-badge" hidden></span></span>
          <span class="chev">›</span>
        </button>
        <div class="sheet-divider"></div>`
            : ''
        }
        <button class="sheet-row" type="button" id="share-menu">
          <span class="sheet-row-icon">${ICON_SHARE}</span>
          <span class="sheet-row-text"><span class="sheet-row-title">Share Menu</span><span class="sheet-row-subtitle">Send the menu link to someone</span></span>
          <span class="chev">›</span>
        </button>
        <div class="sheet-divider"></div>
        <button class="sheet-row" type="button" id="open-suggest">
          <span class="sheet-row-icon">${ICON_BULB}</span>
          <span class="sheet-row-text"><span class="sheet-row-title">Suggestions</span><span class="sheet-row-subtitle">Goes straight to the owner</span></span>
          <span class="chev">›</span>
        </button>
      </div>
    </section>
    <p class="copied" id="share-copied" hidden>Link copied</p>
  </div>
</div>

<div class="overlay" id="suggest" hidden role="dialog" aria-modal="true" aria-labelledby="suggest-h">
  <button class="close" type="button" id="close-suggest" aria-label="Close">✕</button>
  <div>
    <h2 id="suggest-h">Got an idea?</h2>
    <p id="suggest-body">Menu suggestions, service ideas, anything — straight to the owner.</p>
    <textarea class="field" id="suggest-input" rows="4" placeholder="Tell us what you'd change"
              aria-label="Your suggestion"></textarea>
    <button class="btn" type="button" id="suggest-send" disabled>Send</button>
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

  // The star tap itself still saves the rating alone, optimistically -- a diner who rates two
  // dishes and then closes the tab still gave us two ratings, which on a restaurant table is the
  // normal case, not the edge. The Confirm button that morphs in below is what saves a note: an
  // input with no visible "done" action is easy to type into and never actually submit.
  document.querySelectorAll('.faces[data-item]').forEach(function(group){
    var rate = group.closest('.rate');
    var note = rate.querySelector('.note');
    var confirmWrap = rate.querySelector('.confirm-wrap');
    var confirmBtn = rate.querySelector('.confirm-btn');

    group.addEventListener('click', function(e){
      var btn = e.target.closest('.face');
      if(!btn) return;
      var rating = Number(btn.dataset.r);
      select(group, rating);          // optimistic: the tap reads as instant on bad signal
      post('/item-rating', { itemId: group.dataset.item, rating: rating });
      confirmWrap.hidden = false;     // morphs in -- there is now something to confirm
    });

    confirmBtn.addEventListener('click', function(){
      confirmBtn.disabled = true;
      post('/item-rating', {
        itemId: group.dataset.item,
        rating: Number(group.dataset.rating),
        comment: note.value
      }).catch(function(){}).then(function(){
        confirmBtn.textContent = 'Saved ✓';
        confirmBtn.classList.add('sent');
        replay(confirmBtn, 'pop');
      });
    });
  });

  // Menu search and category chips, client side. No request and no index -- the whole menu is
  // already in the document, and on restaurant wifi a round trip per keystroke would be the
  // slowest thing here. The whole block is skipped on a single-category menu, which ships no rail.
  //
  // One pass applies both filters, because they compose: the chip narrows to a category and the
  // search narrows within whatever the chip left standing. Two independent handlers each setting
  // hidden would fight over the same attribute and the last one to run would win.
  var rail = document.getElementById('chips');
  if(rail){
    var q = document.getElementById('q');
    var clearBtn = document.getElementById('search-clear');
    var toggle = document.getElementById('search-toggle');
    var noHits = document.getElementById('no-hits');
    var chips = rail.querySelectorAll('.chip[data-cat]');
    var cat = 'all';

    function apply(){
      var term = q.value.trim().toLowerCase();
      var hits = 0;
      var firstVisible = null;
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
        if(shown && !firstVisible) firstVisible = sec;
        hits += shown;
      });
      // The zero-top-padding treatment follows whichever section is actually topmost, not just
      // the one that happened to render first -- see .cat-top in the CSS above for why.
      document.querySelectorAll('section').forEach(function(sec){
        sec.classList.toggle('cat-top', sec === firstVisible);
      });
      // Only a real miss earns the message. A chip on its own always has dishes behind it, so
      // "nothing matches" would be a lie the moment someone taps Desserts.
      noHits.hidden = hits > 0 || (!term && cat === 'all');
      // The X is for clearing text, so it exists only once there is text to clear.
      clearBtn.hidden = !q.value;
    }

    q.addEventListener('input', apply);

    // Collapsing discards the term rather than keeping it filtering invisibly -- a menu still
    // filtered by a search box the diner can no longer see reads as a broken menu.
    toggle.addEventListener('click', function(){
      var open = rail.toggleAttribute('data-searching');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if(open) return q.focus();
      q.value = '';
      q.blur();
      apply();
    });

    clearBtn.addEventListener('click', function(){
      q.value = '';
      apply();
      q.focus();   // clearing is mid-typing, so the keyboard should stay up
    });

    chips.forEach(function(chip){
      chip.addEventListener('click', function(){
        cat = chip.dataset.cat;
        chips.forEach(function(c){ c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        apply();
        // Tapping Desserts from halfway down the mains is a request to see desserts, not to stay
        // at the same offset in a page that just got shorter. No behavior option, so CSS
        // scroll-behavior stays in charge and prefers-reduced-motion still wins.
        window.scrollTo({ top: 0 });
      });
    });
  }

  // Burger sheet, info modal, and the open/closed badge. status() is lib/hours.js's own function,
  // inlined here via toString() so there is exactly one implementation of the open/closed math --
  // see that file's header for why it has to run on the client rather than at render time.
  var hours = JSON.parse(document.body.dataset.hours || 'null');
  var closedNote = document.body.dataset.closedNote;

  ${status.toString()}

  // One status() call feeds the modal badge and the "today" row highlight, so the two can never
  // disagree about what moment they are describing. closedNote suppresses the badge entirely --
  // a confident "Open now" on a day the owner has flagged as an exception is worse than showing
  // nothing.
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

  // Section hours -- same status() call, run again per section against that section's own
  // schedule. Sections render in their normal state by default (see renderPage) so there is no
  // flash of "unavailable" for the common case of a section that IS in its window right now; this
  // only ever downgrades a section, never the reverse.
  document.querySelectorAll('section[data-hours]').forEach(function(sec){
    var secHours = JSON.parse(sec.dataset.hours || 'null');
    if(!secHours) return;
    var st = status(secHours, new Date());
    if(st.state === 'closed'){
      sec.classList.add('cat-paused');
      var note = sec.querySelector('.cat-note');
      note.textContent = st.until ? ('· Available from ' + st.until) : '· Not available right now';
      note.hidden = false;
    }
  });

  var sheet = document.getElementById('sheet');
  var info = document.getElementById('info');

  if(info){
    applyBadge(document.getElementById('info-badge'));
    applyBadge(document.getElementById('sheet-hours-badge'));
    if(hoursStatus){
      var todayRow = info.querySelector('.hours-row[data-day="' + hoursStatus.day + '"]');
      if(todayRow) todayRow.classList.add('today');
    }
  }

  document.getElementById('open-sheet').onclick = function(){ sheet.hidden = false; };
  document.getElementById('close-sheet').onclick = function(){ sheet.hidden = true; };

  // Theme toggle. The head script (see <head> above) already applied any stored choice before
  // first paint, so this only has to keep the icon in sync and handle the click -- it never has to
  // fix a flash. No stored choice means "follow the system", same as before this feature existed.
  (function(){
    var ICON_SUN = ${JSON.stringify(ICON_SUN)};
    var ICON_MOON = ${JSON.stringify(ICON_MOON)};
    var root = document.documentElement;
    var btn = document.getElementById('theme-toggle');
    var media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

    function current(){
      var stored = root.dataset.theme;
      if(stored === 'light' || stored === 'dark') return stored;
      return media && media.matches ? 'dark' : 'light';
    }
    function paint(){
      var mode = current();
      btn.innerHTML = mode === 'dark' ? ICON_SUN : ICON_MOON;
      btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }

    btn.onclick = function(){
      var next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch(e){}
      paint();
    };
    paint();
  })();

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

  // Suggestions. Deliberately no star rating -- see /api/public/:slug/suggestion, which is the
  // one place a comment can land on a visit row without one. The modal thanks inline and closes
  // itself rather than routing through #thanks, which is tuned for a visit rating (Google review
  // CTA and all) and has nothing to say about a menu idea.
  (function(){
    var suggest = document.getElementById('suggest');
    var input = document.getElementById('suggest-input');
    var send = document.getElementById('suggest-send');
    var title = document.getElementById('suggest-h');
    var body = document.getElementById('suggest-body');
    var titleText = title.textContent;
    var bodyText = body.textContent;
    var busy = false;

    document.getElementById('open-suggest').onclick = function(){
      sheet.hidden = true;
      suggest.hidden = false;
    };
    document.getElementById('close-suggest').onclick = function(){ suggest.hidden = true; };

    input.addEventListener('input', function(){ send.disabled = !input.value.trim(); });

    send.onclick = function(){
      var comment = input.value.trim();
      if(!comment || busy) return;
      busy = true;
      send.disabled = true;
      post('/suggestion', { comment: comment }).catch(function(){}).then(function(){
        busy = false;
        input.hidden = true;
        send.hidden = true;
        title.textContent = 'Thanks — that’s been passed on.';
        body.textContent = 'The owner will see it next time they check in.';
        setTimeout(function(){
          suggest.hidden = true;
          input.hidden = false;
          send.hidden = false;
          input.value = '';
          send.disabled = true;
          title.textContent = titleText;
          body.textContent = bodyText;
        }, 1600);
      });
    };
  })();

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
