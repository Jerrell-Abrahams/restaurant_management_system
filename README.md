# restaurant_management_system

QR menu + diner feedback for restaurants. A paper coaster carries a QR code; scanning it
opens that restaurant's menu, where a diner can rate individual dishes with stars, rate the
visit overall, and — at any score — be offered the restaurant's public Google review form.
Management sees which dishes are working, which are not, and gets emailed when a table was
unhappy.

Compliance rules governing the Google CTA, incentives and POPIA are in
[COMPLIANCE.md](COMPLIANCE.md) and are not optional.

## Where things live

This product spans **two Supabase projects**, and knowing which is which prevents most of
the confusion available here.

| | Project | Holds |
|---|---|---|
| **Data** | complex management (`khkjzsddztzaofbnrkue`) | The `restaurant` schema, and the `auth.users` restaurant owners sign in against |
| **Billing** | subscription management (`ocbdjpfskwcuzdlcryvv`) | `subscriptions` — a *different* Postgres instance |

The complex management project already hosts `funeral` and `auto_repair` alongside the
apartment system's `public`. This is the next schema in that pattern, and it follows the
same conventions.

Because billing is in a different project, **`restaurants.subscription_id` has no foreign
key** and cannot have one. "Is this restaurant paid up?" is an HTTP call to the
subscription API — cached 5 minutes, failing open — in [src/lib/billing.js](src/lib/billing.js).
That mirrors how `/api/site/status` already gates customer websites over there.

### The staff table is the security boundary

A shared Supabase project means a shared `auth.users`. Anyone who can sign into the
apartment system, the funeral app or the auto-repair app is `authenticated` here too — so a
valid token proves nothing. A row in `restaurant.staff` is what grants access, and
[adminAuth.js](src/middleware/adminAuth.js) rejects everyone else with a 403 before any
route runs. `staff.is_admin` separates ComplexAI (sees every restaurant) from a restaurant
owner (sees the one whose `owner_user_id` is theirs).

Staff rows are added in the SQL editor, never through the app, so a compromised console
session cannot write itself an admin.

## Layout

| Path | What |
|---|---|
| `src/` | Express 5 API (CommonJS), deployed via the `api/index.js` rewrite |
| `src/db/schema.sql` | Run once against the complex management project |
| `src/db/*.sql` (the rest) | Additive column migrations, run after `schema.sql` — all re-runnable |
| `docs/subscription-endpoint.js` | Paste-ready route for the *other* repo — see Setup step 5 |
| `admin/` | Vite + React console for `res.complexai.co.za` (its own Vercel project) |
| `scripts/smoke.js` | End-to-end test against the live project |

Two Vercel projects, one repo — mirroring how `subscription_management_system` splits its
root API from its `admin/` SPA.

| Surface | Domain |
|---|---|
| API | `restaurant-management-api-ecru.vercel.app` (Vercel default, no custom domain) |
| Diner pages | `menu.complexai.co.za` (custom domain on the API project) |
| Owner console | `res.complexai.co.za` |

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in.
3. In the **complex management** project: Settings → API → Exposed schemas, add `restaurant`.
   PostgREST serves only the schemas on that list, and the service-role key does not change
   that — without this every query 404s.

   Then Authentication → URL Configuration:

   - **Site URL** → `https://complexai.co.za/reset`. A project has exactly one, and it is the
     fallback every auth email uses — so on a project shared by five products it should point at
     something that belongs to none of them. That page (the `reset/` directory in the
     `complex-ai_website` repo) sends the reset email *and* sets the new password: under PKCE the
     code verifier stays on the origin that asked, so a reset started in this console could not be
     finished on another domain. This console's "Forgot password?" is a plain link to it.
   - **Redirect URLs** → add `https://res.complexai.co.za/**` and `http://localhost:5173/**`.
     Still needed, but only for Google sign-in, which returns to whichever origin started it.
4. Run `src/db/schema.sql` in that project's SQL editor, then run the bootstrap snippet at
   the bottom of it to make yourself an admin. Nothing is reachable until you do, including
   for you. The file is re-runnable. Then run the other `src/db/*.sql` files — each adds
   columns to what `schema.sql` created and is re-runnable too; `npm run smoke` is what tells
   you if one was missed.
5. *(Optional, enables billing gating.)* Paste `docs/subscription-endpoint.js` into
   `src/routes/site.js` in `subscription_management_system`, set `PLATFORM_SECRET` there,
   and set `SUBSCRIPTION_API_URL` + `SUBSCRIPTION_API_SECRET` here. Leave them blank and the
   gate is simply off — every console stays writable, which is the right default for local
   dev and for the window before that endpoint ships.
6. `npm start` (or `npm run dev`). Confirm `GET /health`.
7. The console: `cd admin && npm install`, copy `admin/.env.example` to `admin/.env`, then
   `npm run dev`. It expects the API from step 6 to be running.

### Testing

`npm test` — unit suite (`node --test`, no framework). Pure logic only: money, slugs, the billing
gate's fail-open rules, and seven compliance tripwires on the Google CTA.

`npm run smoke` — end-to-end against the **live** project, with the server running. Creates a
throwaway restaurant, drives the real API and the real diner surface, checks what landed in
Postgres, then deletes everything it made. This is what catches the wiring: grants, schema
exposure, the staff boundary, cookies, upserts. Needs `SMOKE_ANON` and `SMOKE_EMAIL` set.

## Endpoints

All `/api/admin/*` routes take a Supabase session token as a bearer token and require a
`restaurant.staff` row.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/api/admin/me` | Bootstrap: role + visible restaurants |
| GET | `/api/admin/restaurants` | Scoped by role |
| POST | `/api/admin/restaurants` | **Admin only.** Sets the slug — see below |
| GET | `/api/admin/restaurants/:id` | Includes `active` (billing gate) and `qr_target_url` |
| PATCH | `/api/admin/restaurants/:id` | Name + alerts; Place ID, owner and subscription are admin-only |
| GET | `/api/admin/restaurants/:id/menu` | Categories with nested items |
| POST/PATCH/DELETE | `…/categories[/:categoryId]` | Delete 409s if any dish under it has ratings |
| POST/PATCH | `…/items[/:itemId]` | Price, availability, archive/restore |
| GET | `…/feedback` | Visits + the dishes rated on each. `?maxRating=&resolved=` |
| PATCH | `…/visits/:visitId` | Resolve + internal note |
| GET | `…/dishes` | Per-dish stats and the four leaderboards |
| PUT | `…/qr` | **Admin only.** Uploads the SVG + base64 PNG pair |
| GET | `…/qr?format=svg\|png` | Streams the stored coaster QR, `Content-Disposition` set. `404` until uploaded |
| GET | `/api/cron/daily` | Bearer `CRON_SECRET`. Alert sweep, POPIA purge, keep-warm |

Diner surface (unauthenticated):

| Method | Path | Notes |
|---|---|---|
| GET | `/:slug` | Server-rendered menu, ~10-12 KB gzipped, one request |
| POST | `/api/public/:slug/item-rating` | Upserts on (visit, dish) |
| POST | `/api/public/:slug/visit-rating` | Contact captured only at rating ≤ 3 |

### The slug is immutable

`menu.complexai.co.za/<slug>` is printed onto physical coasters that sit on tables for years.
No route updates it — not even for an admin. Renaming a restaurant must never break a
thousand coasters. A restaurant that genuinely needs a new slug needs a new print run.

### QR codes are uploaded, not generated

This app does not draw QR codes. They are generated in `subscription_management_system`
against the `qr_target_url` the API serves on every restaurant — built from `PUBLIC_BASE_URL`,
never assembled in the browser — and uploaded here by an admin, as an SVG + PNG pair in one
request, into `restaurant.qr_codes`. There is deliberately **no fallback generator**: a
fallback that silently produced a different code than the one already on the coasters is the
worst outcome available on a printed object.

Nothing server-side can tell whose code an upload is — decoding it would mean a QR reader and
a PNG decoder for one route. The console renders the uploaded file straight back as a preview
and the admin scans it once with a phone, which tests the whole chain including whether the
URL resolves. Uploads are checked for shape only: SVG markup, PNG magic number, 256 KB cap
each, and any SVG carrying script is rejected rather than sanitized.

### Lapsed subscriptions degrade, they do not switch off

A restaurant whose subscription lapses gets a read-only console (`402` on writes, with
`code: "inactive"`). The diner surface keeps working — menu served, ratings accepted. A
printed coaster showing an error page mid-service is a reputational problem for us, not a
billing lever. The billing gate also fails open on any error: a subscription-API outage must
never dark every restaurant at once.

### Alerts have no scheduler

Alerts fire on submission, debounced against `restaurants.last_alert_at` — more than 15 minutes
since the last one, send everything since; inside the window, stay quiet and let the next
submission carry it. One column, no queue, no per-row flags, and a bad lunch service sends **one
email instead of eleven**. The claim on that column is a compare-and-swap, so two diners
submitting in the same second cannot both send.

Vercel Hobby caps cron at once a day, which could never honour a 15-minute promise — so the daily
job (`/api/cron/daily`) is only a backstop. It sweeps bursts whose last bad rating landed inside a
window and was never followed by another, purges `visits.contact` older than 90 days, and touches
the database so the Supabase free tier does not pause and take every printed coaster down with it.

**Alerts do nothing until `complexai.co.za` is verified in Resend.** An unverified sender will not
deliver to a third party, so every alert would vanish silently. `src/lib/email.js` refuses loudly
rather than pretending, and builds its Resend client lazily so an unconfigured optional feature
can never take the diner surface down with it.

### Ranking honesty

`src/lib/dishes.js` refuses to rank a dish until it has **5 ratings**, and the console always
renders the count beside the average. A dish rated twice at 1.0 is noise, and an owner shown it
as "your worst dish" will act on it. Archived dishes keep their history and leave every
leaderboard. A dish with no prior-window data shows *no* trend rather than a flat one — "no
change" is a claim, and we cannot support it.

## Status

- **Phase 1 — foundation: done.** Schema, staff boundary, billing gate, restaurant + menu CRUD.
- **Phase 2 — diner surface: done.** Server-rendered menu, search + category chips, star ratings, visit rating, Google CTA.
- **Phase 3 — owner console: done.** Login, feedback inbox, menu editor, dish rankings, QR upload + download, settings.
- **Phase 4 — alerts: done.** Debounced email, daily cron, POPIA purge, keep-warm.

114 unit tests (`npm test`) and 65 end-to-end checks (`npm run smoke`), all passing against the
live project. `npm run seed` creates a demo restaurant with 75 days of believable feedback;
`npm run seed -- --drop` removes it.

Remaining before customers: verify `complexai.co.za` in Resend, deploy the two Vercel projects,
and optionally paste `docs/subscription-endpoint.js` into the subscription repo to switch on
billing gating.
