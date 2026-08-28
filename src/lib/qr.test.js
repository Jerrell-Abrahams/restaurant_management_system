const test = require('node:test');
const assert = require('node:assert');
const { assetError, asset, MAX_BYTES } = require('./qr');

// A real 1x1 PNG. Only the first 8 bytes matter to the validator, but a genuine file keeps the
// test honest about what actually arrives.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';

test('accepts a well-formed pair', () => {
  assert.strictEqual(assetError({ svg: SVG, png: PNG }), null);
});

test('both files are required, together', () => {
  assert.match(assetError({ png: PNG }), /svg is required/);
  assert.match(assetError({ svg: SVG }), /png is required/);
  assert.match(assetError({ svg: '   ', png: PNG }), /svg is required/);
  assert.match(assetError(), /svg is required/);
});

// The upload arrives as JSON, so a non-string here means a malformed client, not a bad file.
test('rejects non-string payloads instead of coercing them', () => {
  assert.match(assetError({ svg: 12345, png: PNG }), /svg is required/);
  assert.match(assetError({ svg: SVG, png: { data: PNG } }), /png is required/);
});

test('rejects a file that is not really an SVG', () => {
  assert.match(assetError({ svg: '<html><body>oops</body></html>', png: PNG }), /does not look like an SVG/);
});

// The load-bearing one: base64 decoding does not throw on garbage, so without the magic-number
// check a JPEG, a PDF or a saved error page would sail through as a "PNG".
test('rejects a non-PNG that is nonetheless valid base64', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64');
  assert.match(assetError({ svg: SVG, png: jpeg }), /not a PNG/);
  assert.match(assetError({ svg: SVG, png: 'not base64 at all!!' }), /not a PNG/);
});

test('rejects scripted SVG rather than sanitizing it', () => {
  const scripted = SVG.replace('<rect', '<script>fetch("//evil")</script><rect');
  assert.match(assetError({ svg: scripted, png: PNG }), /contains script/);
  // Event handlers execute without a <script> tag, so the tag check alone is not enough.
  assert.match(assetError({ svg: SVG.replace('<rect', '<rect onload="alert(1)"'), png: PNG }), /contains script/);
});

test('caps both formats', () => {
  const huge = SVG.replace('<rect', `<rect id="${'x'.repeat(MAX_BYTES)}"`);
  assert.match(assetError({ svg: huge, png: PNG }), /svg is too large/);
  assert.match(assetError({ svg: SVG, png: Buffer.alloc(MAX_BYTES + 1).toString('base64') }), /png is too large/);
});

// SVG is the default because it is what a printer should be handed: anything else, including a
// missing or misspelled format, must not silently hand back a raster.
test('serves SVG unless PNG is asked for by name', () => {
  const row = { svg: SVG, png: PNG };
  assert.strictEqual(asset(row, 'marios', 'png').filename, 'marios-qr.png');
  assert.strictEqual(asset(row, 'marios', 'svg').contentType, 'image/svg+xml');
  assert.strictEqual(asset(row, 'marios', undefined).filename, 'marios-qr.svg');
  assert.strictEqual(asset(row, 'marios', 'PNG').filename, 'marios-qr.svg');
});

test('round-trips the stored bytes unchanged', () => {
  const row = { svg: SVG, png: PNG };
  assert.strictEqual(asset(row, 'marios', 'svg').buffer.toString('utf8'), SVG);
  assert.strictEqual(asset(row, 'marios', 'png').buffer.toString('base64'), PNG);
});

// --- targetUrl -------------------------------------------------------------------------------
// The one string a code is allowed to encode. It reached a real QR as http://localhost:3000/...
// once, so these pin the behaviour that stops that being the silent outcome.

const { targetUrl } = require('./qr');

function withBase(value, fn) {
  const before = process.env.PUBLIC_BASE_URL;
  if (value === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = value;
  try { fn(); } finally {
    if (before === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = before;
  }
}

test('builds the address from PUBLIC_BASE_URL', () => {
  withBase('https://qr.example.co.za', () => {
    assert.strictEqual(targetUrl('marios'), 'https://qr.example.co.za/marios');
  });
});

test('a trailing slash does not become a double slash', () => {
  withBase('https://qr.example.co.za///', () => {
    assert.strictEqual(targetUrl('marios'), 'https://qr.example.co.za/marios');
  });
});

// An unset variable must never resolve to something that looks fine in a browser on the machine
// that generated it. Wrong-but-printable is the expensive failure here.
test('falls back to the production host, never to localhost', () => {
  withBase(undefined, () => {
    const url = targetUrl('marios');
    assert.strictEqual(url, 'https://menu.complexai.co.za/marios');
    assert.ok(!url.includes('localhost'));
  });
});
