require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const cronRoutes = require('./routes/cron');

const app = express();

// Same CORS posture as subscription_management_system's server.js, and for the same reason: Vite
// takes the next free port when 5173 is busy, so a fixed dev allowlist turns a stale process from
// an hour ago into an opaque "Failed to fetch" on 5176. Off production, any localhost port is
// allowed; the deployed API is governed by ADMIN_ORIGIN alone.
const ALLOWED_ORIGINS = (process.env.ADMIN_ORIGIN || 'http://localhost:5173').split(',');
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const originAllowed = (origin) =>
  // No Origin header at all is curl, Vercel's cron and same-origin -- never a browser doing
  // something cross-site, so it is not the allowlist's business.
  !origin ||
  ALLOWED_ORIGINS.includes(origin) ||
  (process.env.NODE_ENV !== 'production' && LOCALHOST.test(origin));

app.use(
  cors({
    origin: (origin, callback) => callback(null, originAllowed(origin)),
    // The QR download route streams a file back and the console reads the filename off this
    // header. Same rule as the documents route in the other project.
    exposedHeaders: ['Content-Disposition'],
  })
);
// 1mb rather than the 100kb default, for one route: the QR upload carries an SVG plus a
// base64 PNG in a single body (src/routes/admin.js). Both files are capped well under this in
// src/lib/qr.js, so an oversized upload fails as a readable 400 rather than a bare 413.
app.use(express.json({ limit: '1mb' }));

// Vercel terminates TLS in front of us, so the client IP is only in X-Forwarded-For. Without this
// express-rate-limit buckets every diner in the country under one proxy address, and the first
// busy restaurant of the evening rate-limits everyone else.
app.set('trust proxy', 1);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Per-IP, in-memory (resets on restart; needs a shared store if this ever runs multi-instance).
// The console is comparatively trusted -- it is behind a Supabase session -- so the cap here is
// about a runaway client, not abuse.
app.use('/api/admin', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use('/api/admin', adminRoutes);

// The diner surface. Unauthenticated by definition -- it is reached by pointing a phone camera at
// a coaster. The cap is per IP and generous enough for a full table sharing one restaurant's wifi
// NAT while still bounding what a single device can submit.
app.use('/api/public', rateLimit({ windowMs: 60 * 1000, limit: 40 }));
// Vercel invokes this as a serverless function per request, so an in-process scheduler would never
// fire reliably. Vercel Cron hits this route instead (see vercel.json), guarded by CRON_SECRET
// which Vercel sends automatically as a bearer token. Mounted before the catch-all below.
app.use('/api/cron', cronRoutes);

// ponytail: no host routing. Both api. and qr. resolve to this app, so a menu is reachable at
// either hostname -- harmless, since the same page is public at both and only qr. is ever printed
// on a coaster. Add host matching if the API host ever serves something the menu must not sit
// beside. The catch-all /:slug is last, and lib/slug.js reserves the names it would shadow.
app.use(publicRoutes);

const port = process.env.PORT || 3000;

// Only bind a port when run directly (`node src/server.js`), not when Vercel requires() this as
// a module from api/index.js.
if (require.main === module) {
  app.listen(port, () => console.log(`restaurant-platform listening on port ${port}`));
}

module.exports = app;
