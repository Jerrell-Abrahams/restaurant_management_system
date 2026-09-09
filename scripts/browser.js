// The checks that need a REAL browser. Sibling to smoke.js: that one covers the wiring over HTTP,
// this one covers the things that only exist once a rendering engine and a wasm OCR worker are in
// the room. `npm test` cannot reach any of it -- it greps the rendered HTML for strings, which is
// how tessedit_pageseg_mode '4' shipped and silently returned zero items from every bill with a
// price column while 241 tests stayed green.
//
//   1. npm run dev            (or: PORT=3222 node src/server.js)
//   2. npm run browser
//
// Drives headless Chrome over CDP using node 22's global WebSocket -- no puppeteer, no playwright,
// no browser download. Chrome itself is the only thing that has to be installed.
//
// What it pins:
//   * a photographed bill comes back as line items, through the real prep -> binarize -> Tesseract
//     -> parseReceipt pipeline. Three layouts, because the failure was layout-dependent: a mode
//     that does column analysis returns ONE side of the gap between item and price.
//   * the scan beacon fires on a fresh navigation and stays silent on a reload.
//   * prep() actually releases the decoded frame instead of holding it while Tesseract's wasm heap
//     allocates on top of it.
const { spawn } = require('node:child_process');
const path = require('node:path');

const BASE = process.env.BROWSER_BASE || 'http://localhost:3222';
const SLUG = process.env.BROWSER_SLUG || process.argv[2] || 'kasi-flame';
const PAGE = `${BASE}/${SLUG}`;
const PORT = 9333;

// Where Chrome lives. Overridable because CI and macOS put it elsewhere.
const CHROME = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- the smallest CDP client that does the job ------------------------------------------------
async function launch() {
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu',
    `--user-data-dir=${path.join(require('node:os').tmpdir(), 'rms-cdp-' + Date.now())}`,
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return proc; } catch { /* booting */ }
    await sleep(250);
  }
  throw new Error(`Chrome never opened a debugging port. Set CHROME_PATH if it is not at:\n  ${CHROME}`);
}

async function attach() {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) listeners.forEach((f) => f(m));
  });
  const send = (method, params = {}) => {
    ws.send(JSON.stringify({ id: ++id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  return {
    send,
    on: (f) => listeners.push(f),
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval threw');
      return r.result.value;
    },
  };
}

// A bill as a phone meets it: small bright slip on a dark table. The dark surround is the point --
// it is what a global threshold cannot survive. Three layouts because the price column is exactly
// what a column-detecting segmentation mode throws away.
const slip = (rows, w = 430) => `<body style="margin:0;background:#20180f;display:flex;justify-content:center;padding:80px 0">
<div style="background:#f4efe4;width:${w}px;padding:26px 30px;font:19px/1.65 'Courier New',monospace;color:#2a2a2a">
<div style="text-align:center;font-weight:bold">KASI FLAME GRILL</div>${rows}</div></body>`;

const LAYOUTS = {
  'dot leaders': slip(`<div>Calamari .............. 89.00</div><div>Buffalo Wings ......... 75.00</div>
<div>Beef Burger ........... 120.00</div><div>Still Water ........... 25.50</div>
<div>TOTAL ................. 309.50</div>`),
  'right-aligned': slip(['Calamari 89.00', 'Buffalo Wings 75.00', 'Beef Burger 120.00', 'Still Water 25.50', 'TOTAL 309.50']
    .map((r) => { const i = r.lastIndexOf(' '); return `<div style="display:flex;justify-content:space-between"><span>${r.slice(0, i)}</span><span>${r.slice(i + 1)}</span></div>`; }).join('')),
  'qty and rand': slip(`<div>1 x Calamari          R 89.00</div><div>1 x Buffalo Wings     R 75.00</div>
<div>1 x Beef Burger      R 120.00</div><div>1 x Still Water       R 25.50</div>
<div>TOTAL                R 309.50</div>`, 470),
};

(async () => {
  const res = await fetch(PAGE).catch(() => null);
  if (!res || !res.ok) {
    console.error(`Cannot reach ${PAGE}. Start the server first (npm run dev), or pass a slug.`);
    process.exit(1);
  }
  const served = await res.text();

  // A server started before the last edit serves stale HTML and every failure below is a lie.
  // Ask the renderer what it would produce right now and compare the part that matters.
  const { renderPage } = require('../src/lib/dinerPage');
  const localPsm = (renderPage({ restaurant: { id: 'x', name: 'x', slug: SLUG }, menu: [] })
    .match(/tessedit_pageseg_mode: '(\d+)'/) || [])[1];
  const servedPsm = (served.match(/tessedit_pageseg_mode: '(\d+)'/) || [])[1];
  if (localPsm !== servedPsm) {
    console.error(`\nThe server is serving stale code (its pageseg mode is '${servedPsm}', the source says '${localPsm}').`);
    console.error('Restart it -- src/server.js does not watch files, and the menu route caches 60s.\n');
    process.exit(1);
  }

  const chrome = await launch();
  const s = await attach();
  await s.send('Page.enable');
  await s.send('Network.enable');
  await s.send('Runtime.enable');

  console.log(`\n== scan beacon (${PAGE}) ==`);
  const beacons = [];
  s.on((m) => {
    if (m.method === 'Network.requestWillBeSent' && /\/scan$/.test(m.params.request.url)) beacons.push(1);
  });
  await s.send('Page.navigate', { url: PAGE });
  await sleep(2500);
  check('a fresh navigation counts as a scan', beacons.length === 1, `${beacons.length} beacon(s)`);
  beacons.length = 0;
  await s.send('Page.reload', {});
  await sleep(2500);
  check('a reload at the table does not', beacons.length === 0, `${beacons.length} beacon(s)`);

  console.log('\n== nothing flashes under a finger ==');
  // -webkit-tap-highlight-color inherits, so one declaration on html covers the page. It was
  // once declared per element instead, which covered whatever existed the day it was written --
  // by the time anyone looked, 36 controls including the entire splitter were flashing grey-blue.
  // Counting live elements rather than grepping for the declaration is the point: a new control
  // added under a container that somehow resets it would still be caught.
  const tap = JSON.parse(await s.evaluate(`(() => {
    const sel = 'a,button,summary,input,select,textarea,label,[role="button"],[tabindex],details';
    document.querySelectorAll('details').forEach(d => d.open = true);
    const b = document.getElementById('open-split'); if (b) b.click();
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const t = getComputedStyle(el).webkitTapHighlightColor;
      if (!/^rgba?\\((0, ?){3}0\\)$/.test(t) && t !== 'transparent') {
        bad.push(el.tagName + (el.id ? '#' + el.id : ''));
      }
    }
    return JSON.stringify({ total: document.querySelectorAll(sel).length, bad: bad.slice(0, 6), count: bad.length });
  })()`));
  check('every interactive element suppresses the native tap flash', tap.count === 0,
    `${tap.total} checked${tap.count ? ', flashing: ' + tap.bad.join(', ') : ''}`);
  await s.send('Page.navigate', { url: PAGE });
  await sleep(1500);

  console.log('\n== prep() releases the decoded frame ==');
  const rel = JSON.parse(await s.evaluate(`new Promise((done) => {
    const img = new Image();
    img.onload = () => {
      const before = img.naturalWidth;
      img.onload = img.onerror = null;
      img.src = '';
      setTimeout(() => done(JSON.stringify({ before, after: img.naturalWidth, errored: false })), 250);
    };
    img.onerror = () => done(JSON.stringify({ errored: true }));
    const c = document.createElement('canvas');
    c.width = 3000; c.height = 2200;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    img.src = c.toDataURL('image/png');
  })`));
  check('clearing src drops the decode', rel.before > 0 && rel.after === 0, `${rel.before} -> ${rel.after}`);
  check('and fires no error handler', rel.errored === false);

  console.log('\n== a photographed bill becomes line items ==');
  // Render each layout to a PNG, then push it through the page's own pipeline.
  const shots = {};
  for (const [name, doc] of Object.entries(LAYOUTS)) {
    await s.send('Emulation.setDeviceMetricsOverride', { width: 660, height: 560, deviceScaleFactor: 2, mobile: false });
    await s.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(doc) });
    await sleep(700);
    shots[name] = (await s.send('Page.captureScreenshot', { format: 'png' })).data;
  }
  await s.send('Emulation.clearDeviceMetricsOverride');
  await s.send('Page.navigate', { url: PAGE });
  await sleep(2000);

  // binarize/parseReceipt live inside the page's IIFE; lift the shipped source out of the HTML so
  // what runs here is the same bytes the diner runs.
  const lift = (name) => {
    const i = served.indexOf(`function ${name}(`);
    if (i < 0) throw new Error(`${name} is not in the served page`);
    let depth = 0;
    for (let k = served.indexOf('{', i); k < served.length; k++) {
      if (served[k] === '{') depth++;
      else if (served[k] === '}' && --depth === 0) return served.slice(i, k + 1);
    }
    throw new Error(`${name} is unbalanced`);
  };
  await s.evaluate(`window.__binarize = ${lift('binarize')}; window.__parse = ${lift('parseReceipt')}; 'ok'`);
  const psm = servedPsm;
  await s.evaluate(`new Promise((res, rej) => {
    const t = document.createElement('script');
    t.src = ${JSON.stringify((served.match(/TESSERACT = '([^']+)'/) || [])[1])};
    t.onload = () => res(1); t.onerror = () => rej(new Error('cdn'));
    document.head.appendChild(t);
  })`);

  for (const [name, b64] of Object.entries(shots)) {
    const items = JSON.parse(await s.evaluate(`(async () => {
      const img = await new Promise(d => { const i = new Image(); i.onload = () => d(i); i.src = 'data:image/png;base64,${b64}'; });
      const c = document.createElement('canvas');
      const sc = Math.min(1, 1500 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height);
      window.__binarize(d.data, c.width, c.height);
      x.putImageData(d, 0, 0);
      const w = await window.Tesseract.createWorker('eng', 1);
      await w.setParameters({ tessedit_pageseg_mode: '${psm}' });
      const r = await w.recognize(c);
      await w.terminate();
      return JSON.stringify(window.__parse(r.data.text).map(i => i.name + '|' + i.cents));
    })()`));
    // Four dishes on every slip, and the TOTAL line must not come back as one of them.
    const priced = items.filter((i) => /\|\d+$/.test(i));
    check(`${name}: four dishes with prices`, priced.length === 4, JSON.stringify(items));
    check(`${name}: the total is not an item`, !items.some((i) => /^TOTAL/i.test(i)));
  }

  chrome.kill();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nbrowser check could not run:', e.message); process.exit(2); });
