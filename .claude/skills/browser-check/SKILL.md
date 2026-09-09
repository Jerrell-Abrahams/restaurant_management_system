---
name: browser-check
description: Run or extend the real-browser checks for this repo - the diner page's scan pipeline, the scan beacon, and the admin console. Use when a change touches the bill splitter, Tesseract, canvas work, the scan beacon, admin CSS, or Radix focus behaviour, or when asked to verify something works in an actual browser rather than in tests.
---

# Real-browser checks

`npm test` greps the rendered HTML for strings. It cannot see anything that only
happens once a rendering engine and a wasm OCR worker are running -- which is how
`tessedit_pageseg_mode: '4'` shipped, returned zero items from every bill with a
price column, and left 241 tests green.

## The scan pipeline

```
npm run dev            # or PORT=3222 node src/server.js
npm run browser        # add a slug, or BROWSER_BASE=http://localhost:3334
```

`scripts/browser.js` drives headless Chrome over CDP using node 22's global
`WebSocket`. No puppeteer, no playwright, no browser download -- Chrome itself is
the only requirement. Set `CHROME_PATH` if it is not at the Windows default.

It renders three receipt layouts (dot leaders / right-aligned / `1 x item R89`),
photographs them on a dark table, and pushes each through the page's own
`binarize` and `parseReceipt`, lifted out of the served HTML so it runs the same
bytes the diner runs.

**The layouts are the test.** The bug it exists to catch was layout-dependent:
a segmentation mode that does column analysis reads the gap between an item and
its price as a column boundary and returns one side of it. `qty and rand` passed
under the broken mode; the other two returned nothing. One layout would have
missed it.

### If it fails immediately with "serving stale code"

`src/server.js` does not watch files and the menu route caches 60s, so a server
started before your edit serves the old page and every failure below it is a
lie. Restart it. The guard exists because that cost an hour once.

## The admin console

Not in the script -- it needs Vite and a session, so it is a recipe rather than a
command. `admin/` talks to Supabase directly and reads `VITE_API_BASE_URL`
(default `http://localhost:3000`).

1. `cd admin && npx vite dev --port 5199 --strictPort`
2. Mint a session the way `scripts/smoke.js` does -- `auth.admin.generateLink`
   then `auth.verifyOtp` -- and inject it before app code runs, via
   `Page.addScriptToEvaluateOnNewDocument`, into `localStorage` under
   `sb-<project-ref>-auth-token`.
3. The console opens on the **restaurant picker**; `location.hash = '#/menu'`
   does nothing until a restaurant is chosen. Click the tile, then the `Menu`
   tab, then the button labelled **`Section`** or **`Dish`** (not "New section").

Useful CDP for this surface:

- `:active` and other pseudo-states: `CSS.forcePseudoState` with
  `forcedPseudoClasses: ['active']`, then read `getComputedStyle().opacity`.
  This is the only way to know an `@layer base` rule survives Tailwind's
  utility layer.
- Focus on dialog open: read `document.activeElement` against
  `document.querySelector('[role="dialog"]')`. Radix's "focus the container"
  fallback sits *inside* its `if (!defaultPrevented)` branch, so preventing
  `onOpenAutoFocus` without focusing something yourself drops focus out of the
  dialog entirely and the title is never announced.

## Diner page element ids

Guessing these wastes a run: `split`, `open-split`, `sp-photo`, `sp-scan`,
`sp-phase`, `sp-tele`, `sp-scan-note` (not `sp-note`). Items persist to
`localStorage` under `split:<slug>`.

Feed the file input with CDP `DOM.setFileInputFiles` -- it fires `change`
natively, the same path the camera takes.
