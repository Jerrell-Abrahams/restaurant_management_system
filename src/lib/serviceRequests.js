// Validates and cleans the two diner-supplied fields on a service request: which table, and
// which kind of help. Both are typed by a stranger and rendered on a wall-mounted kitchen
// display, so the rules here exist to keep that screen readable and its dedupe working, not to
// be a general-purpose sanitiser.

const KINDS = ['waiter', 'bill'];
const MAX_LABEL = 12;

// "12" and "Table 12" are the same table to a diner but different strings, and the dedupe index in
// service_requests.sql keys on the exact (lowercased) label -- without this they'd raise two
// separate cards. Stripped before anything else, so it also doesn't eat into the length cap.
const TABLE_PREFIX = /^table\s*/i;

// Trimmed, control characters and newlines stripped (this lands on a shared screen, not a
// database column nobody reads), internal whitespace collapsed, capped short enough that one
// diner's typing can't push every other table's card off the display. Returns null rather than an
// empty string when there is nothing usable left, so callers can `if (!table)` once.
function normalizeTable(value) {
  const cleaned = String(value === null || value === undefined ? '' : value)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    // Anchored to the start, so this only fires once leading whitespace is already gone -- a
    // diner typing " Table 12" must dedupe the same as "12".
    .replace(TABLE_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL);
  return cleaned || null;
}

// null when valid, otherwise the reason -- same contract as slugError/hoursError, straight into a
// 400 body. Only "required" is reachable: normalizeTable already truncates rather than rejecting
// an overlong label, same call as a coaster address that runs long -- keep what fits, don't bounce
// the diner back to retype it.
function tableError(table) {
  return table ? null : 'table is required';
}

// Deliberately no case-folding: `kind` goes straight into a database check constraint, and a
// caller sending "Bill" should get a clean 400 from here, not a raw constraint-violation 500 from
// Postgres.
const isKind = (value) => KINDS.includes(value);

module.exports = { KINDS, MAX_LABEL, normalizeTable, tableError, isKind };
