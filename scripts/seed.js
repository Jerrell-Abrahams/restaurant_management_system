// Demo data: one fully-populated restaurant so the console has something real to show.
//
//   npm run seed          create (or recreate) the demo restaurant
//   npm run seed -- --drop  remove it and exit
//
// Everything is scoped to the DEMO_SLUG below and a re-run deletes that restaurant first, so this
// can never touch a real customer. Deterministic: the same seed produces the same ratings every
// time, so a screenshot you take today still matches the data next week.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DEMO_SLUG = 'kasi-flame';
const DEMO_NAME = 'Kasi Flame Grill';
const DAYS = 75; // enough history to fill both 30-day windows, so trends are real
const VISITS = 46;

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const db = admin.schema('restaurant');

// mulberry32 -- tiny, deterministic. The point is reproducibility, not cryptography.
let state = 0x9e3779b9;
function rnd() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);

// A rating drawn around a target mean. Box-Muller for a believable spread -- uniform noise would
// give every dish the same flat shape and the averages would all converge.
function score(mean, spread = 0.8) {
  const g = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  return Math.max(1, Math.min(5, Math.round(mean + g * spread)));
}

// quality = long-run mean. drift = how much better/worse the LAST 30 days are, which is what the
// Dishes page's trend column reads.
const MENU = [
  {
    name: 'Starters',
    items: [
      { name: 'Chicken Livers', description: 'Peri-peri, with garlic roll', price: 'R65', quality: 4.5 },
      { name: 'Calamari Strips', description: 'Lightly floured, lemon aioli', price: 'R89', quality: 2.4 },
      { name: 'Buffalo Wings', description: 'Six wings, blue cheese dip', price: 'R75', quality: 4.1 },
      { name: 'Garlic Snails', description: 'Baked in garlic butter', price: 'R72', quality: 3.6 },
    ],
  },
  {
    name: 'Flame Grill',
    items: [
      { name: 'Pork Ribs 500g', description: 'Basted, with chips and slaw', price: 'R189', quality: 4.7 },
      { name: 'T-Bone 400g', description: 'Flame grilled, with two sides', price: 'R215', quality: 4.3 },
      { name: 'Beef Burger', description: '200g patty, bacon, cheddar', price: 'R125', quality: 4.4, drift: -1.4 },
      { name: 'Chicken Espetada', description: 'Skewered, on the hanging rack', price: 'R165', quality: 4.0 },
      { name: 'Lamb Chops', description: 'Three chops, rosemary salt', price: 'R235', quality: 3.9, available: false },
    ],
  },
  {
    name: 'Sides & Sharing',
    items: [
      { name: 'Slap Chips', description: 'With vinegar and salt', price: 'R38', quality: 4.2 },
      { name: 'Onion Rings', description: 'Beer battered', price: 'R42', quality: 3.1 },
      { name: 'Pap & Sheba', description: 'Traditional, with tomato relish', price: 'R45', quality: 4.6, drift: 0.9 },
      { name: 'Garlic Roll', description: 'Fresh from the oven', price: 'R32', quality: 4.0 },
    ],
  },
  {
    name: 'Desserts',
    items: [
      { name: 'Malva Pudding', description: 'With custard', price: 'R58', quality: 4.8 },
      { name: 'Ice Cream & Chocolate', description: 'Two scoops', price: 'R42', quality: 3.4 },
      { name: 'Dom Pedro', description: 'Whisky or Kahlua', price: 'R55', quality: 4.1 },
    ],
  },
];

const GOOD_COMMENTS = [
  'Ribs were spot on, best in Boksburg.',
  'Great service from the young lady at the bar.',
  'Food came out fast even though it was busy.',
  'Malva pudding is worth the drive.',
  'Been coming here for years, never disappoints.',
  '', '', '', // most happy diners leave nothing, and the inbox should look like that
];

const BAD_COMMENTS = [
  'Waited 45 minutes for our mains, no one came to explain.',
  'Calamari was rubbery, sent it back.',
  'Table was sticky when we sat down.',
  'Ordered medium, came out well done.',
  'Only two waiters on for a full restaurant on a Friday.',
  'Music was far too loud to have a conversation.',
];

const NOTES = [
  'Spoke to the kitchen about timing on Fridays.',
  'Called the customer, offered to have them back. No comp given.',
  'Reminded floor staff about table checks.',
];

const fakeHash = () => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');
const AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
];

async function drop() {
  const { data } = await db.from('restaurants').select('id').eq('slug', DEMO_SLUG).maybeSingle();
  if (!data) return false;
  // Cascades through categories -> items and visits -> item_ratings.
  await db.from('restaurants').delete().eq('id', data.id);
  return true;
}

(async () => {
  if (process.argv.includes('--drop')) {
    console.log(await drop() ? `Removed ${DEMO_SLUG}.` : `Nothing to remove.`);
    return;
  }

  if (await drop()) console.log(`Replacing the existing ${DEMO_SLUG}.`);

  // Hand it to an admin so it shows up for whoever is signed in.
  const { data: owner } = await db.from('staff').select('user_id').eq('is_admin', true).limit(1).maybeSingle();
  if (!owner) {
    console.error('No admin in restaurant.staff yet. Run the bootstrap snippet at the bottom of src/db/schema.sql first.');
    process.exit(1);
  }

  const { data: restaurant, error } = await db
    .from('restaurants')
    .insert({
      name: DEMO_NAME,
      slug: DEMO_SLUG,
      owner_user_id: owner.user_id,
      // A real Place ID would send demo traffic to a real business's review form. This one is
      // deliberately fake: the CTA renders and is inspectable, and nothing lands on a stranger.
      google_place_id: 'ChIJDEMO_not_a_real_place',
      alert_email: null, // nothing should actually email during a demo
      alert_threshold: 3,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const items = [];
  for (const [ci, cat] of MENU.entries()) {
    const { data: category } = await db
      .from('menu_categories')
      .insert({ restaurant_id: restaurant.id, name: cat.name, position: ci })
      .select()
      .single();

    for (const [ii, item] of cat.items.entries()) {
      const cents = Math.round(parseFloat(item.price.replace('R', '')) * 100);
      const { data: row } = await db
        .from('menu_items')
        .insert({
          category_id: category.id,
          name: item.name,
          description: item.description,
          price_cents: cents,
          available: item.available !== false,
          position: ii,
        })
        .select()
        .single();
      items.push({ ...row, quality: item.quality, drift: item.drift || 0 });
    }
  }

  const now = Date.now();
  const visits = [];
  const ratings = [];

  for (let v = 0; v < VISITS; v++) {
    const daysAgo = between(0, DAYS);
    const at = new Date(now - daysAgo * 86400000).toISOString();
    const isRecent = daysAgo <= 30;

    // Most visits are fine; roughly a fifth went wrong. That ratio is what makes the inbox worth
    // opening -- an inbox of nothing but fives teaches an owner to ignore it.
    const unhappy = rnd() < 0.22;
    const rating = unhappy ? score(2.2, 0.6) : score(4.5, 0.6);
    const comment = unhappy ? pick(BAD_COMMENTS) : pick(GOOD_COMMENTS);
    // Only low raters are ever offered the contact field, and only some of them use it.
    const leavesContact = rating <= 3 && rnd() < 0.45;
    // Older complaints have mostly been dealt with; recent ones are what should nag.
    const resolved = rating <= 3 && !isRecent && rnd() < 0.7;

    visits.push({
      restaurant_id: restaurant.id,
      rating,
      comment: comment || null,
      contact: leavesContact ? `08${Math.floor(rnd() * 90000000 + 10000000)}` : null,
      ip_hash: fakeHash(),
      user_agent: pick(AGENTS),
      resolved,
      resolved_note: resolved ? pick(NOTES) : null,
      created_at: at,
    });
  }

  const { data: insertedVisits } = await db.from('visits').insert(visits).select('id, rating, created_at');

  for (const visit of insertedVisits) {
    const isRecent = Date.now() - new Date(visit.created_at).getTime() <= 30 * 86400000;
    const howMany = 1 + Math.floor(rnd() * 3);
    const chosen = new Set();
    while (chosen.size < howMany) chosen.add(pick(items).id);

    for (const itemId of chosen) {
      const item = items.find((i) => i.id === itemId);
      // The dish's own quality, nudged by how the visit went overall -- a diner who waited an hour
      // rates the food harder, which is exactly what happens in real data.
      const mood = (visit.rating - 3.5) * 0.25;
      const drift = isRecent ? item.drift : 0;
      ratings.push({
        visit_id: visit.id,
        menu_item_id: itemId,
        rating: score(item.quality + mood + drift),
        comment: rnd() < 0.12 ? (visit.rating <= 3 ? pick(BAD_COMMENTS) : pick(GOOD_COMMENTS)) || null : null,
        created_at: visit.created_at,
      });
    }
  }

  // Deduped: a visit cannot rate the same dish twice (unique constraint), and the Set above
  // already guarantees it -- this is belt and braces for anyone who changes the loop.
  const seen = new Set();
  const unique = ratings.filter((r) => {
    const key = `${r.visit_id}:${r.menu_item_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const { error: rErr } = await db.from('item_ratings').insert(unique);
  if (rErr) throw new Error(rErr.message);

  const low = visits.filter((v) => v.rating <= 3);
  console.log(`
  ${DEMO_NAME}
  ${items.length} dishes across ${MENU.length} sections
  ${insertedVisits.length} visits over ${DAYS} days (${low.length} at 3 or below, ${low.filter((v) => !v.resolved).length} unresolved)
  ${unique.length} dish ratings

  Console:  /r/${restaurant.id}
  Menu:     ${(process.env.PUBLIC_BASE_URL || 'http://localhost:3000')}/${DEMO_SLUG}

  Remove it with:  npm run seed -- --drop
`);
})().catch((e) => {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
});
