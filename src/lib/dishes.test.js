const test = require('node:test');
const assert = require('node:assert');
const { summarize, leaderboards, categoryBoard } = require('./dishes');

const NOW = new Date('2026-08-26T12:00:00Z').getTime();
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

const rating = (itemId, score, days) => ({ menu_item_id: itemId, rating: score, created_at: daysAgo(days) });

const items = [
  { id: 'calamari', name: 'Calamari', archived_at: null },
  { id: 'ribs', name: 'Ribs 500g', archived_at: null },
  { id: 'wings', name: 'Wings', archived_at: null },
  { id: 'oldcurry', name: 'Discontinued Curry', archived_at: daysAgo(10) },
];

test('averages and counts', () => {
  const [calamari] = summarize(items, [
    rating('calamari', 5, 1), rating('calamari', 4, 2), rating('calamari', 5, 3),
  ], { now: NOW });
  assert.strictEqual(calamari.count, 3);
  assert.strictEqual(calamari.average, 4.7);
});

test('a dish with no ratings does not vanish', () => {
  const rows = summarize(items, [], { now: NOW });
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows[0].count, 0);
  assert.strictEqual(rows[0].average, null); // not 0 -- unrated is not a score of zero
  assert.strictEqual(rows[0].ranked, false);
});

// --- The honesty gate --------------------------------------------------------------------

test('a dish rated twice at 1.0 is NOT ranked', () => {
  const rows = summarize(items, [rating('ribs', 1, 1), rating('ribs', 1, 2)], { now: NOW });
  const ribs = rows.find((r) => r.id === 'ribs');
  assert.strictEqual(ribs.average, 1);
  assert.strictEqual(ribs.ranked, false);

  // And it must not appear in the worst list, which is the whole point of the gate.
  const boards = leaderboards(rows);
  assert.strictEqual(boards.worst.length, 0);
  assert.ok(boards.unrankedCount >= 1);
});

test('five ratings clears the gate', () => {
  const five = [1, 2, 3, 4, 5].map((n, i) => rating('ribs', n, i + 1));
  const ribs = summarize(items, five, { now: NOW }).find((r) => r.id === 'ribs');
  assert.strictEqual(ribs.count, 5);
  assert.strictEqual(ribs.ranked, true);
});

test('unranked dishes are counted, not hidden', () => {
  const rows = summarize(items, [rating('ribs', 3, 1)], { now: NOW });
  // Three live dishes are unranked (ribs with 1 rating, calamari and wings with none). The
  // archived one is not counted -- it is off the menu, not awaiting data.
  assert.strictEqual(leaderboards(rows).unrankedCount, 3);
});

// --- Archived dishes ---------------------------------------------------------------------

test('archived dishes keep their history but leave the rankings', () => {
  const five = [5, 5, 5, 5, 5].map((n, i) => rating('oldcurry', n, i + 1));
  const rows = summarize(items, five, { now: NOW });
  const curry = rows.find((r) => r.id === 'oldcurry');
  assert.strictEqual(curry.count, 5, 'history survives archiving');
  assert.strictEqual(curry.archived, true);

  const boards = leaderboards(rows);
  assert.strictEqual(boards.best.length, 0, 'a 5.0 archived dish must not top the best list');
  assert.strictEqual(boards.mostRated.length, 0);
});

// --- Trend -------------------------------------------------------------------------------

test('trend compares the last 30 days against the 30 before', () => {
  const ratings = [
    ...[5, 5, 5, 5, 5].map((n, i) => rating('wings', n, 40 + i)), // prior window: 5.0
    ...[3, 3, 3, 3, 3].map((n, i) => rating('wings', n, 1 + i)),  // recent window: 3.0
  ];
  const wings = summarize(items, ratings, { now: NOW }).find((r) => r.id === 'wings');
  assert.strictEqual(wings.recentAverage, 3);
  assert.strictEqual(wings.trend, -2);
  assert.deepStrictEqual(leaderboards(summarize(items, ratings, { now: NOW })).slipping.map((s) => s.id), ['wings']);
});

test('a brand-new dish has no trend rather than a flat one', () => {
  const ratings = [5, 4, 5, 4, 5].map((n, i) => rating('wings', n, 1 + i));
  const wings = summarize(items, ratings, { now: NOW }).find((r) => r.id === 'wings');
  // Nothing in the prior window to compare against. Null, not 0 -- a new dish showing "no change"
  // would be a claim we cannot support.
  assert.strictEqual(wings.trend, null);
  assert.strictEqual(leaderboards(summarize(items, ratings, { now: NOW })).slipping.length, 0);
});

test('an improving dish is not listed as slipping', () => {
  const ratings = [
    ...[2, 2, 2, 2, 2].map((n, i) => rating('wings', n, 40 + i)),
    ...[5, 5, 5, 5, 5].map((n, i) => rating('wings', n, 1 + i)),
  ];
  const rows = summarize(items, ratings, { now: NOW });
  assert.strictEqual(rows.find((r) => r.id === 'wings').trend, 3);
  assert.strictEqual(leaderboards(rows).slipping.length, 0);
});

test('ratings older than 60 days count toward the average but not the trend', () => {
  const ratings = [
    ...[1, 1, 1, 1, 1].map((n, i) => rating('wings', n, 200 + i)), // ancient
    ...[5, 5, 5, 5, 5].map((n, i) => rating('wings', n, 1 + i)),   // recent
  ];
  const wings = summarize(items, ratings, { now: NOW }).find((r) => r.id === 'wings');
  assert.strictEqual(wings.count, 10);
  assert.strictEqual(wings.average, 3); // lifetime
  assert.strictEqual(wings.recentAverage, 5);
  assert.strictEqual(wings.trend, null, 'nothing in the prior 30-day window');
});

// --- Leaderboards ------------------------------------------------------------------------

test('best and worst are opposite ends of the same ordering', () => {
  const ratings = [
    ...Array(5).fill(0).map((_, i) => rating('calamari', 5, i + 1)),
    ...Array(5).fill(0).map((_, i) => rating('ribs', 2, i + 1)),
    ...Array(6).fill(0).map((_, i) => rating('wings', 4, i + 1)),
  ];
  const boards = leaderboards(summarize(items, ratings, { now: NOW }));
  assert.deepStrictEqual(boards.best.map((b) => b.id), ['calamari', 'wings', 'ribs']);
  assert.deepStrictEqual(boards.worst.map((b) => b.id), ['ribs', 'wings', 'calamari']);
  assert.strictEqual(boards.mostRated[0].id, 'wings'); // 6 beats 5
});

test('a rating for a dish that no longer exists is skipped, not fatal', () => {
  const rows = summarize(items, [rating('ghost-dish', 5, 1), rating('calamari', 4, 1)], { now: NOW });
  assert.strictEqual(rows.find((r) => r.id === 'calamari').count, 1);
});

// --- Category board ------------------------------------------------------------------------

const categories = [{ id: 'starters', name: 'Starters' }, { id: 'mains', name: 'Mains' }, { id: 'desserts', name: 'Desserts' }];
const menuItems = [
  { id: 'calamari', category_id: 'starters' },
  { id: 'ribs', category_id: 'mains' },
  { id: 'wings', category_id: 'starters' },
  { id: 'oldcurry', category_id: 'mains' },
];

test('ratings roll up to their dish\'s category', () => {
  const ratings = [rating('calamari', 5, 1), rating('calamari', 3, 2), rating('wings', 4, 1), rating('ribs', 2, 1)];
  const board = categoryBoard(categories, menuItems, ratings);
  const starters = board.find((c) => c.id === 'starters');
  assert.strictEqual(starters.count, 3);
  assert.strictEqual(starters.average, 4);
  assert.strictEqual(board.find((c) => c.id === 'mains').count, 1);
});

test('archived dishes still count toward their category -- history is not rewritten', () => {
  const board = categoryBoard(categories, menuItems, [rating('oldcurry', 5, 20)]);
  assert.strictEqual(board.find((c) => c.id === 'mains').count, 1);
});

test('a category with zero ratings is omitted, not shown as a zero', () => {
  const board = categoryBoard(categories, menuItems, [rating('calamari', 5, 1)]);
  assert.strictEqual(board.find((c) => c.id === 'desserts'), undefined);
});

test('a rating for a dish outside the given category set is skipped, not fatal', () => {
  const board = categoryBoard(categories, menuItems, [rating('ghost-dish', 5, 1)]);
  assert.deepStrictEqual(board, []);
});
