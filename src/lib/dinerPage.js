const { formatCents, parsePrice } = require('./money');
const { DAYS, status, CLOSING_SOON_MINS } = require('./hours');
const { parseReceipt, settle, binarize } = require('./splitBill');
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
/* Thin overlay-ish bar instead of the OS default chrome -- only ever visible on desktop and
   in the owner's Settings preview frame, where the fat native bar sat inside the phone. */
html{scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:var(--unlit) transparent}
[hidden]{display:none}
body{margin:0;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;
  font-family:var(--sans);font-weight:300;padding-bottom:112px}
/* Extra footer height for the service-request row -- only paid by restaurants that have it on. */
body[data-service]{padding-bottom:188px}
header{position:sticky;top:0;z-index:6;background:var(--header-bg);
  -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);
  border-bottom:1px solid var(--hair);padding:18px 18px 16px}
/* center, not baseline: the right-hand item used to be .burger alone, whose text glyph gave the
   row a real baseline to align to. It is now .head-actions, an icon-only flex group with no text
   -- flex's baseline forwarding would synthesize one from an SVG's box edge instead, which does
   not land in the same place. Center is the reference point icons and a heading actually share. */
.head-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
/* Groups the logo and name as one flex item, same reason .head-actions groups the theme toggle
   and burger -- .head-row's space-between only has two things to spread apart, not three. */
.head-id{display:flex;align-items:center;gap:10px;min-width:0}
.head-text{display:flex;flex-direction:column;min-width:0}
/* Fixed footprint regardless of the uploaded file's own pixel size -- there is no server-side
   resizing (src/lib/logo.js only validates bytes and format), so the display size has to be the
   thing holding the line. contain, not cover: cover crops a non-square logo (a wordmark, anything
   not 1:1) to fill the box, which reads as the logo being cut off. */
/* Fixed dark chip, not var(--panel) -- panel flips to a light cream in light mode, which a white
   or light-colored uploaded logo (the common case) would disappear against. */
.logo{flex:0 0 auto;width:32px;height:32px;border-radius:8px;object-fit:contain;background:#1a1815}
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
.sub{margin:2px 0 0;font-size:10px;letter-spacing:.34em;text-transform:uppercase;
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
/* Sizes get a line of their own under the title, never a second price inside .line -- two prices
   with the leader dots stretched between them has nowhere left to wrap on a 360px phone. */
.sizes{margin-top:8px;display:flex;flex-wrap:wrap;gap:3px 16px;font-size:13px}
.size{display:inline-flex;align-items:baseline}
.size-label{color:var(--muted);letter-spacing:.02em}
.size-price{margin-left:7px;color:var(--accent);white-space:nowrap;font-variant-numeric:tabular-nums}
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
/* Extras live in the opened panel, not on the price row like .sizes: a size IS the dish's price,
   an add-on is a choice the diner only cares about once they are already reading the dish. Two
   columns rather than .sizes' inline flow -- the prices line up down the right, which is what
   makes six of them scannable instead of a wall of words. */
.addons{margin:0 0 16px}
.addons-head{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);
  margin-bottom:7px}
.addon{display:flex;align-items:baseline;gap:10px;font-size:13px;line-height:1.9}
.addon-label{color:var(--muted);letter-spacing:.02em}
.addon-dots{flex:1;border-bottom:1px dotted var(--dots);transform:translateY(-4px)}
.addon-price{color:var(--accent);white-space:nowrap;font-variant-numeric:tabular-nums}
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
.cta-row{pointer-events:auto;display:flex;gap:8px;align-items:flex-start}
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
.close{position:absolute;top:18px;right:18px;z-index:4;width:38px;height:38px;border-radius:50%;
  border:1px solid var(--border);background:none;color:var(--dim);font:inherit;font-size:15px;
  cursor:pointer}
.empty{padding:36px 18px;color:var(--dim);font-size:14px}
.powered-by{margin:0;padding:22px 18px 8px;text-align:center;font-size:9px;letter-spacing:.08em;
  color:var(--dim)}
.powered-by a{color:inherit;text-decoration:none}

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

/* --- Split the bill ------------------------------------------------------------------------
   One overlay, four panes, reusing .overlay/.field/.btn/.copied wholesale. The only genuinely
   new shapes are the editable item row and the person chip; everything else is an existing
   token. Unlike the other overlays this one can run taller than the screen (a fifteen-line bill
   with four people), so it anchors to the top and scrolls rather than centring. */
#split{justify-content:flex-start}
#split h2{font-size:27px}
#split>div{padding-bottom:8px}
.sp-note{margin:14px 0 0;font-size:12px;line-height:1.5;color:var(--dim)}
.sp-label{display:block;margin:22px 0 0;font-size:9.5px;letter-spacing:.3em;
  text-transform:uppercase;color:var(--dim)}
.sp-warn{margin:14px 0 0;padding:11px 13px;border-radius:8px;background:var(--lit-bg);
  color:var(--lit);font-size:12.5px;line-height:1.5}
.sp-warn button{display:block;margin-top:7px;border:0;background:none;padding:0;font:inherit;font-size:12.5px;
  color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}

/* Item rows. Name and price are inputs from the first render rather than text that turns into an
   input on tap: every one of these is an OCR guess, and making the correction gesture "tap the
   thing and type" costs a row of chrome that a two-tap edit affordance would cost anyway. */
.sp-list{margin-top:6px;border:1px solid var(--border);border-radius:12px;background:var(--card);
  overflow:hidden}
.sp-row{display:flex;align-items:center;gap:8px;padding:9px 10px 9px 13px;
  border-bottom:1px solid var(--hair)}
.sp-row:last-child{border-bottom:0}
.sp-row input{min-width:0;border:0;background:none;color:var(--text);font:inherit;font-size:14px;
  padding:5px 0;outline:none}
.sp-row input:focus{border-bottom:1px solid var(--accent)}
.sp-row .sp-name{flex:1}
.sp-row .sp-price{width:82px;text-align:right;font-variant-numeric:tabular-nums}
.sp-del{flex:none;width:28px;height:28px;border:0;border-radius:7px;background:none;
  color:var(--dim);font:inherit;font-size:15px;line-height:1;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.sp-del:active{background:var(--panel)}
.sp-add{width:100%;margin-top:10px;padding:12px;border:1px dashed var(--border-strong);
  border-radius:10px;background:none;color:var(--dim);font:inherit;font-size:12.5px;cursor:pointer}
.sp-empty{padding:20px 13px;color:var(--dim);font-size:13px}

/* Party size. A stepper, not a number input -- one thumb, no keyboard, and it cannot be handed
   a party of 0 or 900 in the first place. */
.sp-stepper{display:flex;align-items:center;gap:12px;margin-top:20px}
.sp-stepper .sp-label{flex:1;margin:0}
.sp-step-btn{width:38px;height:38px;border-radius:50%;border:1px solid var(--border-strong);
  background:var(--raised);color:var(--text);font:inherit;font-size:18px;line-height:1;
  cursor:pointer;-webkit-tap-highlight-color:transparent}
.sp-step-btn[disabled]{opacity:.35;cursor:default}
.sp-count{min-width:24px;text-align:center;font-size:19px;color:var(--heading);
  font-variant-numeric:tabular-nums}
.sp-names{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sp-names input{width:calc(50% - 4px);padding:10px 12px;border-radius:8px;
  border:1px solid var(--border);background:var(--raised);color:var(--text);font:inherit;
  font-size:13.5px;outline:none}

/* Who had what, and the tip percentages, are the same control: a row of toggles where the lit
   state is the existing --lit/--lit-bg pair the hours badge and active chip already use. */
.sp-assign{margin-top:18px}
.sp-item{padding:13px 0;border-bottom:1px solid var(--hair)}
.sp-item:last-child{border-bottom:0}
.sp-item-head{display:flex;justify-content:space-between;gap:12px;font-size:13.5px;
  color:var(--text)}
.sp-item-head .sp-amt{color:var(--muted);font-variant-numeric:tabular-nums}
.sp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.sp-chip{padding:7px 13px;border-radius:999px;border:1px solid var(--border);
  background:var(--raised);color:var(--muted);font:inherit;font-size:12px;cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  transition:background .16s var(--ease),color .16s var(--ease),border-color .16s var(--ease)}
.sp-chip[aria-pressed="true"]{background:var(--lit-bg);color:var(--lit);border-color:var(--lit)}

.sp-tabs{display:flex;gap:6px;margin-top:8px}
.sp-tab{flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);
  background:var(--raised);color:var(--muted);font:inherit;font-size:12px;letter-spacing:.1em;
  text-transform:uppercase;cursor:pointer}
.sp-tab[aria-pressed="true"]{background:var(--lit-bg);color:var(--lit);border-color:var(--lit)}
.sp-pcts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}

/* The answer. Bigger type than anything else in the overlay -- this is the one line each person
   at the table actually reads, usually upside down over someone's shoulder. */
.sp-lines{margin-top:22px;border-top:1px solid var(--hair)}
.sp-line{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:13px 0;
  border-bottom:1px solid var(--hair)}
.sp-line .sp-who{font-size:15px;color:var(--heading)}
.sp-line .sp-sub{display:block;margin-top:3px;font-size:11px;color:var(--dim)}
.sp-line .sp-owes{font-size:19px;color:var(--heading);font-variant-numeric:tabular-nums;
  white-space:nowrap}
.sp-grand{display:flex;justify-content:space-between;padding:14px 0 0;font-size:12px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.sp-grand span{font-variant-numeric:tabular-nums}

.sp-nav{display:flex;gap:8px;margin-top:22px}
.sp-nav-btn{flex:1;height:52px;border-radius:999px;border:1px solid var(--border);background:none;
  color:var(--dim);font:inherit;font-size:12px;letter-spacing:.22em;text-transform:uppercase;
  cursor:pointer}
.sp-nav-next{border-color:var(--cta-border);background:var(--cta-bg);color:var(--cta-ink)}
.sp-nav-btn[disabled]{opacity:.4;cursor:not-allowed}
button.btn-quiet{width:100%;border:0;background:none;font:inherit;font-size:11px;
  letter-spacing:.2em;text-transform:uppercase;cursor:pointer}

/* --- The scanner (design canvas: Split the Bill Scan.dc.html) --------------------------------
   What used to be one line of text while Tesseract worked. A camera has just fired and the diner
   cannot tell whether anything is happening; this is the screen that says it is, and every number
   on it is real -- the phase is the stage the pipeline is in, the percentage is Tesseract's own
   progress, the count at the end is what parseReceipt() came back with.

   Nothing is copied from the canvas as a hex: it is light-only (terracotta on cream) and this page
   has a dark theme, so the beam, brackets and blinker all ride --lit, the same "lit up" accent the
   chips and hours badge already use. Lora and Inter are --serif and --sans; JetBrains Mono becomes
   the system mono stack, since one pane of telemetry does not justify a third webfont on
   restaurant wifi. Keyframes live here, not in the Motion section: seven names that mean nothing
   outside this pane, and a scanner is easier to delete whole. */
.sp-scan{position:fixed;inset:0;z-index:2;background:var(--bg);overflow:hidden;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sp-scan-grid{position:absolute;inset:0;background-size:26px 26px;
  background-image:linear-gradient(var(--hair) 1px,transparent 1px),
    linear-gradient(90deg,var(--hair) 1px,transparent 1px);
  animation:gridpan 2.6s linear infinite}
.sp-scan-top{position:absolute;top:26px;left:26px;right:26px;display:flex;align-items:center;
  justify-content:space-between;font-size:10px;letter-spacing:.14em;color:var(--muted)}
.sp-live{display:flex;align-items:center;gap:6px}
.sp-live i{width:5px;height:5px;border-radius:50%;background:var(--lit);
  animation:blink 1s steps(1,end) infinite}
/* max-* caps the frame on a phone shorter than the 844px canvas, where 88 + 400 would otherwise
   run under the progress bar. */
.sp-frame{position:absolute;top:88px;left:50%;transform:translateX(-50%);width:250px;height:400px;
  max-width:calc(100% - 52px);max-height:calc(100% - 220px)}
.sp-receipt{position:absolute;inset:0;padding:22px 20px;border-radius:6px;overflow:hidden;
  background:var(--raised);border:1px solid var(--border)}
/* Every bar on the paper is the same shimmering placeholder, as one selector rather than a class
   on fourteen elements -- markup is what this page pays for on every load. */
.sp-receipt i,.sp-receipt b{display:block;border-radius:5px;background-size:220% 100%;
  background-image:linear-gradient(90deg,var(--unlit) 0,var(--panel) 40%,var(--unlit) 80%);
  animation:shimmer 1.3s linear infinite}
.sp-sk-h{height:13px;width:118px;margin-bottom:8px}
.sp-sk-s{height:7px;width:72px;margin-bottom:18px}
.sp-sk-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;
  border-bottom:1px dashed var(--border)}
.sp-sk-row i,.sp-sk-row b{height:9px;opacity:.4;transition:opacity .4s var(--ease)}
/* Ragged line lengths, two rules rather than six: it needs to read as text, not as a table. */
.sp-sk-row i{width:86%}
.sp-sk-row:nth-child(even) i{width:64%}
.sp-sk-row b{width:34px;flex:none}
.sp-sk-row.on i,.sp-sk-row.on b{opacity:.95}
.sp-beam{position:absolute;left:0;right:0;height:56px;pointer-events:none;opacity:.8;
  background:linear-gradient(to bottom,transparent,var(--lit-bg) 55%,var(--lit) 82%,transparent 84%);
  box-shadow:0 0 26px var(--lit-bg);animation:beam 1.7s cubic-bezier(.45,0,.55,1) infinite}
.sp-br{position:absolute;width:30px;height:30px;border:2px solid var(--lit);
  animation:bracket 1.5s ease-in-out infinite}
.sp-br:nth-of-type(1){top:-9px;left:-9px;border-right:0;border-bottom:0}
.sp-br:nth-of-type(2){top:-9px;right:-9px;border-left:0;border-bottom:0;animation-delay:.2s}
.sp-br:nth-of-type(3){bottom:-9px;left:-9px;border-right:0;border-top:0;animation-delay:.4s}
.sp-br:nth-of-type(4){bottom:-9px;right:-9px;border-left:0;border-top:0;animation-delay:.6s}
.sp-motes{position:absolute;inset:0;pointer-events:none}
.sp-mote{position:absolute;font-size:9px;letter-spacing:.08em;color:var(--lit);
  animation:floatup 1.6s ease-out forwards}
.sp-scan-foot{position:absolute;left:26px;right:26px;bottom:44px}
.sp-scan-phase{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;
  font-size:11px;letter-spacing:.16em;color:var(--heading)}
.sp-scan-phase span+span{color:var(--muted);letter-spacing:0;font-variant-numeric:tabular-nums}
.sp-bar{height:2px;border-radius:2px;background:var(--unlit);overflow:hidden}
.sp-bar i{display:block;height:100%;width:0;background:var(--lit);transition:width .2s linear}
.sp-tele{margin-top:12px;font-size:9px;letter-spacing:.1em;color:var(--dim)}
/* The shutter. --raised over --bg is a paper-white blink in light and almost nothing in dark,
   which is the right amount of flash to fire at a table at night. */
.sp-flash{position:fixed;inset:0;z-index:3;background:var(--raised);pointer-events:none;
  animation:flash .4s ease-out forwards}
@keyframes beam{0%{top:-6%}100%{top:104%}}
@keyframes flash{0%{opacity:0}12%{opacity:.95}100%{opacity:0}}
@keyframes bracket{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes floatup{0%{opacity:0;transform:translateY(8px)}30%{opacity:.9}
  100%{opacity:0;transform:translateY(-26px)}}
@keyframes gridpan{to{background-position:0 26px}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
@keyframes shimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
/* Easily the busiest thing on this page. Under reduce it is the phase and the progress bar, which
   was the whole message anyway. */
@media (prefers-reduced-motion:reduce){
  .sp-scan-grid,.sp-beam{display:none}
  .sp-receipt i,.sp-receipt b,.sp-br,.sp-live i,.sp-flash{animation:none}
}

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
// a regex literal.
//
// It is no longer the smaller half, though, and that half of this note has stopped being true:
// the bill splitter and its receipt scanner took the script to ~19KB gzipped against this
// stylesheet's ~5KB, and it is now roughly 70% of what a phone downloads.
//
// The regex is still the wrong answer. Serving the splitter from its own route and fetching it on
// first tap was the answer this note used to give, and it is not that either: the splitter has to
// survive a reload with no network at all, because the reload it has to survive is a phone
// discarding the tab mid-scan on restaurant wifi. It stays in the page. If the budget in
// scripts/smoke.js has to move again, move it with a real build step and a real minifier, which
// takes the comments and whitespace off the wire without taking them out of this file.

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
// Split the bill. Two people rather than a receipt-with-a-dashed-line, because the row sits
// directly under Request bill and its ICON_RECEIPT -- two near-identical receipts stacked would
// read as one control repeated, which is the opposite of what the row is for.
const ICON_SPLIT =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.6c0-3.3 2.8-5.4 6.2-5.4s6.2 2.1 6.2 5.4"/><path d="M16.2 5.1a3.4 3.4 0 0 1 0 5.8"/><path d="M17.6 14.5c2.4.6 3.6 2.4 3.6 5.1"/></svg>';

// `i` arrives free from Array#map. It only feeds the entrance stagger, capped because past the
// eighth dish nobody is watching the load animation any more.
function renderItem(item, i) {
  const stagger = `--i:${Math.min(i || 0, 8)}`;
  const price = formatCents(item.price_cents);
  // Name, description, size labels and add-on labels all feed the search box. Someone hunting
  // "500ml" should find the drinks that come in one, and someone hunting "bacon" should find the
  // burger you can put bacon on, not only the dishes with it in the title.
  const extraLabels = [...(item.price_variants || []), ...(item.add_ons || [])].map((v) => v.label).join(' ');
  // Appended only when there are some, so a dish without them keeps the exact haystack string it
  // has always had rather than gaining a trailing space nothing needs.
  const haystack = esc(`${item.name} ${item.description || ''}${extraLabels ? ` ${extraLabels}` : ''}`.toLowerCase());

  // Sizes render whenever they exist and price_cents renders whenever it is set -- the two never
  // consult each other. A dish carrying both is a menu-writing mistake, and the admin Price field
  // says so; quietly dropping one here would hide what the owner typed instead of showing it back.
  const sizes = (item.price_variants || [])
    .map((v) => {
      const p = formatCents(v.price_cents);
      return p
        ? `<span class="size"><span class="size-label">${esc(v.label)}</span><span class="size-price">${esc(p)}</span></span>`
        : '';
    })
    .join('');

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
    ${sizes ? `<span class="sizes">${sizes}</span>` : ''}
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
  // "free" rather than "+R0.00" -- a no-charge swap reads as a perk, and a column of R0.00s reads
  // as a pricing bug. Zero is the only price that gets the word; a blank one never reaches here
  // (see variants.js), so this cannot dress up a price someone forgot to type.
  const addOns = (item.add_ons || [])
    .map((a) => {
      const p = a.price_cents ? `+${formatCents(a.price_cents)}` : 'free';
      return `<div class="addon"><span class="addon-label">${esc(a.label)}</span><span class="addon-dots"></span><span class="addon-price">${esc(p)}</span></div>`;
    })
    .join('');
  const addOnBlock = addOns ? `<div class="addons"><div class="addons-head">Add-ons</div>${addOns}</div>` : '';

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
    ${addOnBlock}
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

// The brand hue moves the whole accent family: --accent (price, word-marks, spice, map link),
// --lit (open badge, active chip, dietary pills), its --lit-bg fill, --card-open-border and the
// opened card's tint, and the --cta-* group -- the promo badges and the three footer buttons,
// which are the same four tokens. Everything else -- the ink-tinted hairlines especially -- stays
// neutral, because brand-coloured STRUCTURE is what makes a themed page read as a template. A
// brand-coloured call-to-action is just a call-to-action.
//
// No LIGHTNESS moves. Every lightness stop below is the one the default brass palette already
// sits on, so the AAA ratios the STYLE block's comments were measured against hold for any hue an
// owner can pick -- contrast is a function of lightness, and no lightness here is a variable.
// That is the whole reason this can be a free colour picker rather than a fixed preset list.
// (Saturation is fixed too, bar the one exception noted on --cta-bg below.)
//
// Null hue appends nothing at all: an unthemed restaurant renders the exact bytes it rendered
// before this existed.
function themeCss(hue) {
  // Numbers only, deliberately: Number(null) and Number('') are both 0, so a looser check would
  // turn "no theme" into a bright red one.
  if (typeof hue !== 'number' || !Number.isFinite(hue)) return '';
  const h = Math.round(hue);
  if (h < 0 || h > 360) return '';
  // Every stop below is the brass default re-expressed in HSL -- #faf7f1 is hsl(40,47%,96%),
  // #dcb974 is hsl(38,60%,66%) -- so lightness never moves and the contrast pairs the STYLE
  // block's comments were measured against hold for every hue.
  //
  // --cta-bg is the one stop that is not a straight translation: the default #1d1a16 is
  // hsl(35,14%,10%), and 14% saturation on a near-black is a hue nobody can see, so the light
  // CTA would have stayed a black pill whatever the owner picked. Saturation is raised to 42%
  // (a deep tint of their colour, not a black); lightness is held, which is the half of it that
  // contrast depends on -- cream ink on this still measures past 14:1 at any hue.
  const light =
    `--accent:hsl(${h},57%,35%);--lit:hsl(${h},52%,47%);--lit-bg:hsla(${h},52%,47%,.1);`
    + `--card-open-border:hsla(${h},52%,39%,.35);`
    + `--cta-bg:hsl(${h},42%,12%);--cta-border:hsl(${h},42%,12%);`
    + `--cta-ink:hsl(${h},47%,96%);--cta-arrow:hsl(${h},60%,66%)`;
  const dark =
    `--accent:hsl(${h},50%,57%);--lit:hsl(${h},60%,66%);--lit-bg:hsla(${h},50%,57%,.1);`
    + `--card-open-border:hsla(${h},50%,57%,.32);`
    + `--card-open-bg:linear-gradient(180deg,hsla(${h},50%,57%,.07),hsla(${h},50%,57%,.015));`
    + `--cta-bg:hsla(${h},50%,57%,.09);--cta-border:hsla(${h},50%,57%,.45);`
    + `--cta-ink:hsl(${h},60%,66%);--cta-arrow:hsl(${h},50%,57%)`;
  // Declared twice for the same reason the STYLE block declares its dark vars twice: the media
  // query follows the system, the [data-theme] rule has to beat it when the diner toggled.
  return `<style>:root{${light}}`
    + `@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`
    + `:root[data-theme="dark"]{${dark}}</style>`;
}

// `preview` renders the same page for the owner's Settings preview frame (routes/public.js,
// ?preview=1) with every write stripped out at TEMPLATE level, not guarded at runtime: the scan
// beacon never ships, and post()/del() return a canned ok instead of a fetch. An owner will tap
// "Call waiter" to see what it does, and a phantom "table 4 wants the bill" on the kitchen display
// is a worse bug than the analytics noise the beacon alone would cause.
function renderPage({ restaurant, menu, preview }) {
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
${themeCss(restaurant.brand_hue)}
<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body data-slug="${esc(restaurant.slug)}"
      data-hours="${esc(JSON.stringify(restaurant.hours || null))}"
      data-closed-note="${esc(restaurant.closed_note || '')}"
      ${serviceEnabled ? 'data-service' : ''}>
<header>
  <div class="head-row">
    <div class="head-id">
      ${restaurant.logo_url ? `<img class="logo" src="${esc(restaurant.logo_url)}" alt="">` : ''}
      <div class="head-text">
        <h1>${esc(restaurant.name)}</h1>
        <p class="sub">Menu</p>
      </div>
    </div>
    <div class="head-actions">
      <button class="theme-toggle" type="button" id="theme-toggle" aria-label="Switch theme">${ICON_MOON}</button>
      <button class="burger" type="button" id="open-sheet" aria-label="More options" aria-haspopup="true">☰</button>
    </div>
  </div>
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
</div>
<div class="overlay" id="manage-request" hidden role="dialog" aria-modal="true" aria-labelledby="manage-h">
  <button class="close" type="button" id="close-manage" aria-label="Close">✕</button>
  <div>
    <h2 id="manage-h">Already sent</h2>
    <p id="manage-body"></p>
    <button class="btn" type="button" id="manage-nudge">Nudge them again</button>
    <button class="btn btn-ghost" type="button" id="manage-cancel">Cancel request</button>
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
    <section class="sheet-group" aria-labelledby="sheet-g-table">
      <h3 class="sheet-group-label" id="sheet-g-table">At your table</h3>
      <div class="sheet-card">
        ${
          // This group renders for EVERY restaurant -- only the two service rows inside it are
          // gated. The splitter is a calculator on the diner's own phone, not something a waiter
          // has to action, so it has nothing to do with serviceEnabled. Put the gate back on the
          // <section> and the splitter silently disappears from every restaurant that has not
          // switched table service on.
          serviceEnabled
            ? `<button class="sheet-row" type="button" data-kind="waiter">
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
        <div class="sheet-divider"></div>`
            : ''
        }
        <button class="sheet-row" type="button" id="open-split">
          <span class="sheet-row-icon">${ICON_SPLIT}</span>
          <span class="sheet-row-text"><span class="sheet-row-title">Split the bill</span><span class="sheet-row-subtitle">Work out who owes what</span></span>
          <span class="chev">›</span>
        </button>
      </div>
    </section>
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
    <p class="powered-by">Powered by <a href="https://complexai.co.za" target="_blank" rel="noopener">Complex AI</a></p>
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
  // Split the bill. Four panes in one overlay rather than four overlays: the back gesture handler
  // above treats any open .overlay as one dismissable state, and a four-deep stack of them would
  // turn one back swipe into "close the whole thing" halfway through a split.
  //
  // Nothing here talks to the server. The photo is read by Tesseract.js in the browser and never
  // leaves the phone, the maths is lib/splitBill.js injected below, and the working split lives in
  // localStorage. No route, no table, no image upload, nothing to retain.
  ''
}<div class="overlay" id="split" hidden role="dialog" aria-modal="true" aria-labelledby="split-h">
  <button class="close" type="button" id="close-split" aria-label="Close">✕</button>
  <div>
    <h2 id="split-h">Split the bill</h2>
    <p id="split-sub">Photograph the bill or type it in. It stays on your phone.</p>

    <div class="sp-pane" id="sp-start">
      <!-- A plain file input styled as the primary button: the native picker is the camera on
           every phone this page runs on, with no library and no permission prompt of our own. -->
      <label class="btn" for="sp-photo">Photograph the bill</label>
      <input id="sp-photo" type="file" accept="image/*" capture="environment" hidden>
      <button class="btn btn-ghost" type="button" id="sp-manual">Type it in instead</button>
      <p class="sp-note" id="sp-scan-note" hidden></p>
    </div>

    <!-- The scanner. Deliberately NOT a wizard step: a transient takeover while Tesseract works,
         so it stays out of PANES and out of the saved step -- a reload mid-scan must land on the
         start pane, never on a progress bar for a scan that is no longer running. The paper is
         decoration around one number, so it is hidden from assistive tech and the number spoken. -->
    <div class="sp-scan" id="sp-scan" hidden>
      <div class="sp-scan-grid" aria-hidden="true"></div>
      <div class="sp-scan-top">
        <span>SCAN &middot; 01</span>
        <span class="sp-live"><i aria-hidden="true"></i>ON DEVICE</span>
      </div>
      <div class="sp-frame" aria-hidden="true">
        <div class="sp-receipt">
          <i class="sp-sk-h"></i><i class="sp-sk-s"></i>
          <div class="sp-sk-rows" id="sp-sk-rows">${'<div class="sp-sk-row"><i></i><b></b></div>'.repeat(6)}</div>
        </div>
        <div class="sp-beam"></div>
        <span class="sp-br"></span><span class="sp-br"></span><span class="sp-br"></span><span class="sp-br"></span>
        <div class="sp-motes" id="sp-motes"></div>
      </div>
      <div class="sp-scan-foot">
        <div class="sp-scan-phase">
          <span id="sp-phase" aria-live="polite">ALIGNING EDGES</span><span id="sp-pct">0%</span>
        </div>
        <div class="sp-bar" id="sp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
             aria-valuenow="0"><i></i></div>
        <div class="sp-tele" id="sp-tele">ON DEVICE &middot; NOTHING UPLOADED</div>
      </div>
    </div>

    <div class="sp-pane" id="sp-items" hidden>
      <div class="sp-list" id="sp-item-list"></div>
      <button class="sp-add" type="button" id="sp-add">+ Add an item</button>
      <label class="sp-label" for="sp-total">What the bill says</label>
      <input class="field" id="sp-total" type="text" inputmode="decimal" placeholder="761.75"
             autocomplete="off" aria-label="Bill total">
      <p class="sp-warn" id="sp-unaccounted" hidden></p>
    </div>

    <div class="sp-pane" id="sp-who" hidden>
      <div class="sp-stepper">
        <span class="sp-label" id="sp-count-label">Splitting between</span>
        <button class="sp-step-btn" type="button" id="sp-fewer" aria-label="One fewer person">−</button>
        <span class="sp-count" id="sp-count" aria-live="polite">2</span>
        <button class="sp-step-btn" type="button" id="sp-more" aria-label="One more person">+</button>
      </div>
      <div class="sp-names" id="sp-names"></div>
      <label class="sp-label">Who had what</label>
      <div class="sp-assign" id="sp-assign"></div>
      <p class="sp-warn" id="sp-unassigned" hidden></p>
    </div>

    <div class="sp-pane" id="sp-result" hidden>
      <label class="sp-label">Tip</label>
      <div class="sp-tabs">
        <button class="sp-tab" type="button" data-tip="percent" aria-pressed="true">Percent</button>
        <button class="sp-tab" type="button" data-tip="amount" aria-pressed="false">Amount</button>
      </div>
      <div class="sp-pcts" id="sp-pcts"></div>
      <input class="field" id="sp-tip-amount" type="text" inputmode="decimal" placeholder="100.00"
             autocomplete="off" aria-label="Tip amount in rand" hidden>
      <div class="sp-lines" id="sp-lines"></div>
      <div class="sp-grand"><span>Total incl. tip</span><span id="sp-grand"></span></div>
      <button class="btn" type="button" id="sp-copy">Copy summary</button>
      <p class="copied" id="sp-copied" hidden>Copied</p>
      <button class="btn-quiet" type="button" id="sp-reset">Start over</button>
    </div>

    <div class="sp-nav">
      <button class="sp-nav-btn" type="button" id="sp-back" hidden>Back</button>
      <button class="sp-nav-btn sp-nav-next" type="button" id="sp-next" hidden>Next</button>
    </div>
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

${
  preview
    ? `  // Preview frame: shaped like a real fetch Response because every caller reads .ok, .status
  // or .json() off it, so the page still walks through its real success states -- the owner sees
  // "Waiter called ✓" -- while nothing leaves the browser.
  function previewOk(){
    return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve({ ok:true, id:'preview' }); } });
  }
  function post(){ return previewOk(); }
  function del(){ return previewOk(); }`
    : `  function post(path, body){
    return fetch('/api/public/' + encodeURIComponent(slug) + path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      credentials:'same-origin', body:JSON.stringify(body)
    });
  }

  function del(path){
    return fetch('/api/public/' + encodeURIComponent(slug) + path, {
      method:'DELETE', credentials:'same-origin'
    });
  }

  // Counts this load as a scan. Counted here, not in the route: the HTML sits behind a 60s
  // shared cache (routes/public.js), so a server-side count would miss almost every real scan.
  // sendBeacon survives the diner tapping away immediately; post() covers the one browser
  // without it. Fresh navigations only -- a refresh is the same diner at the same table, and
  // "Scans today" is read by an owner as arrivals, not page loads. A real re-scan is still a
  // 'navigate' even when the camera reuses the tab, so it still counts.
  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if(!nav || nav.type === 'navigate'){
    if(navigator.sendBeacon) navigator.sendBeacon('/api/public/' + encodeURIComponent(slug) + '/scan');
    else post('/scan', {});
  }`
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

  // Nothing is written until Confirm. The tap is a selection only: a stray tap on the wrong star
  // is free to correct, which matters because the route takes 1-5 and has no delete, so a rating
  // that lands by accident can be changed but never taken back.
  //
  // That makes this post the only one, so unlike the old optimistic tap it has to admit a
  // failure instead of quietly showing Saved -- same reasoning as the service buttons below.
  document.querySelectorAll('.faces[data-item]').forEach(function(group){
    var rate = group.closest('.rate');
    var note = rate.querySelector('.note');
    var confirmWrap = rate.querySelector('.confirm-wrap');
    var confirmBtn = rate.querySelector('.confirm-btn');

    group.addEventListener('click', function(e){
      var btn = e.target.closest('.face');
      if(!btn) return;
      select(group, Number(btn.dataset.r));
      confirmWrap.hidden = false;     // morphs in -- there is now something to confirm
      // Re-armed after a save: changing the stars has to be confirmable, or the first Confirm
      // is final and a corrected rating never reaches the upsert.
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm';
      confirmBtn.classList.remove('sent');
    });

    confirmBtn.addEventListener('click', function(){
      confirmBtn.disabled = true;
      post('/item-rating', {
        itemId: group.dataset.item,
        rating: Number(group.dataset.rating),
        comment: note.value
      }).then(function(res){
        if(!res.ok) throw new Error();
        confirmBtn.textContent = 'Saved ✓';
        confirmBtn.classList.add('sent');
        replay(confirmBtn, 'pop');
      }).catch(function(){
        confirmBtn.textContent = 'Could not save — tap to retry';
        confirmBtn.disabled = false;
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

  // Phone back gesture should dismiss whatever overlay is open -- the burger sheet, the info
  // modal, any of the others -- rather than leaving the page. Most diners land here straight from
  // the camera app's QR prompt, so this document is the only entry in tab history and a bare back
  // closes the browser, not "goes anywhere". Generic over every .overlay instead of one push/pop
  // per dialog: dialogs already collapse "something else is open" into one state (see the info
  // modal's own comment below), so a new overlay needs no extra wiring here.
  (function(){
    var overlays = document.querySelectorAll('.overlay');
    var pushed = false;

    function isOpen(){
      for(var i = 0; i < overlays.length; i++) if(!overlays[i].hidden) return true;
      return false;
    }

    var observer = new MutationObserver(function(){
      var open = isOpen();
      if(open && !pushed){
        pushed = true;
        history.pushState({ overlay: true }, '');
      } else if(!open && pushed){
        pushed = false;
        history.back();
      }
    });
    overlays.forEach(function(el){ observer.observe(el, { attributes: true, attributeFilter: ['hidden'] }); });

    window.addEventListener('popstate', function(){
      if(!pushed) return;
      pushed = false;
      overlays.forEach(function(el){ el.hidden = true; });
    });
  })();

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
    // inherit last night's table. Request memory below reuses the same window.
    var TABLE_TTL = 4 * 60 * 60 * 1000;
    // Same window the footer pill and the manage dialog's Nudge button both cool down for --
    // one constant so a mashed button can't re-chime the kitchen display faster from one path
    // than the other.
    var COOLDOWN = 90000;
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

    // The id of an open request this browser itself just sent, one slot per kind. Lets a repeat
    // tap open the manage dialog below instead of blindly resending -- see routes/public.js's
    // nudge/cancel routes, which are the actual source of truth on whether it is still open.
    function requestKey(kind){ return 'rq:' + kind + ':' + slug; }
    function rememberedRequest(kind){
      try {
        var r = JSON.parse(localStorage.getItem(requestKey(kind)) || 'null');
        return (r && Date.now() - r.t < TABLE_TTL) ? r : null;
      } catch(e){ return null; }
    }
    function rememberRequest(kind, id){
      try { localStorage.setItem(requestKey(kind), JSON.stringify({ id: id, t: Date.now() })); } catch(e){}
    }
    // Records the last nudge separately from "t" (the original ask, used for the "asked X minutes
    // ago" copy) so the nudge cooldown tracks its own clock instead of resetting the ago label.
    function touchNudge(kind){
      try {
        var r = JSON.parse(localStorage.getItem(requestKey(kind)) || 'null');
        if(!r) return;
        r.n = Date.now();
        localStorage.setItem(requestKey(kind), JSON.stringify(r));
      } catch(e){}
    }
    function forgetRequest(kind){
      try { localStorage.removeItem(requestKey(kind)); } catch(e){}
    }

    // Every element sharing this data-kind -- the footer pill and the sheet row are the same
    // request wearing two hats, and both swap their own label in place to report status, so
    // both stay in sync with one call.
    function ofKind(kind){ return document.querySelectorAll('[data-kind="' + kind + '"]'); }
    function setLabel(el, text){ (el.querySelector('.label') || el).textContent = text; }
    function resetKind(kind){
      ofKind(kind).forEach(function(el){
        setLabel(el, LABELS[kind]);
        el.disabled = false;
      });
    }

    // Nothing here is optimistic. A request that silently failed leaves someone waiting for a
    // waiter who was never called, and they will blame the restaurant for it, not a dropped
    // packet -- so the button says so and stays tappable.
    function send(kind, table){
      var els = ofKind(kind);
      els.forEach(function(el){ el.disabled = true; });
      post('/service-request', { kind: kind, table: table }).then(function(res){
        if(!res.ok) throw new Error();
        return res.json();
      }).then(function(body){
        if(body && body.id) rememberRequest(kind, body.id);
        var sent = kind === 'bill' ? 'Bill requested ✓' : 'Waiter called ✓';
        // Re-enabled, not left disabled: a repeat tap while "requested" is showing should open
        // the manage dialog (rememberedRequest is now set, so the click handler below routes
        // there) rather than being a dead button.
        els.forEach(function(el){ setLabel(el, sent); el.disabled = false; });
        // The cooldown is UX, not the guard -- the dedupe index in service_requests.sql is what
        // actually protects the display. This just stops the buttons reading as unanswered.
        setTimeout(function(){ resetKind(kind); }, COOLDOWN);
      }).catch(function(){
        els.forEach(function(el){ setLabel(el, 'Could not send — tap to retry'); el.disabled = false; });
      });
    }

    // Manage dialog for a request this browser already has open -- Nudge (still waiting) or
    // Cancel (sorted already / tapped by mistake), reachable from a repeat tap of either button.
    var manage = document.getElementById('manage-request');
    var manageH = document.getElementById('manage-h');
    var manageBody = document.getElementById('manage-body');
    var manageNudge = document.getElementById('manage-nudge');
    var manageCancel = document.getElementById('manage-cancel');
    var manageKind = null;

    function agoLabel(ms){
      var mins = Math.max(0, Math.round(ms / 60000));
      if(mins < 1) return 'just now';
      if(mins === 1) return '1 minute ago';
      return mins + ' minutes ago';
    }

    function openManage(kind, active){
      manageKind = kind;
      manageH.textContent = kind === 'bill' ? 'Bill already requested' : 'Waiter already called';
      manageBody.textContent = 'You asked ' + agoLabel(Date.now() - active.t) + '. Still waiting, or is this sorted?';
      manageNudge.textContent = 'Nudge them again';
      // Cooldown clock is the last nudge if there's been one, otherwise the original ask --
      // covers a reopen of this dialog within COOLDOWN of either. Cancel isn't gated: sorted
      // is sorted, whenever it happens.
      var remaining = COOLDOWN - (Date.now() - (active.n || active.t));
      manageNudge.disabled = remaining > 0;
      if(remaining > 0){
        setTimeout(function(){
          if(manageKind === kind && !manage.hidden) manageNudge.disabled = false;
        }, remaining);
      }
      manageCancel.disabled = false;
      manageCancel.textContent = 'Cancel request';
      manage.hidden = false;
    }
    document.getElementById('close-manage').onclick = function(){ manage.hidden = true; };

    // Staff having already acknowledged it is the common case here, not an error -- both actions
    // below treat that the same way: forget it and let the button work like a fresh tap again.
    function handleStale(){
      forgetRequest(manageKind);
      manage.hidden = true;
      resetKind(manageKind);
    }

    manageNudge.onclick = function(){
      var active = rememberedRequest(manageKind);
      if(!active) return handleStale();
      manageNudge.disabled = true;
      post('/service-request/' + encodeURIComponent(active.id) + '/nudge', {}).then(function(res){
        if(res.status === 404) return handleStale();
        if(!res.ok) throw new Error();
        touchNudge(manageKind);
        manageNudge.textContent = 'They’ve been told ✓';
        setTimeout(function(){ manage.hidden = true; }, 1200);
        // Same cooldown, same reasoning, as the initial send -- stops a mashed button from
        // re-chiming the kitchen display every few seconds.
        setTimeout(function(){
          manageNudge.disabled = false;
          manageNudge.textContent = 'Nudge them again';
        }, COOLDOWN);
      }).catch(function(){
        manageNudge.disabled = false;
        manageNudge.textContent = 'Could not send — tap to retry';
      });
    };

    manageCancel.onclick = function(){
      var active = rememberedRequest(manageKind);
      if(!active) return handleStale();
      manageCancel.disabled = true;
      del('/service-request/' + encodeURIComponent(active.id)).then(function(res){
        if(res.status === 404) return handleStale();
        if(!res.ok) throw new Error();
        forgetRequest(manageKind);
        resetKind(manageKind);
        manageCancel.textContent = 'Cancelled ✓';
        setTimeout(function(){ manage.hidden = true; }, 900);
      }).catch(function(){
        manageCancel.disabled = false;
      });
    };

    serviceBtns.forEach(function(btn){
      btn.onclick = function(){
        // One overlay at a time, same rule as Hours & Address below: a tap from the sheet closes
        // it first, whether that leads to sending, the table prompt, or the manage dialog.
        sheet.hidden = true;
        var kind = btn.dataset.kind;
        var table = rememberedTable();
        // The first tap of a visit can never send anything on its own -- it opens the prompt.
        // That doubles as the mis-tap guard: a stray thumb on a fixed footer costs a dialog, not
        // an actual waiter's walk across the room.
        if(!table){
          pendingKind = kind;
          tableAsk.hidden = false;
          tableInput.value = '';
          tableGo.disabled = true;
          tableInput.focus();
          return;
        }
        var active = rememberedRequest(kind);
        if(active) return openManage(kind, active);
        send(kind, table);
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

  // --- Split the bill -------------------------------------------------------------------------
  // Runs entirely on the phone: no fetch, no route, no table. parseReceipt/settle are
  // lib/splitBill.js's own functions and parsePrice/formatCents are lib/money.js's, all four
  // inlined by toString() so there is exactly one implementation of the receipt parsing, the cent
  // arithmetic and the "R189.00" formatting across the server and a diner's phone. Those files'
  // headers say why each has to stay pure; splitBill.test.js and dinerPage.test.js enforce it.
  (function(){
    ${parseReceipt.toString()}

    ${settle.toString()}

    ${binarize.toString()}

    ${parsePrice.toString()}

    ${formatCents.toString()}

    var KEY = 'split:' + slug;
    // Pinned exactly. The 63KB here is the small half -- Tesseract pulls its wasm core and the
    // English language data from its own CDN on first recognise, which is the number that matters
    // and the reason none of this loads until someone taps Photograph the bill.
    var TESSERACT = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/6.0.1/tesseract.min.js';
    var PANES = ['sp-start', 'sp-items', 'sp-who', 'sp-result'];
    // One line of standing instruction per pane. The heading stays put so the overlay does not
    // appear to navigate away from itself; only the sentence under it changes.
    var SUBS = [
      'Photograph the bill or type it in. It stays on your phone.',
      'Check the lines. Fix anything that came out wrong.',
      'Tap everyone who shared a line — a bottle can belong to two people.',
      'Add a tip, and this is who owes what.'
    ];
    // ponytail: no custom-percent field. The Amount tab already covers "some other number", and a
    // second free-text money input to maintain for the gap between 12.5% and 15% is not worth it.
    var PCTS = [0, 5, 10, 12.5, 15];
    var MAX_PEOPLE = 12;

    var splitEl = document.getElementById('split');
    var listEl = document.getElementById('sp-item-list');
    var totalEl = document.getElementById('sp-total');
    var unaccEl = document.getElementById('sp-unaccounted');
    var namesEl = document.getElementById('sp-names');
    var assignEl = document.getElementById('sp-assign');
    var countEl = document.getElementById('sp-count');
    var unassEl = document.getElementById('sp-unassigned');
    var fewerBtn = document.getElementById('sp-fewer');
    var moreBtn = document.getElementById('sp-more');
    var pctsEl = document.getElementById('sp-pcts');
    var tipAmtEl = document.getElementById('sp-tip-amount');
    var linesEl = document.getElementById('sp-lines');
    var grandEl = document.getElementById('sp-grand');
    var backBtn = document.getElementById('sp-back');
    var nextBtn = document.getElementById('sp-next');

    function fresh(){
      return { items: [], people: ['Person 1', 'Person 2'],
               tip: { mode: 'percent', value: 10 }, billTotalCents: null, step: 0 };
    }

    // ponytail: the whole split, one key, rewritten on every change. A bill is a few hundred bytes
    // and lives about ten minutes -- anything incremental would be a sync engine for a thing that
    // does not outlive the meal.
    function save(){
      S.at = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){}
    }

    function load(){
      try {
        var raw = JSON.parse(localStorage.getItem(KEY));
        // Shape-checked rather than trusted: this string survives deploys, so a split written by
        // an older version has to fail here rather than throw somewhere deep inside a render.
        // Twelve hours is one meal -- past that, restoring last week's bill is a bug, not a
        // convenience.
        if(raw && Array.isArray(raw.items) && Array.isArray(raw.people) && raw.people.length >= 2 &&
           raw.tip && Date.now() - (raw.at || 0) < 12 * 3600 * 1000) return raw;
      } catch(e){}
      return fresh();
    }

    var S = load();

    function calc(){
      return settle({ items: S.items, peopleCount: S.people.length,
                      tip: S.tip, billTotalCents: S.billTotalCents });
    }

    function label(i){ return S.people[i] || ('Person ' + (i + 1)); }
    function rands(cents){ return (cents / 100).toFixed(2); }

    // --- Pane 2: the items ---------------------------------------------------------------------
    // Rebuilt only on add, delete and scan. Typing into a name or price mutates the model in place
    // instead of re-rendering, because a re-render mid-keystroke takes the caret with it.
    function renderItems(){
      listEl.innerHTML = '';
      if(!S.items.length){
        var empty = document.createElement('p');
        empty.className = 'sp-empty';
        empty.textContent = 'Nothing here yet — add the first line below.';
        listEl.appendChild(empty);
        return;
      }
      S.items.forEach(function(item, i){
        var row = document.createElement('div');
        row.className = 'sp-row';

        var name = document.createElement('input');
        name.className = 'sp-name';
        name.type = 'text';
        name.value = item.name;
        name.placeholder = 'Item';
        name.setAttribute('aria-label', 'Item name');
        name.addEventListener('input', function(){ item.name = name.value; save(); });

        var price = document.createElement('input');
        price.className = 'sp-price';
        price.type = 'text';
        price.inputMode = 'decimal';
        price.value = rands(item.cents);
        price.setAttribute('aria-label', 'Item price');
        price.addEventListener('input', function(){
          // parsePrice is the console's own, so "R98", "98,50" and "98.50" all mean the same thing
          // here as they do on the menu. NaN is a half-typed number -- keep the last good value
          // rather than zeroing the line under the diner's finger.
          var cents = parsePrice(price.value);
          if(cents !== null && !isNaN(cents)){ item.cents = cents; save(); syncItems(); }
        });
        price.addEventListener('blur', function(){ price.value = rands(item.cents); });

        var del = document.createElement('button');
        del.className = 'sp-del';
        del.type = 'button';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'Remove this line');
        del.onclick = function(){ S.items.splice(i, 1); save(); renderItems(); syncItems(); };

        row.appendChild(name);
        row.appendChild(price);
        row.appendChild(del);
        listEl.appendChild(row);
      });
    }

    function syncItems(){
      var r = calc();
      unaccEl.innerHTML = '';
      if(r.unaccounted === null || r.unaccounted === 0){
        unaccEl.hidden = true;
      } else {
        var over = r.unaccounted < 0;
        var text = document.createElement('span');
        text.textContent = over
          ? ('The lines add up to ' + formatCents(-r.unaccounted) + ' more than the bill total.')
          : (formatCents(r.unaccounted) + ' of the bill is not on this list — a missed line, or the VAT and service charge.');
        unaccEl.appendChild(text);
        if(!over){
          // The fix path for OCR's inevitable misses: one tap turns the gap into a real line that
          // people can then share, instead of a warning the diner can only stare at.
          var fix = document.createElement('button');
          fix.type = 'button';
          fix.textContent = 'Add it as one shared line';
          fix.onclick = function(){
            S.items.push({ name: 'The rest of the bill', cents: r.unaccounted, who: [] });
            save();
            renderItems();
            syncItems();
          };
          unaccEl.appendChild(fix);
        }
        unaccEl.hidden = false;
      }
      syncNav();
    }

    // --- Pane 3: who had what ------------------------------------------------------------------
    function renderNames(){
      countEl.textContent = S.people.length;
      fewerBtn.disabled = S.people.length <= 2;
      moreBtn.disabled = S.people.length >= MAX_PEOPLE;
      namesEl.innerHTML = '';
      S.people.forEach(function(who, i){
        var input = document.createElement('input');
        input.type = 'text';
        input.value = who;
        input.maxLength = 18;
        input.setAttribute('aria-label', 'Name of person ' + (i + 1));
        input.addEventListener('input', function(){
          S.people[i] = input.value;
          // Retype only this person's chips. A full re-render of the assign list would scroll it
          // back to the top and lose the row someone was halfway through tapping.
          var chips = assignEl.querySelectorAll('[data-p="' + i + '"]');
          for(var k = 0; k < chips.length; k++) chips[k].textContent = label(i);
          save();
        });
        namesEl.appendChild(input);
      });
    }

    function renderAssign(){
      assignEl.innerHTML = '';
      S.items.forEach(function(item){
        if(!item.who) item.who = [];
        var wrap = document.createElement('div');
        wrap.className = 'sp-item';

        var head = document.createElement('div');
        head.className = 'sp-item-head';
        var name = document.createElement('span');
        name.textContent = item.name || 'Untitled item';
        var amt = document.createElement('span');
        amt.className = 'sp-amt';
        amt.textContent = formatCents(item.cents);
        head.appendChild(name);
        head.appendChild(amt);

        var chips = document.createElement('div');
        chips.className = 'sp-chips';
        S.people.forEach(function(who, i){
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'sp-chip';
          chip.dataset.p = i;
          chip.textContent = label(i);
          chip.setAttribute('aria-pressed', item.who.indexOf(i) > -1 ? 'true' : 'false');
          chip.onclick = function(){
            // Several people lit on one line is how a shared bottle works: the cost divides across
            // everyone tapped, not across the table and not onto whoever tapped it first.
            var at = item.who.indexOf(i);
            if(at > -1) item.who.splice(at, 1); else item.who.push(i);
            chip.setAttribute('aria-pressed', at > -1 ? 'false' : 'true');
            save();
            syncWho();
          };
          chips.appendChild(chip);
        });

        wrap.appendChild(head);
        wrap.appendChild(chips);
        assignEl.appendChild(wrap);
      });
    }

    function syncWho(){
      var r = calc();
      if(r.unassigned > 0){
        unassEl.textContent = formatCents(r.unassigned) + ' still has nobody against it.';
        unassEl.hidden = false;
      } else {
        unassEl.hidden = true;
      }
      syncNav();
    }

    // --- Pane 4: the tip, and the answer -------------------------------------------------------
    function renderTipControls(){
      var pct = S.tip.mode !== 'amount';
      pctsEl.innerHTML = '';
      PCTS.forEach(function(p){
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sp-chip';
        chip.textContent = p + '%';
        chip.setAttribute('aria-pressed', pct && S.tip.value === p ? 'true' : 'false');
        chip.onclick = function(){ S.tip = { mode: 'percent', value: p }; save(); renderResult(); };
        pctsEl.appendChild(chip);
      });
      pctsEl.hidden = !pct;
      tipAmtEl.hidden = pct;
      var tabs = document.querySelectorAll('.sp-tab');
      for(var i = 0; i < tabs.length; i++){
        tabs[i].setAttribute('aria-pressed', (tabs[i].dataset.tip === 'amount') === !pct ? 'true' : 'false');
      }
    }

    function renderLines(){
      var r = calc();
      linesEl.innerHTML = '';
      S.people.forEach(function(who, i){
        var line = document.createElement('div');
        line.className = 'sp-line';

        var left = document.createElement('div');
        var name = document.createElement('span');
        name.className = 'sp-who';
        name.textContent = label(i);
        var sub = document.createElement('span');
        sub.className = 'sp-sub';
        sub.textContent = formatCents(r.subtotals[i]) + ' + ' + formatCents(r.tipEach[i]) + ' tip';
        left.appendChild(name);
        left.appendChild(sub);

        var owes = document.createElement('span');
        owes.className = 'sp-owes';
        owes.textContent = formatCents(r.perPerson[i]);

        line.appendChild(left);
        line.appendChild(owes);
        linesEl.appendChild(line);
      });
      grandEl.textContent = formatCents(r.grandTotal);
    }

    function renderResult(){ renderTipControls(); renderLines(); }

    function summary(){
      var r = calc();
      var out = [document.title + ' — split ' + S.people.length + ' ways'];
      S.people.forEach(function(who, i){
        out.push(label(i) + ': ' + formatCents(r.perPerson[i]) +
                 ' (' + formatCents(r.subtotals[i]) + ' + ' + formatCents(r.tipEach[i]) + ' tip)');
      });
      out.push('Total incl. tip: ' + formatCents(r.grandTotal));
      return out.join('\\n');
    }

    // --- Steps ---------------------------------------------------------------------------------
    function syncNav(){
      backBtn.hidden = S.step === 0;
      nextBtn.hidden = S.step === 0 || S.step === 3;
      nextBtn.textContent = S.step === 2 ? 'See the split' : 'Next';
      // An empty bill has nothing to divide, and an empty result screen reads as broken rather
      // than unfinished.
      nextBtn.disabled = S.step === 1 && !S.items.length;
    }

    function go(step){
      S.step = step;
      save();
      for(var i = 0; i < PANES.length; i++) document.getElementById(PANES[i]).hidden = i !== step;
      document.getElementById('split-sub').textContent = SUBS[step];
      if(step === 1){ renderItems(); syncItems(); }
      if(step === 2){ renderNames(); renderAssign(); syncWho(); }
      if(step === 3){ renderResult(); }
      syncNav();
    }

    var openBtn = document.getElementById('open-split');
    openBtn.onclick = function(){
      sheet.hidden = true;
      splitEl.hidden = false;
      totalEl.value = S.billTotalCents === null || S.billTotalCents === undefined ? '' : rands(S.billTotalCents);
      tipAmtEl.value = S.tip.mode === 'amount' ? rands(S.tip.value) : '';
      go(S.items.length ? (S.step || 0) : 0);
    };
    document.getElementById('close-split').onclick = function(){ splitEl.hidden = true; };

    // S.open follows the DOM instead of being set by each close path, because the close button is
    // not one of them: the back gesture hides every overlay directly (see the popstate handler
    // above), so a flag maintained by the ✕ handler alone stays true forever and reopens the
    // splitter over the whole menu -- header, theme toggle and all -- on every load after it.
    new MutationObserver(function(){
      S.open = !splitEl.hidden;
      save();
    }).observe(splitEl, { attributes: true, attributeFilter: ['hidden'] });

    // Reopen a split that a reload interrupted. Opening the camera on a page holding Tesseract's
    // wasm is exactly when a phone discards the tab, so the diner comes back to a fresh document
    // with the overlay hidden -- which reads as "it threw my bill away and went back to the menu".
    // The split itself was never lost, only the overlay; this puts them back where they were.
    //
    // The signal is the overlay's own flag, not the wizard step: the camera button lives on the
    // start pane, so an interrupted scan is ALWAYS interrupted at step 0 and any step-based test
    // is dead code for the one case this exists for. Cleared by the close button and by Start
    // over, so a diner who finished never gets it thrown back over the menu; load()'s twelve-hour
    // ceiling bounds the rest.
    if(S.open) openBtn.onclick();
    document.getElementById('sp-manual').onclick = function(){ go(1); };
    backBtn.onclick = function(){ go(S.step - 1); };
    nextBtn.onclick = function(){ go(S.step + 1); };

    document.getElementById('sp-add').onclick = function(){
      S.items.push({ name: '', cents: 0, who: [] });
      save();
      renderItems();
      syncItems();
      var names = listEl.querySelectorAll('.sp-name');
      if(names.length) names[names.length - 1].focus();
    };

    totalEl.addEventListener('input', function(){
      var cents = parsePrice(totalEl.value);
      S.billTotalCents = (cents === null || isNaN(cents)) ? null : cents;
      save();
      syncItems();
    });

    moreBtn.onclick = function(){
      if(S.people.length >= MAX_PEOPLE) return;
      S.people.push('Person ' + (S.people.length + 1));
      save();
      renderNames();
      renderAssign();
      syncWho();
    };

    fewerBtn.onclick = function(){
      if(S.people.length <= 2) return;
      var gone = S.people.length - 1;
      S.people.pop();
      // Drop the departed person from every line they were on. Leave them and their share becomes
      // money the totals quietly stop mentioning.
      S.items.forEach(function(item){
        var at = (item.who || []).indexOf(gone);
        if(at > -1) item.who.splice(at, 1);
      });
      save();
      renderNames();
      renderAssign();
      syncWho();
    };

    (function(){
      var tabs = document.querySelectorAll('.sp-tab');
      for(var i = 0; i < tabs.length; i++){
        tabs[i].onclick = (function(tab){
          return function(){
            S.tip = tab.dataset.tip === 'amount'
              ? { mode: 'amount', value: S.tip.mode === 'amount' ? S.tip.value : 0 }
              : { mode: 'percent', value: 10 };
            save();
            renderResult();
          };
        })(tabs[i]);
      }
    })();

    tipAmtEl.addEventListener('input', function(){
      var cents = parsePrice(tipAmtEl.value);
      S.tip = { mode: 'amount', value: (cents === null || isNaN(cents)) ? 0 : cents };
      save();
      // Only the numbers redraw. renderTipControls() here would rebuild the field being typed into
      // and take the caret with it.
      renderLines();
    });

    document.getElementById('sp-copy').onclick = function(){
      if(!navigator.clipboard) return;
      navigator.clipboard.writeText(summary()).then(function(){
        var note = document.getElementById('sp-copied');
        note.hidden = false;
        setTimeout(function(){ note.hidden = true; }, 2000);
      }, function(){});
    };

    document.getElementById('sp-reset').onclick = function(){
      S = fresh();
      // fresh() carries no open flag -- it is also what load() falls back to, and a first-time
      // visitor must not have the splitter open itself over the menu. Start over does not change
      // splitEl.hidden, so the observer below leaves the flag where it already is: open.
      S.open = true;
      totalEl.value = '';
      tipAmtEl.value = '';
      save();
      go(0);
    };

    // --- The camera ----------------------------------------------------------------------------
    (function(){
      var photo = document.getElementById('sp-photo');
      var note = document.getElementById('sp-scan-note');
      var scanEl = document.getElementById('sp-scan');
      var barEl = document.getElementById('sp-bar');
      var fillEl = barEl.querySelector('i');
      var phaseEl = document.getElementById('sp-phase');
      var pctEl = document.getElementById('sp-pct');
      var teleEl = document.getElementById('sp-tele');
      var motesEl = document.getElementById('sp-motes');
      var rows = document.getElementById('sp-sk-rows').children;
      var TELE = 'ON DEVICE · NOTHING UPLOADED';
      var scanning = false;

      // The four phases the canvas names, wired to the four the pipeline actually has, so the
      // words are true rather than a sequence on a timer: aligning IS prep()'s threshold pass,
      // reading IS the recognise pass, matching IS parseReceipt(). The percentage is Tesseract's
      // own, scaled into the band that pass occupies, so the bar never runs backwards.
      function progress(phase, pct){
        // Guarded because #sp-phase is aria-live: assigning the same string on every one of
        // Tesseract's ticks makes a screen reader say it dozens of times per scan.
        if(phaseEl.textContent !== phase) phaseEl.textContent = phase;
        pctEl.textContent = Math.round(pct) + '%';
        fillEl.style.width = pct + '%';
        barEl.setAttribute('aria-valuenow', Math.round(pct));
        // The skeleton fills in as the pass runs -- a loading placeholder, not a claim about how
        // many lines the bill has. That number is unknown until parseReceipt() returns, and it
        // goes in the telemetry line below, where it can be the truth.
        var seen = Math.floor(pct / 100 * (rows.length + 0.5));
        for(var i = 0; i < rows.length; i++) rows[i].className = i < seen ? 'sp-sk-row on' : 'sp-sk-row';
      }

      // Bill vocabulary drifting up off the paper. Each mote removes itself and schedules the
      // next -- the canvas keeps the last six in state, which is a list to maintain for something
      // on screen for 1.6 seconds.
      function mote(){
        if(scanEl.hidden) return;
        var TOK = ['R', 'OCR', '98.50', '×2', 'ITEM', 'R145', 'VAT', '26.00'];
        var el = document.createElement('span');
        el.className = 'sp-mote';
        el.textContent = TOK[Math.floor(Math.random() * TOK.length)];
        el.style.left = Math.round(6 + Math.random() * 76) + '%';
        el.style.top = Math.round(10 + Math.random() * 78) + '%';
        motesEl.appendChild(el);
        setTimeout(function(){ el.remove(); }, 1600);
        setTimeout(mote, 240 + Math.random() * 260);
      }

      // ponytail: read per scan, not watched. Nobody changes this mid-scan.
      function calm(){
        return window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
      }

      function showScan(on){
        scanEl.hidden = !on;
        if(on){ if(!calm()) mote(); } else { motesEl.innerHTML = ''; teleEl.textContent = TELE; }
      }

      // Every way out of the scanner that is not the item list. It covers the whole overlay, so
      // failing silently would leave a progress bar frozen at whatever percent it died on.
      function fail(text){
        showScan(false);
        note.hidden = false;
        note.textContent = text;
      }

      // ponytail: fetched on first scan, never on page load. A menu opened off a coaster must not
      // pay for a feature most diners never touch, and Tesseract's runtime downloads dwarf this
      // whole page.
      function loadOcr(){
        if(window.Tesseract) return Promise.resolve();
        return new Promise(function(resolve, reject){
          var tag = document.createElement('script');
          tag.src = TESSERACT;
          tag.onload = resolve;
          tag.onerror = function(){ reject(new Error('cdn')); };
          document.head.appendChild(tag);
        });
      }

      // Downscale, then hand the frame to binarize() (lib/splitBill.js) -- the largest accuracy
      // lever Tesseract has here. Everything about that pass is tested in Node; this function is
      // only the parts that need a browser: decoding the file and getting at its pixels.
      function prep(file){
        return new Promise(function(resolve, reject){
          var img = new Image();
          var url = URL.createObjectURL(file);
          img.onload = function(){
            URL.revokeObjectURL(url);
            var scale = Math.min(1, 1500 / Math.max(img.width, img.height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            binarize(data.data, canvas.width, canvas.height);
            ctx.putImageData(data, 0, 0);
            resolve(canvas);
          };
          img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('image')); };
          img.src = url;
        });
      }

      // Closing the overlay abandons the scanner too: reopening should offer a fresh start, not
      // the frozen bar of a scan that died with the last document. Added alongside the split's own
      // close handler rather than folded into it -- showScan lives in here.
      document.getElementById('close-split').addEventListener('click', function(){ showScan(false); });

      photo.addEventListener('change', function(){
        var file = photo.files && photo.files[0];
        if(!file || scanning) return;
        scanning = true;
        note.hidden = true;
        // The shutter fires before the scanner appears -- it covers the swap, so the paper is
        // already there when the flash clears.
        if(!calm()){
          var flash = document.createElement('div');
          flash.className = 'sp-flash';
          splitEl.appendChild(flash);
          setTimeout(function(){ flash.remove(); }, 400);
        }
        showScan(true);
        progress('WAKING THE SCANNER', 4);

        // A stalled request fires neither onload nor onerror, so the chain can simply never
        // settle. That used to leave a stale line of text; it now leaves a full-screen takeover
        // with no way out and no way to retry, so it needs a floor. 90s is well past a slow
        // phone's own recognise pass -- anything longer is not coming back.
        var dead = setTimeout(function(){
          if(scanning){ scanning = false; fail('That took too long. Try again, or type the items in.'); }
        }, 90000);

        var worker = null;
        loadOcr()
          .then(function(){ progress('ALIGNING EDGES', 12); return prep(file); })
          .then(function(canvas){
            progress('READING LINE ITEMS', 20);
            return window.Tesseract.createWorker('eng', 1, {
              logger: function(m){
                if(m.status === 'recognizing text'){
                  progress('READING LINE ITEMS', 20 + m.progress * 70);
                }
              }
            }).then(function(w){
              worker = w;
              // A bill is a single column. The default segmentation mode hunts for blocks and
              // merges neighbouring columns into one line, which is precisely the failure that
              // lands a price against the wrong item.
              return w.setParameters({ tessedit_pageseg_mode: '4' }).then(function(){
                return w.recognize(canvas);
              });
            });
          })
          .then(function(res){
            progress('MATCHING PRICES', 95);
            var found = parseReceipt(res.data.text);
            found.forEach(function(item){ item.who = []; });
            // Appended rather than replacing: scanning the second page of a long bill should leave
            // you holding both, and a bad photo is one Start over away.
            S.items = S.items.concat(found);
            save();
            if(!found.length){
              fail('Could not read that one. Try again in better light, or type the items in.');
              return;
            }
            progress('RECONCILING TOTAL', 100);
            teleEl.textContent = found.length + (found.length === 1 ? ' LINE' : ' LINES') + ' CAPTURED';
            // Held at 100% for a beat before the item list replaces it: that count is the one
            // thing here worth reading. A promise, so the cleanup below still runs after it.
            return new Promise(function(done){
              setTimeout(function(){ showScan(false); go(1); done(); }, 420);
            });
          })
          .catch(function(e){
            // loadOcr() already rejects with 'cdn' for a scanner that never arrived. Saying
            // "could not read that one" there blames the diner's photo for a dead network and
            // sends them off to retake it, which cannot work -- and it is the one failure a
            // report of "the splitter is broken" most likely means.
            fail(e && e.message === 'cdn'
              ? 'Could not download the scanner. Check your signal, or type the items in.'
              : 'Could not read that one. You can type the items in instead.');
          })
          .then(function(){
            scanning = false;
            clearTimeout(dead);
            // Cleared here, not on the way in: iOS invalidates the File's backing store when the
            // input that produced it is reset, and prep() reads the file well after that -- on the
            // first scan it waits on Tesseract's CDN first. Clearing after the read still leaves
            // the input empty before the next pick, which is all "re-pick the same photo" needs.
            photo.value = '';
            // The worker holds the language data in memory; a phone that has been at this for a
            // few scans will thank us.
            if(worker) worker.terminate();
          });
      });
    })();
  })();
})();
</script>
</body>
</html>`;
}

module.exports = { renderPage, esc, WORDS, squeeze, formatPeriods };
