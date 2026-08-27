// Opening-hours validation and the open/closed badge for the diner page.
//
// status() is written to run in two places from ONE source: server-side in tests, and
// client-side inside the diner page's inline <script> (see dinerPage.js). It has to run on the
// client -- the diner page is served with `Cache-Control: public, max-age=60` (routes/public.js),
// a SHARED cache, so a server-rendered "Open now" could be up to a minute stale and could serve
// one diner's status to a different diner entirely.
//
// ponytail: status() is injected into the page via `${status.toString()}`, so it must be a pure
// function of its own arguments -- no module-scope constants, no closures over anything in this
// file. dinerPage.test.js asserts the injected source actually reaches the client; break the
// purity rule and that test is what catches it, not a runtime error on someone's phone.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Minutes before close that the badge switches from "Open now" to "Closing soon". One named
// constant -- easy to change, nothing else in this file assumes the value.
const CLOSING_SOON_MINS = 30;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Returns null when valid, otherwise the reason -- PATCH takes this straight from a browser as
// arbitrary JSON, and jsonb will store any shape at all without this. Mirrors slugError() /
// assetError() elsewhere in lib/.
function hoursError(hours) {
  if (hours === null || hours === undefined) return null; // "not set yet" is valid
  if (typeof hours !== 'object' || Array.isArray(hours)) return 'hours must be an object keyed by day';

  for (const key of Object.keys(hours)) {
    if (!DAYS.includes(key)) return `"${key}" is not a day (use ${DAYS.join(', ')})`;
    const periods = hours[key];
    if (!Array.isArray(periods)) return `${key} must be a list of periods`;
    for (const p of periods) {
      if (!Array.isArray(p) || p.length !== 2) return `${key} has a period that is not [open, close]`;
      const [open, close] = p;
      if (!TIME_RE.test(open) || !TIME_RE.test(close)) return `${key} has a time that is not HH:MM`;
      // Equal is rejected too: a zero-length period cannot mean "open all day" (that is
      // ["00:00","23:59"], said explicitly) or "closed" (that is an absent period), so it can
      // only be a typo -- and typo'd hours are the whole reason this validator exists.
      if (open === close) return `${key} has a period with the same open and close time`;
    }
  }
  return null;
}

// { state: 'open' | 'closing-soon' | 'closed', until, day } for `now` (a Date). `until` is the
// HH:MM the current or next-relevant period ends/starts, or null when nothing applies today or
// tomorrow's carry-in. `day` is the SAST day key ('mon', 'tue', ...) `now` falls on -- returned
// so the diner page can highlight "today" in the hours table off the same clock the badge used,
// instead of a second, possibly-disagreeing computation.
//
// PURE FUNCTION -- see the file header. Do not reach outside these two parameters.
function status(hours, now) {
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var CLOSING_SOON_MINS = 30;

  // South Africa is a fixed UTC+2 with no DST, ever, so this is exact rather than an
  // approximation and needs no timezone database. Read off the UTC accessors specifically: a
  // diner's phone set to a different timezone must not change what "now" means for a
  // restaurant here, and now.getHours()/getDay() would silently do exactly that.
  var mins = now.getUTCHours() * 60 + now.getUTCMinutes() + 120;
  var dayIdx = now.getUTCDay();
  if (mins >= 24 * 60) {
    mins -= 24 * 60;
    dayIdx = (dayIdx + 1) % 7;
  }
  var today_ = DAYS[dayIdx];

  if (!hours) return { state: 'closed', until: null, day: today_ };

  // A period that opens yesterday and closes after midnight (close <= open) is still running if
  // `now` falls before that close time -- checked first since it takes priority over today's own
  // schedule at e.g. 01:00.
  var yesterday = hours[DAYS[(dayIdx + 6) % 7]] || [];
  for (var i = 0; i < yesterday.length; i++) {
    var yOpen = yesterday[i][0], yClose = yesterday[i][1];
    if (yClose <= yOpen) {
      var yCloseMins = parseInt(yClose.slice(0, 2), 10) * 60 + parseInt(yClose.slice(3), 10);
      if (mins < yCloseMins) {
        return mins >= yCloseMins - CLOSING_SOON_MINS
          ? { state: 'closing-soon', until: yClose, day: today_ }
          : { state: 'open', until: yClose, day: today_ };
      }
    }
  }

  var today = hours[DAYS[dayIdx]] || [];
  for (var j = 0; j < today.length; j++) {
    var open = today[j][0], close = today[j][1];
    var openMins = parseInt(open.slice(0, 2), 10) * 60 + parseInt(open.slice(3), 10);
    var closeMins = parseInt(close.slice(0, 2), 10) * 60 + parseInt(close.slice(3), 10);
    // close <= open means this period runs past midnight, so "still open" has no upper bound
    // today -- it is handled as tomorrow's "yesterday" branch above once the clock rolls over.
    var spansMidnight = closeMins <= openMins;
    var closesAt = spansMidnight ? 24 * 60 : closeMins;

    if (mins >= openMins && mins < closesAt) {
      return mins >= closesAt - CLOSING_SOON_MINS
        ? { state: 'closing-soon', until: close, day: today_ }
        : { state: 'open', until: close, day: today_ };
    }
    if (mins < openMins) {
      return { state: 'closed', until: open, day: today_ };
    }
  }

  return { state: 'closed', until: null, day: today_ };
}

module.exports = { DAYS, CLOSING_SOON_MINS, hoursError, status };
