// Turns raw qr_scans + rated visits into the Analytics tab's day-by-day series. See
// lib/overview.js for the equivalent single-number-today view; this is the same data,
// spread across a window instead of collapsed to "today".

const DAY_MS = 86400000;
const WINDOW_DAYS = 30;
// ponytail: fixed South Africa offset (UTC+2, no DST) rather than a per-restaurant timezone
// column -- every restaurant on this product is East Rand (see MEMORY.md restaurant-product-
// shape). Swap for a real timezone column if that ever stops being true.
const SAST_OFFSET_MS = 2 * 3600000;

const mean = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
const dateKey = (iso) => new Date(iso).toISOString().slice(0, 10);
const sastHour = (iso) => new Date(new Date(iso).getTime() + SAST_OFFSET_MS).getUTCHours();

/**
 * @param scans           [{ created_at }] -- qr_scans rows for the window
 * @param visits          [{ rating, created_at }] -- rated visits for the window
 * @param serviceRequests [{ kind, created_at }] -- waiter/bill requests for the window, or [] if
 *                        the restaurant never turned the feature on
 */
function buildAnalytics(scans, visits, serviceRequests = [], { days = WINDOW_DAYS, now = Date.now() } = {}) {
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;

  // One bucket per calendar day, oldest first, zero-filled -- a day nobody scanned must still
  // be a point on the line, not a gap the chart silently closes.
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(todayStart - i * DAY_MS).toISOString().slice(0, 10);
    buckets.set(key, { date: key, scans: 0, ratings: [], waiter: 0, bill: 0 });
  }

  for (const s of scans) {
    const b = buckets.get(dateKey(s.created_at));
    if (b) b.scans += 1;
  }
  for (const v of visits) {
    const b = buckets.get(dateKey(v.created_at));
    if (b) b.ratings.push(v.rating);
  }
  for (const r of serviceRequests) {
    const b = buckets.get(dateKey(r.created_at));
    if (b && (r.kind === 'waiter' || r.kind === 'bill')) b[r.kind] += 1;
  }

  const distribution = [1, 2, 3, 4, 5].map((star) => ({ star, count: 0 }));
  for (const v of visits) distribution[v.rating - 1].count += 1;

  const scansByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const s of scans) scansByHour[sastHour(s.created_at)].count += 1;

  return {
    series: [...buckets.values()].map((b) => ({
      date: b.date,
      scans: b.scans,
      ratings: b.ratings.length,
      // null, not 0 -- a quiet day has no average, and 0 would read as "diners hate it".
      average: round1(mean(b.ratings)),
      waiter: b.waiter,
      bill: b.bill,
    })),
    distribution,
    scansByHour,
    totalScans: scans.length,
    totalRatings: visits.length,
  };
}

module.exports = { buildAnalytics, WINDOW_DAYS };
