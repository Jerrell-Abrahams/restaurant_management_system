// QR codes are generated in subscription_management_system and uploaded here by a ComplexAI
// admin. Nothing in this repo draws one. This file is the gate on the way in, and the shaping on
// the way back out.
//
// What it deliberately does NOT check is the failure that actually costs money: that the code
// encodes THIS restaurant's URL and not another's. Decoding server-side would mean pulling in a
// QR reader and a PNG decoder for one route. The console renders both files back as a preview
// instead and an admin scans it once with a phone -- which tests the whole chain, including
// whether the URL actually resolves, in a way decoding the payload never could.

// A black-on-white QR is a few KB in either format. Anything approaching this cap is the wrong
// file, not a big code. Kept well under the JSON body limit in server.js so an oversized upload
// fails as a readable 400 rather than a bare 413.
const MAX_BYTES = 256 * 1024;

// The first 8 bytes of every PNG. Buffer.from(..., 'base64') silently discards anything that
// isn't base64 instead of throwing, so this -- not a try/catch -- is what proves a PNG arrived
// and not a JPEG, or an HTML error page someone saved by mistake.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const MIME = {
  svg: 'image/svg+xml',
  png: 'image/png',
};

/**
 * The one string a QR code for this restaurant is allowed to encode. The generator lives in
 * subscription_management_system, so this is not used to draw anything -- it is served to the
 * console so an admin can copy the exact target instead of assembling it from a guess.
 *
 * Defaulting to the production host rather than localhost is deliberate and load-bearing. A
 * missing PUBLIC_BASE_URL used to surface in the browser as `http://localhost:3000/<slug>`,
 * which looks like a URL, encodes cleanly, and is worthless the moment it leaves the building.
 * Wrong-but-printable is the failure worth designing against here; showing the production URL on
 * a misconfigured dev box is not.
 */
function targetUrl(slug) {
  const base = (process.env.PUBLIC_BASE_URL || 'https://qr.complexai.co.za').replace(/\/+$/, '');
  return `${base}/${slug}`;
}

/**
 * Returns null when the pair is valid, otherwise the reason -- callers turn that straight into a
 * 400 body. Mirrors slugError() in lib/slug.js.
 */
function assetError({ svg, png } = {}) {
  if (typeof svg !== 'string' || !svg.trim()) return 'svg is required';
  if (typeof png !== 'string' || !png.trim()) return 'png is required';

  if (Buffer.byteLength(svg) > MAX_BYTES) return 'svg is too large to be a QR code';
  if (!/<svg[\s>]/i.test(svg)) return 'that file does not look like an SVG';

  // SVG is executable markup, and this one gets stored, re-served to a browser and sent to a
  // printer. Rejected rather than sanitized: a QR code has no legitimate reason to carry script,
  // so anything that does is the wrong file and the admin should know rather than have it
  // quietly rewritten under them.
  if (/<script|javascript:|\son\w+\s*=/i.test(svg)) return 'that SVG contains script and was rejected';

  const bytes = Buffer.from(png, 'base64');
  if (bytes.length > MAX_BYTES) return 'png is too large to be a QR code';
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return 'that file is not a PNG';

  return null;
}

/**
 * Turns a stored row into the { buffer, contentType, filename } the download route sends.
 * Anything that isn't explicitly 'png' is SVG -- that is the format a printer should be given.
 */
function asset(row, slug, format) {
  const isPng = format === 'png';
  return {
    buffer: isPng ? Buffer.from(row.png, 'base64') : Buffer.from(row.svg, 'utf8'),
    contentType: isPng ? MIME.png : MIME.svg,
    filename: `${slug}-qr.${isPng ? 'png' : 'svg'}`,
  };
}

module.exports = { assetError, asset, targetUrl, MAX_BYTES, MIME };
