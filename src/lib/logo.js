// Gate on a restaurant logo upload (POST /restaurants/:id/logo, admin.js). Same shape as
// qr.assetError: base64 in the JSON body, magic-byte sniff rather than a try/catch, because
// Buffer.from(..., 'base64') silently discards anything that isn't base64 instead of throwing.

// Comfortably under the 1mb global JSON body limit (server.js) once base64's 4/3 overhead is
// counted -- 750KB of raw bytes is ~1000KB of base64, still short of the ceiling with room for the
// data-URL prefix and JSON quoting. A logo shown at header height never needs more than this.
const MAX_BYTES = 750 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

function sniff(bytes) {
  if (bytes.subarray(0, PNG.length).equals(PNG)) return { ext: 'png', mime: 'image/png' };
  if (bytes.subarray(0, JPEG.length).equals(JPEG)) return { ext: 'jpg', mime: 'image/jpeg' };
  // WEBP has no single fixed prefix: "RIFF" at byte 0, a 4-byte size, then "WEBP" at byte 8.
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/**
 * Returns { error } or { bytes, ext, mime }. A successful upload also needs the sniffed format
 * back out, unlike qr.assetError's plain null-means-valid shape.
 */
function decodeLogo(base64) {
  if (typeof base64 !== 'string' || !base64.trim()) return { error: 'image is required' };

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_BYTES) return { error: 'image is too large for a logo' };

  const format = sniff(bytes);
  if (!format) return { error: 'that file is not a PNG, JPEG or WEBP' };

  return { bytes, ...format };
}

module.exports = { decodeLogo, MAX_BYTES };
