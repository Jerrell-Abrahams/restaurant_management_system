const test = require('node:test');
const assert = require('node:assert');
const { decodeLogo, MAX_BYTES } = require('./logo');

// Real 1x1 files. Only the magic bytes matter to the validator, but genuine files keep the test
// honest about what actually arrives.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
]).toString('base64');

test('accepts a real PNG, JPEG or WEBP', () => {
  assert.strictEqual(decodeLogo(PNG).ext, 'png');
  assert.strictEqual(decodeLogo(JPEG).ext, 'jpg');
  assert.strictEqual(decodeLogo(WEBP).ext, 'webp');
});

test('requires the field', () => {
  assert.match(decodeLogo().error, /required/);
  assert.match(decodeLogo('   ').error, /required/);
});

test('rejects a non-string payload instead of coercing it', () => {
  assert.match(decodeLogo(12345).error, /required/);
});

// The load-bearing one: base64 decoding does not throw on garbage, so without the magic-byte
// check an HTML error page saved by mistake would sail through as an "image".
test('rejects a file that decodes but is not really an image', () => {
  assert.match(decodeLogo(Buffer.from('<html>oops</html>').toString('base64')).error, /not a PNG, JPEG or WEBP/);
  assert.match(decodeLogo('not base64 at all!!').error, /not a PNG, JPEG or WEBP/);
});

test('caps the size', () => {
  assert.match(decodeLogo(Buffer.alloc(MAX_BYTES + 1).toString('base64')).error, /too large/);
});
