# Trip Architect upgrade plan

Branch: `upgrade` (Vercel builds a preview per push). `main` stays as the live site until you say merge.
The original port plan is in `docs/PORT-PLAN.md`; bugs fixed in the port are in `NOTES.md`.

## 0. What exists today (explored before planning)

| Area | Files | Notes for the upgrade |
| --- | --- | --- |
| Curated data | `src/data/destinations.raw.ts` (8 cities, 119 places), `destinations.ts` (`D`, `PL`), `constants.ts` | Kept verbatim. Becomes one *source* among several. `D[id]` is used in 21 files; `t.dests` in 16. |
| Engine (pure) | `src/engine/*`: geo, time, schedule, checks, fixes, generate, budget, packing, readiness, share, season | 98 tests, including a parity suite against the reference. All stay green. Locks, hours and new checks are **added**, never changing existing behaviour for unlocked items. |
| Store | `src/store/trips.ts` (zustand persist, key `trip-architect-v1`, `version: 1`, migrate hook, undo 60), `ui.ts`, `toast.ts` | Schema bumps to v2 (Phase 2), v3 (Phase 4/6/7). Guest mode stays localStorage-only. |
| UI | `src/pages/*`, `src/pages/trip/*` (Studio with @dnd-kit, Overview, Budget, Stays, Packing, Share, TripMap), `src/components/*` (MapView = Leaflet) | Leaflet is removed in Phase 5 (Google's terms: Places data on a map must be on a Google Map). |
| Deploy | `vercel.json` rewrites **everything** to `/index.html` | Must exclude `/api/*` in Phase 1 or every function call returns the SPA. |
| Tests | Vitest (engine, parity, store, Studio RTL), Playwright smoke (45 tests) | Playwright gains MSW fixtures for every provider. |

## 1. Compliance findings (read before coding, 20 Nov 2026)

Sources: Google Maps Platform Service Specific Terms; "Policies and attributions for Places API (New)"; Google Maps
Platform core services pricing list – India (effective 1 Aug 2024); Places data fields page.

1. **Storable:** place IDs, indefinitely. **Places latitude/longitude:** may be cached for up to **30 consecutive
   days**, then deleted or refreshed. Everything else (names, addresses, ratings, review counts, hours, photos,
   price level, summaries) must not be stored. Policy text: "don't … copy and save business names, addresses".
2. **Derived content is prohibited**, and the policy names one example that hits this brief directly:
   *"use Places latitude and longitude values as input for point-in-polygon analysis"*. So places can't be assigned
   to OSM area polygons by their Google coordinates. **Plan:** the Area filter uses (a) the area a result was found
   in (each "All areas" query is a Text Search *for that area*), and (b) Google's own `addressComponents`
   (neighbourhood / sublocality) shown live. OSM areas keep their own OSM centroids for "distance to your plan".
3. **Attribution:** "Google Maps" logo (16–19 dp, clear space) or the text "Google Maps" (Roboto/sans, 400,
   #5E5E5E or #1F1F1F, `translate="no"`) wherever Places data appears without a Google Map, in the same container.
   Photos: author name + profile link (can be omitted on thumbnails only if the large view shows it), and a link to
   the source on Google Maps (`googleMapsUri`).
4. **Public Terms of Use and Privacy Policy** that incorporate Google's Terms and Privacy Policy are required →
   `/terms` and `/privacy` (Phase 1).
5. **Cost (India pricing, monthly free usage per SKU):**

   | SKU (India) | Free / month | ≈ per day | Triggered by |
   | --- | --- | --- | --- |
   | Text Search **Enterprise** | 7,000 | 225 | any search asking for rating, review count, price level or hours |
   | Nearby Search **Enterprise** | 7,000 | 225 | map layers (Phase 5) |
   | Place Details **Enterprise** | 7,000 | 225 | detail drawer (hours by weekday, website, phone) |
   | Place Details **Enterprise + Atmosphere** | 7,000 | 225 | `servesVegetarianFood`, `editorialSummary` |
   | Place Details Photos | 7,000 | 225 | each photo URI |
   | Place Details **Pro** | 35,000 | 1,125 | names/coords for saved items (`displayName`, `location`) |
   | Text Search Essentials (IDs only) | unlimited | – | – |
   | Autocomplete requests | 70,000 | 2,250 | destination search (sessions are free) |
   | Dynamic Maps | 70,000 | 2,250 | each Google Map load |

   **Consequence:** with daily caps set below the free usage, the *whole site* gets about **225 live list searches
   a day**. One "All areas" run over 18 areas × up to 3 pages can use 54 of them. The app is built to stay fully
   usable when the cap is hit ("Live place data is resting for today…"), and to spend calls only on explicit user
   actions. If real traffic arrives, staying at ₹0 means most visitors see curated/saved data only; going beyond
   needs a paid decision from you.

## 2. Conflicts with the brief or the current code, and my proposed resolution

| # | Conflict | Proposed resolution (default unless you say otherwise) |
| --- | --- | --- |
| C1 | Itinerary items store `t` (title), `lat`, `lng`, `area`. For Google places the name may not be stored. Print, WhatsApp text, share links and offline mode all need names. | Items gain `gid` (Google place ID) and `coordsFetchedAt`. For Google items the stored title is empty unless the **user** types one; the name is resolved live (Place Details Pro, cached in memory). Print/WhatsApp resolve names at export time. Offline shows "Saved place (connect to load the name)" for unrenamed Google items. Curated and custom items keep their stored titles. |
| C2 | Engine checks need coordinates for travel times. | Google coords are cached ≤30 days with `coordsFetchedAt`, refreshed in the background when opened after 25 days, deleted at 30. |
| C3 | Point-in-polygon area assignment (see finding 2). | Query provenance + `addressComponents`, as above. |
| C4 | `vercel.json` rewrites `/api/*` to the SPA. | Rewrite becomes `/((?!api/).*)`. |
| C5 | Netlify is documented as an alternative; Netlify won't run `/api/*` Vercel functions. | README: Vercel only from now on (Netlify still serves guest mode without live data). |
| C6 | `t.dests: string[]` of curated ids everywhere (`D[id]`). | Phase 2 introduces `DestRef` (`{kind:'curated',id}` / `{kind:'google',placeId}` / `{kind:'custom',id}`) and a `useDest()` resolver; curated ids keep working through migration v2. |
| C7 | Brief asks for "all hotels" per city. Google returns at most 60 results per query. | "All areas" mode (one query per OSM area, on request only) with an honest count, as specified. |
| C8 | Open-Meteo free use is non-commercial; Vercel Hobby limits cron to once a day. | Daily keep-alive cron fits. Re-check Open-Meteo's and Vercel's terms if you monetise. |
| C9 | Collaboration needs a server, but guest mode must not change. | A `TripRepository` interface: `LocalRepository` (today's zustand store) and `SupabaseRepository` (Phase 8). Engine stays pure; UI talks to the repository. |
| C11 | Brief asks for per-API **daily** quota caps in Google's console. Places API (New) quotas are **per minute, per method** (the console offers no per-day value for them). | The server enforces a **daily budget per Google SKU** (`api/_lib/budget.ts`), stored in Upstash Redis so all function instances share it (in-memory fallback is per instance, fine for dev only). Console: conservative per-minute caps + a ₹ budget alert (alerts notify; they don't stop billing). |
| C10 | Lighthouse colour-contrast flags from the reference palette. | Phase 10 asks for WCAG AA, so `--terra` text/tag pairs get darkened slightly (noted in NOTES.md). |

## 3. Phases → files

Shared new dependencies: `zod`, `@tanstack/react-query`, `@vis.gl/react-google-maps`, `@supabase/supabase-js`,
`msw` (tests), `@upstash/ratelimit` + `@upstash/redis` (optional at runtime), `@sentry/react`, `@vercel/analytics`.

### Phase 1: Server foundations and cost safety
- `api/_lib/http.ts` (typed errors, JSON responses, CORS same-origin), `api/_lib/validate.ts` (zod),
  `api/_lib/ratelimit.ts` (Upstash if `UPSTASH_*`, else in-memory), `api/_lib/dedupe.ts` (in-flight dedupe ≤60 s),
  `api/_lib/quota.ts` (detects Google `RESOURCE_EXHAUSTED`/429 → `quota_exhausted` error), `api/_lib/env.ts`.
- `api/health.ts` (also the cron keep-alive target later).
- `vite.config.ts`: dev middleware so `npm run dev` serves `/api/*` from the same handlers.
- `src/lib/providers/types.ts`: `PlacesProvider`, `AreasProvider`, `SummaryProvider`, `ClimateProvider`,
  `PhotoProvider`; `src/lib/providers/curated.ts` (`CuratedOnlyProvider`); `src/lib/api.ts` (fetch client, error
  mapping); `src/lib/query.ts` (TanStack Query client, memory only); `src/hooks/useDebounced.ts` (400 ms).
- `src/components/LiveDataBanner.tsx` ("Live place data is resting for today…").
- `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`; footer links.
- `docs/SETUP.md`, `.env.example` (all keys), `vercel.json` (api exclusion, cron later).
- Tests: `api/**/*.test.ts` (zod rejection, rate limit, dedupe, quota mapping, no secrets in responses).

### Phase 2: Any destination
- `api/places/autocomplete.ts` (Autocomplete (New), session tokens, India bias, types incl. localities, admin areas,
  natural features, parks), `api/places/destination.ts` (details for a chosen destination: viewport, type,
  timezone/utcOffset, country → currency), `api/summary.ts` (Wikipedia REST), `api/climate.ts` (Open-Meteo archive →
  monthly normals, edge-cached), `api/fx.ts` (Frankfurter).
- `src/engine/destinations.ts` (`DestRef`, resolver, custom destination), `src/engine/bestMonths.ts` (documented
  rule), `src/engine/recDays.ts`, `src/data/costTables.ts` (Indian cost table by destination type),
  `src/engine/currency.ts`.
- `src/components/DestinationSearch.tsx` (used in Explore, wizard, Overview, "Add destination", day City picker),
  `src/pages/Destination.tsx` becomes curated-or-auto, `src/pages/trip/Destinations.tsx` (add/remove/reorder/insert
  with day-reassignment preview), generator for any destination in `src/engine/generateLive.ts`.
- `scripts/link-curated.ts` → `src/data/curatedPlaceIds.ts` (IDs only).
- Store migration v2.

### Phase 3: City Guide
- `api/places/search.ts`, `api/places/[id].ts`, `api/places/photo.ts`, `api/areas.ts` (Overpass, 7-day edge cache).
- `src/engine/placeTypes.ts` (type → category, default durations), `src/engine/ranking.ts` (Bayesian), `src/engine/placeFilters.ts`.
- `src/pages/guide/*` (tabs, URL-synced filters, cards, detail drawer, split view, Areas tab, All-areas runner).

### Phase 4: Full itinerary customisation
- Engine: `locked` on items honoured by `cascade`, `tidy`, `routeOrder`, fixes, shift; `src/engine/hours.ts`
  (opening-hours checks incl. after-midnight and 24 h); new checks in `checks.ts` (append-only); `src/engine/days.ts`
  (insert, delete, duplicate, swap, reorder days); `src/engine/bulk.ts`.
- UI: `AddBar`, full `ItemDialog`, multi-select, day controls, draggable day rail.

### Phase 5: Google Maps
- `src/components/GMap.tsx` (`@vis.gl/react-google-maps`), nearby layers via `api/places/nearby.ts`, navigation links
  in `src/engine/navigate.ts`. Leaflet removed.

### Phase 6: Hotels, stays, automatic budget
- Hotel compare, "Set as my stay for nights X–Y" (locked check-in/out), "Check prices" search links,
  `src/engine/budget.ts` auto/manual lines; "Use in budget" removed.

### Phase 7: Splitwise-grade expenses
- `src/engine/expenses.ts` (payers, split types, paisa rounding, settlements, simplify, balances = 0, history),
  `src/pages/trip/Expenses/*`, UPI links, CSV export, migration from v1 expenses.

### Phase 8: Accounts and collaboration
- `supabase/migrations/*.sql` (schema, RLS, GRANTs), `api/invites/*.ts`, `api/cron/keepalive.ts`,
  `src/lib/repo/{local,supabase}.ts`, realtime, presence, comments, votes, polls, activity feed.

### Phase 9: Photos
- `api/photos/unsplash.ts`, `src/data/photos.ts` (IDs only), Google Place Photos for others, `src/components/Photo.tsx`.

### Phase 10: Extras
- Travel legs, bookings vault, Today mode, weather, `.ics`, needs filters, per-person packing, PWA, emergency card,
  templates, Sentry, Vercel Analytics, feedback, accessibility pass.

## 4. Per-phase routine

`npm run typecheck && npm run lint && npm test && npm run build` → commit → `git push origin upgrade` → note what
to check on the Vercel preview. No merge to `main` until you approve.
