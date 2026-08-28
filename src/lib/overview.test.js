const test = require('node:test');
const assert = require('node:assert');
const { summarizeOverview } = require('./overview');

const NOW = new Date('2026-08-27T15:00:00Z').getTime();
const DAY = 86400000;
const hoursAgo = (n) => new Date(NOW - n * 3600000).toISOString();
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

const visit = (over) => ({
  id: 'v', rating: 4, comment: '', contact: null, resolved: false, created_at: hoursAgo(1), ...over,
});

test('no visits: average is null, not zero', () => {
  const s = summarizeOverview([], 3, NOW);
  assert.strictEqual(s.average, null);
  assert.strictEqual(s.todayCount, 0);
  assert.strictEqual(s.openIssues, 0);
  assert.deepStrictEqual(s.urgent, []);
});

test('today counts only visits since UTC midnight', () => {
  const visits = [visit({ id: '1', created_at: hoursAgo(2) }), visit({ id: '2', created_at: daysAgo(2) })];
  assert.strictEqual(summarizeOverview(visits, 3, NOW).todayCount, 1);
});

test('average covers every rated visit, not just today', () => {
  const visits = [visit({ id: '1', rating: 2, created_at: daysAgo(5) }), visit({ id: '2', rating: 4, created_at: hoursAgo(1) })];
  assert.strictEqual(summarizeOverview(visits, 3, NOW).average, 3);
});

test('open issues are unresolved and at or below the threshold', () => {
  const visits = [
    visit({ id: '1', rating: 2, resolved: false }),
    visit({ id: '2', rating: 2, resolved: true }), // resolved -- excluded
    visit({ id: '3', rating: 5, resolved: false }), // above threshold -- excluded
  ];
  const s = summarizeOverview(visits, 3, NOW);
  assert.strictEqual(s.openIssues, 1);
  assert.deepStrictEqual(s.urgent.map((v) => v.id), ['1']);
});

test('urgent caps at 3 but openIssues counts all of them', () => {
  const visits = [1, 2, 3, 4].map((n) => visit({ id: String(n), rating: 1, created_at: hoursAgo(n) }));
  const s = summarizeOverview(visits, 3, NOW);
  assert.strictEqual(s.openIssues, 4);
  assert.deepStrictEqual(s.urgent.map((v) => v.id), ['1', '2', '3']);
});
