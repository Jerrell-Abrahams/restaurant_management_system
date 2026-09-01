// Turns raw item ratings into the "what's working, what needs work" numbers the console shows.
//
// The whole product promise for management lives in this file, so the honesty rules matter more
// than the arithmetic:
//
//   * A dish rated twice at 1.0 is not "your worst dish", it is noise. Nothing is ranked until it
//     clears MIN_RATINGS, and the count is always rendered next to the average so a 4.9 from six
//     diners never masquerades as a verdict.
//   * Archived dishes keep their history but leave the live rankings. Deleting them would rewrite
//     last month's numbers, which is why routes/admin.js archives rather than deletes.

const MIN_RATINGS = 5;
const WINDOW_DAYS = 30;
const DAY_MS = 86400000;

const mean = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

/**
 * @param items    [{ id, name, archived_at }]
 * @param ratings  [{ menu_item_id, rating, created_at }]
 * @returns one row per item, newest-relevant first, with enough context to be read honestly.
 */
function summarize(items, ratings, { minRatings = MIN_RATINGS, now = Date.now() } = {}) {
  const recentCutoff = now - WINDOW_DAYS * DAY_MS;
  const priorCutoff = now - 2 * WINDOW_DAYS * DAY_MS;

  const byItem = new Map(items.map((i) => [i.id, []]));
  for (const r of ratings) {
    // A rating whose dish is gone from the item list (hard-deleted at some point in the past)
    // is skipped rather than crashing -- the numbers stay readable either way.
    if (byItem.has(r.menu_item_id)) byItem.get(r.menu_item_id).push(r);
  }

  return items.map((item) => {
    const all = byItem.get(item.id) || [];
    const scores = all.map((r) => r.rating);
    const recent = all.filter((r) => new Date(r.created_at).getTime() >= recentCutoff).map((r) => r.rating);
    const prior = all
      .filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= priorCutoff && t < recentCutoff;
      })
      .map((r) => r.rating);

    const recentAvg = mean(recent);
    const priorAvg = mean(prior);

    return {
      id: item.id,
      name: item.name,
      archived: !!item.archived_at,
      count: scores.length,
      average: round1(mean(scores)),
      recentCount: recent.length,
      recentAverage: round1(recentAvg),
      // Only a real comparison counts as a trend. One window empty means "no comparison", not
      // "no change" -- a new dish must not show up as flat, and a dish nobody ordered last month
      // must not read as a collapse.
      trend: recentAvg !== null && priorAvg !== null ? round1(recentAvg - priorAvg) : null,
      // The honesty gate. Everything below this is still returned -- the console shows it under
      // "not enough ratings yet" -- but it never appears in a best/worst list.
      ranked: scores.length >= minRatings,
    };
  });
}

// The four lists the console renders. Archived dishes are excluded from all of them: their history
// is intact and still queryable, but "improve this dish" is meaningless for something off the menu.
function leaderboards(summaries, { limit = 5 } = {}) {
  const live = summaries.filter((s) => s.ranked && !s.archived);
  const byAvg = [...live].sort((a, b) => b.average - a.average || b.count - a.count);

  return {
    best: byAvg.slice(0, limit),
    worst: [...byAvg].reverse().slice(0, limit),
    mostRated: [...live].sort((a, b) => b.count - a.count).slice(0, limit),
    // Negative trends only, steepest first. A dish that improved is good news, not an action.
    slipping: live
      .filter((s) => s.trend !== null && s.trend < 0)
      .sort((a, b) => a.trend - b.trend)
      .slice(0, limit),
    // Surfaced so the console can say "6 dishes need more ratings before they can be ranked"
    // rather than silently hiding them.
    unrankedCount: summaries.filter((s) => !s.ranked && !s.archived).length,
  };
}

// One row per menu section, in menu order (not ranked -- an owner scanning this wants "which
// section needs help", laid out the way the menu itself is). Archived dishes still count: their
// ratings are the section's history, same reasoning as summarize() keeping them in the average.
//
// @param categories [{ id, name }] in display order
// @param items      [{ id, category_id }]
// @param ratings    [{ menu_item_id, rating }]
function categoryBoard(categories, items, ratings) {
  const categoryOf = new Map(items.map((i) => [i.id, i.category_id]));
  const scoresByCategory = new Map(categories.map((c) => [c.id, []]));

  for (const r of ratings) {
    const catId = categoryOf.get(r.menu_item_id);
    if (scoresByCategory.has(catId)) scoresByCategory.get(catId).push(r.rating);
  }

  return categories
    .map((c) => {
      const scores = scoresByCategory.get(c.id);
      return { id: c.id, name: c.name, count: scores.length, average: round1(mean(scores)) };
    })
    // A section with zero ratings isn't "doing badly", it has nothing to show yet -- same
    // honesty rule as an unranked dish, just without a partial state worth rendering.
    .filter((c) => c.count > 0);
}

module.exports = { summarize, leaderboards, categoryBoard, MIN_RATINGS, WINDOW_DAYS };
