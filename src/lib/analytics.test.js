const test = require('node:test');
const assert = require('node:assert');
const { buildAnalytics } = require('./analytics');

const NOW = new Date('2026-08-27T15:00:00Z').getTime(); // 17:00 SAST
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

test('empty window: 30 zero-filled days, no distribution, no crash', () => {
  const { series, distribution, scansByHour, totalScans, totalRatings } = buildAnalytics([], [], [], { now: NOW });
  assert.strictEqual(series.length, 30);
  assert.ok(series.every((d) => d.scans === 0 && d.ratings === 0 && d.average === null && d.waiter === 0 && d.bill === 0));
  assert.deepStrictEqual(distribution.map((d) => d.count), [0, 0, 0, 0, 0]);
  assert.strictEqual(scansByHour.length, 24);
  assert.ok(scansByHour.every((h) => h.count === 0));
  assert.strictEqual(totalScans, 0);
  assert.strictEqual(totalRatings, 0);
});

test('scans and ratings land in the correct day bucket', () => {
  const scans = [{ created_at: daysAgo(0) }, { created_at: daysAgo(0) }, { created_at: daysAgo(5) }];
  const visits = [{ rating: 4, created_at: daysAgo(0) }, { rating: 2, created_at: daysAgo(5) }];
  const { series } = buildAnalytics(scans, visits, [], { now: NOW });

  const today = series[series.length - 1];
  const fiveDaysBack = series[series.length - 6];
  assert.strictEqual(today.scans, 2);
  assert.strictEqual(today.ratings, 1);
  assert.strictEqual(today.average, 4);
  assert.strictEqual(fiveDaysBack.scans, 1);
  assert.strictEqual(fiveDaysBack.average, 2);
});

test('a day with no ratings has a null average, not zero', () => {
  const { series } = buildAnalytics([{ created_at: daysAgo(0) }], [], [], { now: NOW });
  assert.strictEqual(series[series.length - 1].average, null);
});

test('a scan or rating outside the window falls off the front, not into day zero', () => {
  const { series, totalScans } = buildAnalytics([{ created_at: daysAgo(45) }], [], [], { now: NOW });
  assert.ok(series.every((d) => d.scans === 0));
  // Still counted in the raw total the route passed in -- the route is what scopes the query
  // window; this function trusts what it's given.
  assert.strictEqual(totalScans, 1);
});

test('distribution buckets ratings 1-5 across the whole window', () => {
  const visits = [1, 1, 3, 5, 5, 5].map((rating, i) => ({ rating, created_at: daysAgo(i) }));
  const { distribution } = buildAnalytics([], visits, [], { now: NOW });
  assert.deepStrictEqual(distribution.map((d) => d.count), [2, 0, 1, 0, 3]);
});

// --- Service requests ------------------------------------------------------------------------

test('waiter and bill requests land in their own day-bucket columns', () => {
  const requests = [
    { kind: 'waiter', created_at: daysAgo(0) },
    { kind: 'waiter', created_at: daysAgo(0) },
    { kind: 'bill', created_at: daysAgo(0) },
    { kind: 'bill', created_at: daysAgo(3) },
  ];
  const { series } = buildAnalytics([], [], requests, { now: NOW });
  const today = series[series.length - 1];
  const threeDaysBack = series[series.length - 4];
  assert.strictEqual(today.waiter, 2);
  assert.strictEqual(today.bill, 1);
  assert.strictEqual(threeDaysBack.bill, 1);
  assert.strictEqual(threeDaysBack.waiter, 0);
});

test('an unrecognized kind is skipped, not fatal', () => {
  const { series } = buildAnalytics([], [], [{ kind: 'mystery', created_at: daysAgo(0) }], { now: NOW });
  const today = series[series.length - 1];
  assert.strictEqual(today.waiter, 0);
  assert.strictEqual(today.bill, 0);
});

// --- Scans by hour ---------------------------------------------------------------------------

test('scans are bucketed by SAST hour, not UTC hour', () => {
  // 15:00 UTC is 17:00 SAST.
  const { scansByHour } = buildAnalytics([{ created_at: new Date(NOW).toISOString() }], [], [], { now: NOW });
  assert.strictEqual(scansByHour[17].count, 1);
  assert.strictEqual(scansByHour[15].count, 0);
});

test('a scan just before UTC midnight rolls into the next SAST hour bucket', () => {
  // 23:30 UTC is 01:30 SAST the next day.
  const { scansByHour } = buildAnalytics([{ created_at: '2026-08-27T23:30:00Z' }], [], [], { now: NOW });
  assert.strictEqual(scansByHour[1].count, 1);
});
