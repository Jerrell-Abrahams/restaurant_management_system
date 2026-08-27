const test = require('node:test');
const assert = require('node:assert');
const { hoursError, status } = require('./hours');

const at = (day, h, m) => {
  // day: 0=Sun..6=Sat. Anchor on a known Sunday (2024-01-07, UTC) and walk forward. Built as the
  // UTC instant equal to that SAST wall-clock time (SAST = UTC+2) rather than a local Date, so
  // this exercises status()'s own UTC->SAST conversion instead of whatever timezone the machine
  // running the test happens to be in -- otherwise this suite would pass here and fail in CI.
  return new Date(Date.UTC(2024, 0, 7 + day, h - 2, m));
};

// --- hoursError --------------------------------------------------------------------------------

test('null/undefined hours is valid -- "not set yet"', () => {
  assert.strictEqual(hoursError(null), null);
  assert.strictEqual(hoursError(undefined), null);
});

test('accepts a well-formed week, including split shifts and an explicit closed day', () => {
  assert.strictEqual(
    hoursError({ mon: [['11:00', '22:00']], tue: [['11:00', '14:30'], ['18:00', '22:00']], wed: [] }),
    null
  );
});

test('rejects a non-object and an array', () => {
  assert.match(hoursError('mon-fri 9-5'), /must be an object/);
  assert.match(hoursError([]), /must be an object/);
});

test('rejects an unknown day key', () => {
  assert.match(hoursError({ funday: [] }), /not a day/);
});

test('rejects a day whose value is not a list', () => {
  assert.match(hoursError({ mon: '11:00-22:00' }), /must be a list of periods/);
});

test('rejects a period that is not exactly [open, close]', () => {
  assert.match(hoursError({ mon: [['11:00']] }), /not \[open, close\]/);
  assert.match(hoursError({ mon: [['11:00', '14:00', '18:00']] }), /not \[open, close\]/);
});

test('rejects malformed or out-of-range times', () => {
  assert.match(hoursError({ mon: [['11h00', '22:00']] }), /not HH:MM/);
  assert.match(hoursError({ mon: [['25:00', '22:00']] }), /not HH:MM/);
  assert.match(hoursError({ mon: [['11:60', '22:00']] }), /not HH:MM/);
});

test('rejects a zero-length period as a typo, not an all-day or closed signal', () => {
  assert.match(hoursError({ mon: [['11:00', '11:00']] }), /same open and close/);
});

// after-midnight closing (close <= open) is a FEATURE, not an error -- must not be rejected here.
test('does not reject a period that spans midnight', () => {
  assert.strictEqual(hoursError({ thu: [['18:00', '02:00']] }), null);
});

// --- status --------------------------------------------------------------------------------
// Thursday (day 4) runs 18:00 -> 02:00, spanning into Friday. Every other day closed.
const SPANS_MIDNIGHT = { thu: [['18:00', '02:00']] };

test('open mid-period', () => {
  assert.strictEqual(status(SPANS_MIDNIGHT, at(4, 19, 0)).state, 'open');
});

test('closed before opening, and reports the opening time', () => {
  const r = status(SPANS_MIDNIGHT, at(4, 10, 0));
  assert.strictEqual(r.state, 'closed');
  assert.strictEqual(r.until, '18:00');
});

test('closing-soon fires at exactly 30 minutes before close, not a minute later', () => {
  assert.strictEqual(status({ mon: [['11:00', '22:00']] }, at(1, 21, 30)).state, 'closing-soon');
  assert.strictEqual(status({ mon: [['11:00', '22:00']] }, at(1, 21, 29)).state, 'open');
});

// The load-bearing case: after midnight, "today" (Friday) has no hours of its own, but Thursday's
// period is still running. A same-day-only check would wrongly report closed here.
test('still open after midnight, on the FOLLOWING calendar day', () => {
  const r = status(SPANS_MIDNIGHT, at(5, 1, 0)); // Friday 01:00
  assert.strictEqual(r.state, 'open');
  assert.strictEqual(r.until, '02:00');
});

test('closing-soon after midnight, inside the last 30 minutes of the spanning period', () => {
  assert.strictEqual(status(SPANS_MIDNIGHT, at(5, 1, 35)).state, 'closing-soon');
});

test('closed once the spanning period has actually ended', () => {
  assert.strictEqual(status(SPANS_MIDNIGHT, at(5, 2, 0)).state, 'closed');
});

test('a day with an empty period list is closed all day', () => {
  assert.strictEqual(status({ mon: [] }, at(1, 12, 0)).state, 'closed');
});

test('a day absent from the object is closed, same as an empty list', () => {
  assert.strictEqual(status({ tue: [['11:00', '22:00']] }, at(1, 12, 0)).state, 'closed');
});

test('no hours at all is closed', () => {
  assert.strictEqual(status(null, at(1, 12, 0)).state, 'closed');
  assert.strictEqual(status(undefined, at(1, 12, 0)).state, 'closed');
});

test('a split shift: closed in the gap between periods', () => {
  const split = { tue: [['11:00', '14:30'], ['18:00', '22:00']] };
  assert.strictEqual(status(split, at(2, 16, 0)).state, 'closed');
  assert.strictEqual(status(split, at(2, 12, 0)).state, 'open');
  assert.strictEqual(status(split, at(2, 19, 0)).state, 'open');
});

// --- purity, since status() is shipped by toString() into the diner page (see dinerPage.js) ---

test('status references nothing outside its own two parameters', () => {
  const src = status.toString();
  // Loosely: no reference to the outer DAYS/CLOSING_SOON_MINS bindings, no closure captures.
  // The function redeclares both internally -- this just proves that hasn't rotted.
  assert.ok(/var DAYS/.test(src), 'status must declare DAYS internally, not close over the module scope');
  assert.ok(/var CLOSING_SOON_MINS/.test(src), 'status must declare CLOSING_SOON_MINS internally');
});

test('status reports which SAST day it resolved "now" to, for the diner page to highlight', () => {
  assert.strictEqual(status(SPANS_MIDNIGHT, at(1, 12, 0)).day, 'mon');
  // 01:00 on the day *after* Thursday is still Friday by the calendar, even though Thursday's
  // spanning period is what answered the open/closed question.
  assert.strictEqual(status(SPANS_MIDNIGHT, at(5, 1, 0)).day, 'fri');
});
