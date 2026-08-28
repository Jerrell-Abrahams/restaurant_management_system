// Turns rated visits into the Overview dashboard's numbers: what happened today, how the
// average is holding up, and what still needs a response. See lib/dishes.js for the
// equivalent on the menu side -- same honesty rules, smaller surface.

const DAY_MS = 86400000;

const mean = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

/**
 * @param visits    [{ id, rating, comment, contact, resolved, created_at }] -- rated visits only
 * @param threshold alert_threshold: a rating at or below this counts as needing attention
 */
function summarizeOverview(visits, threshold, now = Date.now()) {
  // UTC day boundary rather than the server's local midnight -- deterministic regardless of
  // which timezone the process happens to run in.
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const todayCount = visits.filter((v) => new Date(v.created_at).getTime() >= todayStart).length;

  const open = visits.filter((v) => !v.resolved && v.rating <= threshold);

  return {
    todayCount,
    // null, not 0 -- a restaurant with no visits yet has no average, and 0 would read as "diners
    // hate it" rather than "nobody has rated anything".
    average: round1(mean(visits.map((v) => v.rating))),
    openIssues: open.length,
    // Visits already arrive newest-first from the query, so a slice is the 3 most recent.
    urgent: open.slice(0, 3).map((v) => ({
      id: v.id,
      rating: v.rating,
      comment: v.comment,
      contact: v.contact,
      createdAt: v.created_at,
    })),
  };
}

module.exports = { summarizeOverview };
