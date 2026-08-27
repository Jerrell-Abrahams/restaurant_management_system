const test = require('node:test');
const assert = require('node:assert');
const { shouldSend, since, renderEmail, WINDOW_MS } = require('./alerts');

const NOW = new Date('2026-08-26T20:00:00Z').getTime();
const minsAgo = (n) => new Date(NOW - n * 60000).toISOString();

// --- The debounce ------------------------------------------------------------------------

test('a restaurant that has never been alerted sends immediately', () => {
  assert.strictEqual(shouldSend(null, NOW), true);
});

test('stays quiet inside the fifteen-minute window', () => {
  assert.strictEqual(shouldSend(minsAgo(1), NOW), false);
  assert.strictEqual(shouldSend(minsAgo(14), NOW), false);
});

test('sends again once the window has elapsed', () => {
  assert.strictEqual(shouldSend(minsAgo(15), NOW), true);
  assert.strictEqual(shouldSend(minsAgo(60), NOW), true);
});

test('the boundary is inclusive at exactly the window', () => {
  assert.strictEqual(shouldSend(new Date(NOW - WINDOW_MS).toISOString(), NOW), true);
  assert.strictEqual(shouldSend(new Date(NOW - WINDOW_MS + 1).toISOString(), NOW), false);
});

// The behaviour the whole design exists for: a bad lunch service is one email, not eleven.
test('eleven bad ratings in ten minutes would send once', () => {
  let lastAlert = null;
  let sends = 0;
  for (let i = 0; i < 11; i++) {
    const t = NOW + i * 60000; // one a minute
    if (shouldSend(lastAlert, t)) {
      sends++;
      lastAlert = new Date(t).toISOString();
    }
  }
  assert.strictEqual(sends, 1);
});

// --- The window an alert covers ----------------------------------------------------------

test('a first alert looks back 24 hours, not forever', () => {
  const from = since(null, NOW);
  assert.strictEqual(NOW - from.getTime(), 24 * 60 * 60 * 1000);
});

test('subsequent alerts cover exactly since the last one', () => {
  const prev = minsAgo(40);
  assert.strictEqual(since(prev, NOW).toISOString(), prev);
});

// --- The email ---------------------------------------------------------------------------

const restaurant = { id: 'r1', name: "Mario's Kitchen", alert_threshold: 3 };
const visits = [
  { id: 'v1', rating: 2, comment: 'Waited 45 minutes for our mains.', contact: '0821234567', created_at: minsAgo(20) },
  { id: 'v2', rating: 3, comment: null, contact: null, created_at: minsAgo(35) },
];
const itemRatings = [{ menu_item_id: 'i1', name: 'Calamari', rating: 1, comment: 'Rubbery', created_at: minsAgo(25) }];
const CONSOLE_URL = 'https://res.complexai.co.za/r/r1';
const mail = renderEmail({ restaurant, visits, itemRatings, consoleUrl: CONSOLE_URL });

test('subject names the restaurant and counts both kinds', () => {
  assert.ok(mail.subject.includes("Mario's Kitchen"));
  assert.ok(mail.subject.includes('2 unhappy visits'));
  assert.ok(mail.subject.includes('1 poor dish rating'));
});

test('subject stays readable when only one kind is present', () => {
  const onlyVisits = renderEmail({ restaurant, visits, itemRatings: [], consoleUrl: CONSOLE_URL });
  assert.ok(!onlyVisits.subject.includes('dish'));
  const onlyItems = renderEmail({ restaurant, visits: [], itemRatings, consoleUrl: CONSOLE_URL });
  assert.ok(!onlyItems.subject.includes('visit'));
  assert.ok(onlyItems.subject.includes('1 poor dish rating'));
});

test('the body carries the comment, the dish and a link to the inbox', () => {
  assert.ok(mail.html.includes('Waited 45 minutes'));
  assert.ok(mail.html.includes('Calamari'));
  assert.ok(mail.html.includes('Rubbery'));
  assert.ok(mail.html.includes(CONSOLE_URL));
});

test('a visit with no comment says so rather than rendering blank', () => {
  assert.ok(mail.html.includes('No comment left'));
});

test('contact details are surfaced when the diner asked to be contacted', () => {
  assert.ok(mail.html.includes('0821234567'));
  assert.ok(mail.html.includes('asked to be contacted'));
});

test('restaurant and diner text is escaped', () => {
  const nasty = renderEmail({
    restaurant: { ...restaurant, name: '<script>x</script>' },
    visits: [{ id: 'v', rating: 1, comment: '<img onerror=x>', contact: null, created_at: minsAgo(1) }],
    itemRatings: [],
    consoleUrl: CONSOLE_URL,
  });
  assert.ok(!nasty.html.includes('<script>x</script>'));
  assert.ok(!nasty.html.includes('<img onerror'));
});

// --- COMPLIANCE.md rule 3 ----------------------------------------------------------------
// This email is read at the exact moment an owner is upset and wants to put things right, which
// makes it the likeliest place for someone to helpfully suggest comping a meal. It must not.

// Word boundaries are load-bearing, not tidiness: "comp" is a substring of "complexai.co.za",
// which appears in every one of these emails as the console link. A test that fails on our own
// domain name gets deleted rather than heeded.
const BANNED = [
  /\bdiscounts?\b/i,
  /\bvouchers?\b/i,
  /\brefunds?\b/i,
  /\brewards?\b/i,
  /\bcomp(ed|s|limentary)?\b/i,
  /\bfree\b/i,
  /\bon the house\b/i,
  /\bmake it up to\b/i,
];

const violations = (html) => BANNED.filter((re) => re.test(html)).map(String);

test('the alert never suggests an incentive', () => {
  assert.deepStrictEqual(violations(mail.html), []);
});

// Guards the guard. An earlier version of this file had its word boundaries mangled into literal
// backspace characters, so every pattern matched a byte that never occurs in HTML and the whole
// check passed vacuously. A compliance test that cannot fail is worse than no test, because it
// reads as coverage. This asserts the matcher still bites.
test('the incentive check actually catches a violation', () => {
  const planted = renderEmail({
    restaurant,
    visits: [{ id: 'v', rating: 1, comment: 'Offer them a free voucher next time.', contact: null, created_at: minsAgo(1) }],
    itemRatings: [],
    consoleUrl: CONSOLE_URL,
  });
  const caught = violations(planted.html);
  assert.ok(caught.some((v) => v.includes('voucher')), `expected the voucher pattern to fire, got ${caught}`);
  assert.ok(caught.some((v) => v.includes('free')), `expected the free pattern to fire, got ${caught}`);
});

test('the alert never suggests chasing the review itself', () => {
  for (const phrase of ['remove the review', 'change their review', 'update their review', 'take it down']) {
    assert.ok(!new RegExp(phrase, 'i').test(mail.html), `found "${phrase}"`);
  }
});

test('the email explains why it arrived and how to stop it', () => {
  // An alert with no way out gets marked as spam, which kills every future alert to that address.
  assert.ok(/threshold/i.test(mail.html));
  assert.ok(/Settings/i.test(mail.html));
});

test('batching is stated in the email, so the owner trusts the volume', () => {
  assert.ok(/one email, not several/i.test(mail.html));
});
