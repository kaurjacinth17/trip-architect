# Setup: open data, Upstash, Supabase, Vercel

Everything here is optional. **Maps and live place data need no account or key**: they use open data. Upstash and
Supabase switch on extras (shared rate limits; accounts and collaboration).

---

## 1. Maps and places: open data (no setup)

The site doesn't use Google Cloud. What it uses instead, all free and keyless:

| What | Source | Notes |
|---|---|---|
| Maps | OpenStreetMap tiles (Leaflet) | © OpenStreetMap contributors. OpenStreetMap's own tile server is for light use; for heavy traffic set `VITE_MAP_TILES` to a tile provider. |
| City Guide, hotels, restaurants, cafés, nearby layers, stations | OpenStreetMap via Overpass | Names, cuisine, opening hours, website, phone, wheelchair, vegetarian, official hotel class. **No guest ratings, review counts or prices** exist in open data. Ordered by notability (Wikipedia article, heritage listing, website). |
| Destination search | Photon (komoot) | OpenStreetMap-based search, biased to India. |
| Destination details, addresses | Nominatim | Fair use: about one request a second; answers are cached at the edge for a week. |
| Photos, summaries | Wikipedia / Wikimedia Commons | Credited with photographer and licence. |
| Areas, weather, climate, currency | OpenStreetMap, Open-Meteo, Frankfurter | As before. |
| Navigation | "Open in Google Maps" links | Plain links; no Google account or key. |

All answers are cached at Vercel's edge (a day for lists, a week for details and photos) so the public services
see little traffic. To use your own instances, set `OVERPASS_URL`, `PHOTON_URL` or `NOMINATIM_URL`.

**Saved Google places.** Places added while the site used Google keep their position but show as "Saved place"
(their names were never stored, and there's no Google account to look them up).

**You can remove** `GOOGLE_PLACES_SERVER_KEY`, `VITE_GOOGLE_MAPS_BROWSER_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` and any
`GOOGLE_DAILY_BUDGET_*` variables from Vercel; they're no longer read.

## 2. Upstash Redis (optional: shared rate limits)

1. https://console.upstash.com/ → sign in → **Create database** → type **Redis**, region **ap-south-1 (Mumbai)**
   (closest to Vercel's `bom1`), plan **Free**.
2. Open the database → **REST API** section → copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**.
3. The free plan's command limit is far above what the counters use (a few commands per API call).

---

## 3. Supabase (accounts, sync, collaboration: Phase 8)

1. https://supabase.com/dashboard → **New project** → name `trip-architect`, region **Mumbai (ap-south-1)**,
   a strong database password (store it in a password manager), plan **Free**.
2. **Project Settings → API**: copy the **Project URL** → `VITE_SUPABASE_URL`, the **anon public** key →
   `VITE_SUPABASE_ANON_KEY`, and the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never `VITE_`).
3. **Authentication → Providers**: enable **Email** (magic link) and **Google** (needs an OAuth client from Google
   Cloud → APIs & Services → Credentials → OAuth client ID → Web; authorised redirect URI is shown on the Supabase
   Google provider page).
4. **Authentication → URL configuration**: Site URL `https://trip-architect-pi.vercel.app`; add redirect URLs for
   `http://localhost:5173/**` and your preview domain (for example `https://trip-architect-*-<your-team>.vercel.app/**`).
5. **Apply the schema.** Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
   `supabase/migrations/20261121000001_init.sql` → **Run**. (Or, with the Supabase CLI: `supabase link` then
   `supabase db push`.) It creates the tables, Row Level Security policies, GRANTs, triggers, the Realtime publication
   and a private `receipts` storage bucket (5 MB, images and PDFs).
6. **Free projects pause after a week without activity.** `vercel.json` schedules `/api/cron/keepalive` daily at
   03:17 UTC. It queries the database (keeping it awake) and also clears Google coordinates older than 30 days from
   the database. In Vercel → Settings → Environment Variables add `CRON_SECRET` (any long random string); Vercel sends
   it to the job automatically. Hobby plans allow one run a day, which is enough.
7. Add the three Supabase variables in Vercel for **Production and Preview**, then redeploy. Without them the site
   stays in guest mode exactly as before (no sign-in button).

**What the database stores:** your profile (name, picture, and a UPI ID and phone only if you add them; they're shown
to people in your trips only if you tick "show"), trips, members, invites (a hash of each link's token, never the
token), the plan, stays, packing, expenses, settlements, comments, polls, votes and an activity log. Google places are
stored as place IDs plus coordinates with their fetch time (cleared after 30 days), never names, ratings or photos.

**Testing the policies locally (optional):** with a local Postgres 15+ and the usual `PG*` variables set,
`npm run test:sql` applies the migration to a scratch database and runs `tests/sql/rls.test.sql` (owner, editor,
viewer and outsider checks).

---

## 4. Photos (Phase 9)

Destination and place photos come from Wikipedia / Wikimedia Commons: no key, credited with the photographer and
licence, loaded from Wikimedia (never re-hosted). Places without an article show the illustration instead.

## 4b. Analytics, error reports, feedback (Phase 10)

- **Vercel Web Analytics:** Vercel → your project → **Analytics** → **Enable**. The site already loads it on deployed
  domains (cookie-free page views; free on Hobby within its limits).
- **Sentry (optional):** create a free project at sentry.io (React), copy its DSN into `VITE_SENTRY_DSN` in Vercel.
  Without it, nothing is sent.
- **Feedback button:** set `VITE_CONTACT_EMAIL`; a "Feedback" button then opens an email with the page address.

## 5. Vercel environment variables

Project → **Settings → Environment Variables**. Add each for **Production** and **Preview**:

| Variable | Server or public | Needed from |
| --- | --- | --- |
| `GOOGLE_PLACES_SERVER_KEY` | server | Phase 2 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server | Phase 1 (strongly recommended before any Google key) |
| `VITE_GOOGLE_MAPS_BROWSER_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` | public | Phase 3 (City Guide map) |
| `UNSPLASH_ACCESS_KEY` | server | Phase 9 |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | public | Phase 8 |
| `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` | server | Phase 8 |
| `VITE_SENTRY_DSN` | public | Phase 10 |
| `VITE_SITE_URL`, `VITE_CONTACT_EMAIL` | public | now |

After changing variables, **redeploy** (Deployments → ⋯ → Redeploy): `VITE_` values are baked in at build time.

Check a deployment at `/api/health`: it returns which providers are configured (as true/false, never the keys) and
which daily budgets are used up.
