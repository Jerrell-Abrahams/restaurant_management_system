// One-time setup: the Supabase Storage bucket restaurant logos upload into.
//
//   node scripts/create_logo_bucket.js
//
// Public read is required, not a preference -- the diner menu page is unauthenticated and its
// HTML response is edge-cached for 60s (src/routes/public.js), so a signed URL baked into that
// cached page would eventually 403 as it expired. Only the service role (held by this backend)
// can write; there is no anon upload policy.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'branding';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: existing } = await admin.storage.getBucket(BUCKET);
  if (existing) {
    console.log(`Bucket "${BUCKET}" already exists -- nothing to do.`);
    return;
  }

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024, // 2MB -- a logo, not a photo gallery
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (error) throw error;
  console.log(`Created public bucket "${BUCKET}" (2MB cap, png/jpeg/webp only).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
