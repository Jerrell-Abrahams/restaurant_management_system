const test = require('node:test');
const assert = require('node:assert');
const { isActive, clearCache } = require('./billing');

process.env.SUBSCRIPTION_API_URL = 'https://billing.example';
process.env.SUBSCRIPTION_API_SECRET = 'shh';

const reply = (body, ok = true) => async () => ({ ok, json: async () => body });
const boom = () => {
  throw new Error('ECONNREFUSED');
};

test('a restaurant with no subscription is not gated', async () => {
  clearCache();
  // Not "lapsed" -- unbilled. A restaurant is created and its menu built before billing is
  // attached, and locking it out at that moment would make onboarding impossible.
  assert.strictEqual(await isActive(null), true);
  assert.strictEqual(await isActive(undefined), true);
});

test('active subscription is active', async () => {
  clearCache();
  assert.strictEqual(await isActive('sub-1', { fetchImpl: reply({ active: true }) }), true);
});

test('lapsed subscription blocks', async () => {
  clearCache();
  assert.strictEqual(await isActive('sub-2', { fetchImpl: reply({ active: false }) }), false);
});

// --- Fail-open, the whole point of this module -------------------------------------------

test('a 500 from the billing API fails open', async () => {
  clearCache();
  assert.strictEqual(await isActive('sub-3', { fetchImpl: reply({}, false) }), true);
});

test('a network error fails open', async () => {
  clearCache();
  assert.strictEqual(await isActive('sub-4', { fetchImpl: boom }), true);
});

test('an unconfigured gate is off, not closed', async () => {
  clearCache();
  const url = process.env.SUBSCRIPTION_API_URL;
  delete process.env.SUBSCRIPTION_API_URL;
  // Local dev, and the window before the endpoint is deployed. Blocking every write here would
  // make the app unusable on a laptop.
  assert.strictEqual(await isActive('sub-5', { fetchImpl: boom }), true);
  process.env.SUBSCRIPTION_API_URL = url;
});

// --- Caching -----------------------------------------------------------------------------

test('a known answer is cached rather than refetched', async () => {
  clearCache();
  let calls = 0;
  const counting = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ active: false }) };
  };
  assert.strictEqual(await isActive('sub-6', { fetchImpl: counting }), false);
  assert.strictEqual(await isActive('sub-6', { fetchImpl: counting }), false);
  assert.strictEqual(calls, 1);
});

test('a failure is never cached as a fact', async () => {
  clearCache();
  // Fail open once, then the real answer must still be able to land -- otherwise one blip pins a
  // lapsed restaurant open for the whole cache window.
  assert.strictEqual(await isActive('sub-7', { fetchImpl: boom }), true);
  assert.strictEqual(await isActive('sub-7', { fetchImpl: reply({ active: false }) }), false);
});

test('a missing active field is treated as active', async () => {
  clearCache();
  // Only an explicit active:false blocks. A response shape we do not recognise is an integration
  // bug on our side, and an integration bug must not switch off a paying customer.
  assert.strictEqual(await isActive('sub-8', { fetchImpl: reply({}) }), true);
});
