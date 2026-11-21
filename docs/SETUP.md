# Setup: Google, Upstash, Supabase, Unsplash, Vercel

Everything here is optional: with no keys at all the site still works in **guest + curated mode** (the 8
hand-written destinations, localStorage trips). Each service you add switches on more live features.

Numbers below were checked on **20 November 2026** against Google's *core services pricing list – India*
(effective 1 August 2024). Google changes these; re-check before launch.

---

## 1. Google Maps Platform

### 1.1 Project and billing (India)

1. Open https://console.cloud.google.com/ → project picker → **New project** → name it `trip-architect` → **Create**.
2. **Billing** → **Link a billing account** → **Create billing account**. Choose **India** as the country and pay in INR.
   - Google applies India pricing only if "a large majority of in-region usage" (by location requested or returned)
     is in India, and may disqualify accounts that don't meet that. Heavy use for trips abroad could affect this.
   - Accounts on India pricing can't sign up for subscription plans.
3. Google Maps Platform requires a billing account even when you stay inside the free usage.

### 1.2 Enable the APIs

**APIs & Services → Library**, enable exactly these:

- **Places API (New)** (not the legacy "Places API")
- **Maps JavaScript API** (City Guide map from Phase 3; all maps from Phase 5)
- **Routes API** (optional: only for the "Live travel times" switch in the Itinerary; off by default). If you enable
  it, also add **Routes API** to the server key's API restrictions below.

### 1.3 Create and restrict the two keys

**APIs & Services → Credentials → Create credentials → API key**, twice:

| Key | Application restriction | API restriction | Goes in |
| --- | --- | --- | --- |
| Server key | **None** (Vercel functions don't have fixed IPs) | **Places API (New)** (+ **Routes API** if enabled) | `GOOGLE_PLACES_SERVER_KEY` |
| Browser key | **Websites**: `https://trip-architect-pi.vercel.app/*`, your preview domain with a wildcard, copied from any preview URL (for example `https://trip-architect-*-<your-team>.vercel.app/*`), `http://localhost:5173/*` | **Maps JavaScript API** only | `VITE_GOOGLE_MAPS_BROWSER_KEY` |

The server key is only ever used inside `/api` functions and never reaches the browser. The browser key is public by
design; its referrer restriction is what protects it.

Also create a **Map ID** (needed for the pins on Google Maps). Until you do, the app uses Google's `DEMO_MAP_ID`, which is meant for development only: **Google Maps Platform → Map management → Create map ID** (type JavaScript,
vector) → `VITE_GOOGLE_MAPS_MAP_ID`.

### 1.4 Stay at ₹0: free usage, caps and alerts

Free usage per month, per SKU (India). Requests that ask for rating, review count, price level or opening hours are
billed at the **Enterprise** SKU.

| SKU (India) | Free / month | App's default daily budget | Used for |
| --- | --- | --- | --- |
| Autocomplete Requests | 70,000 | 2,201 | destination search box (sessions themselves are free) |
| Place Details Essentials | 70,000 | 2,201 | destination viewport, address components |
| Place Details Pro | 35,000 | 1,100 | names and coordinates of places saved in trips |
| Text Search Pro | 35,000 | 1,100 | searches without ratings |
| **Text Search Enterprise** | **7,000** | **220** | City Guide lists with ratings, reviews, price, hours |
| **Nearby Search Enterprise** | **7,000** | **220** | map layers (restaurants, cafés…) |
| Nearby Search Pro | 35,000 | 1,100 | ATM and pharmacy layers; nearest station and airport in the hotel comparison (2 calls) |
| **Place Details Enterprise** | **7,000** | **220** | detail drawer (weekday hours, website, phone) |
| **Place Details Enterprise + Atmosphere** | **7,000** | **220** | veg-friendly, editorial summary |
| **Place Details Photos** | **7,000** | **220** | each Google photo shown |
| Routes: Compute Routes Essentials | 70,000 | 2,201 | "Live travel times" (one call per leg of the open day) |
| Dynamic Maps | 70,000 | (counted by Google) | each Google Map load |

**How the cap works.** In Google's console, Places API (New) quotas are **per minute, per method**; there is no
per-day setting for them. So the hard daily cap is enforced by this app: `api/_lib/budget.ts` counts every call
per SKU per UTC day and refuses further calls once the daily budget is reached (the site then shows "Live place data
is resting for today; showing saved and curated info"). The defaults are `floor(monthly free / 31 × 0.975)`, so even
a 31-day month stays under the free usage. **This shared counter needs Upstash (§2)**; without it each Vercel
function instance counts separately and the cap isn't reliable.

In the console, add these safety nets as well:

1. **Per-minute caps.** Google Maps Platform → **Quotas** → choose **Places API (New)** → for each method
   (`SearchText`, `SearchNearby`, `GetPlace`, `AutocompletePlaces`, `GetPhotoMedia`; and Routes API `ComputeRoutes` if enabled) select the
   "requests per minute" row → **Edit** → set **60**. Maps JavaScript API → map loads per minute → **100**.
   (These limit bursts; they don't limit the day.)
2. **Budget alert.** **Billing → Budgets & alerts → Create budget** → scope: this project → amount: **₹100** →
   alerts at 50 %, 90 % and 100 % → email billing admins. Alerts notify you; **they don't stop charges**, which is
   why the app-side cap exists.
3. **Check usage weekly** for the first month: Google Maps Platform → **Metrics**.

To make the app spend less than the defaults, set e.g. `GOOGLE_DAILY_BUDGET_TEXT_SEARCH_ENTERPRISE=150` in Vercel.
Never raise a budget above the default unless you've decided to pay.

### 1.5 Terms you agreed to (what the code does about them)

- Only **place IDs** are stored (indefinitely allowed). Place **coordinates** are cached for at most **30 days**
  (allowed for Places API), with `fetchedAt`, then refreshed or deleted.
- Names, addresses, ratings, review counts, hours, photos and summaries are fetched live and held in memory only.
- Places data shown without a Google Map carries the **Google Maps** attribution; photos credit their authors.
- `/terms` and `/privacy` are public and link Google's terms and privacy policy, as Google requires.

---

## 2. Upstash Redis (shared rate limits and daily Google budget)

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
5. The schema is applied from `supabase/migrations` (added in Phase 8; the README will give the exact command).
6. **Free projects pause after a week without activity.** Phase 8 adds a daily Vercel cron (`/api/cron/keepalive`)
   that queries the database once a day to prevent this. Vercel's Hobby plan allows cron jobs once per day, which is
   enough.

---

## 4. Unsplash (destination photos: Phase 9)

1. https://unsplash.com/developers → **Your apps** → **New application** → accept the API guidelines → name
   "Trip Architect".
2. Copy the **Access Key** → `UNSPLASH_ACCESS_KEY` (server only).
3. New apps start in **demo mode: 50 requests per hour**. Before launch, open the app page → **Apply for
   production** (approval raises it to 1,000 per hour). The application asks for screenshots showing photo credits
   ("Photo by Name on Unsplash" with links) and that downloads are tracked; Phase 9 implements both.

---

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
