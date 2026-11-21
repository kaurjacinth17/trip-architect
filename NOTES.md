# Notes: bugs fixed and deliberate changes

The engine was ported function-by-function. `src/engine/parity.test.ts` runs the reference prototype's own
engine code (extracted from `trip-architect-reference.html`) against the port for 76 trip configurations
(every destination × pace × preference extreme, plus multi-stop trips) and checks that the generated plans,
wishlists, budgets, packing lists, warnings, readiness scores and every one-click fix are identical.

**No destination facts and no check thresholds were changed.** `src/data/destinations.raw.ts` is a verbatim copy made by
`scripts/extract-dests.mjs`.

## Bugs found in the reference and fixed

| # | Where | Bug | Fix |
| --- | --- | --- | --- |
| 1 | `nextTrip`, `tBudget` (expense default date), sample trip start date | Used `new Date().toISOString().slice(0,10)`, which is the **UTC** date. In India (UTC+5:30), before 5:30 AM it's still yesterday, so "next trip" and default dates could be off by one. | `isoDate()` / `todayISO()` use the local calendar date. |
| 2 | `analyzeTrip` "No stay booked yet" | Days-until was computed from the current time, not midnight, so it could disagree with the Home hero (e.g. hero "In 21 days", warning "starts in 20 days"). | Both use `daysUntil()`, measured from local midnight. |
| 3 | Sample trip | `saveLocal()` was called right after creating the sample, so it went into storage even though the `sample`/`touched` flags exist to prevent that. | `partialize` drops trips with `sample && !touched`. |
| 4 | Sample trip id | The unsaved sample got a fresh random id on each load, so reloading `/trips/<id>/…` showed "page not found". | The sample uses the stable id `sample-jaipur`. |
| 5 | Sidebar CSS | `.side .tl a` never matched: the trip list's class is `tlist` (`.tl` is the timeline), so the intended 14px/500 style and the ellipsis never applied. | Selector changed to `.side .tlist a`. |
| 6 | `FIXES.breakAfter` | Found the new break with `x.t==='Break'&&x.s===a.s+a.d`, which picks the wrong block if the user already has a block called "Break" at that time. | Inserts the break directly after the item it belongs to. The result is identical in normal cases; the parity test skips only this fix. |
| 7 | Trip map side card | For a **wishlist** pin, "Add to Day N" added a fresh copy from the library and left the wishlist item behind (a duplicate). | Wishlist pins move the wishlist item onto the day, like the Wishlist panel does. |
| 8 | `<main aria-live="polite">` | The whole page was a live region, so screen readers would re-announce every re-render. | Removed; the toast has its own `role="status" aria-live="polite"` region. |
| 9 | Compare page | The two-column grid had no breakpoint, so on phones the cards were squeezed and the "Best match" tag spilled outside its card. | Stacks below 960px; tighter card columns below 600px. |
| 10 | Import | Imported trips could keep a `days` count that didn't match `plan.length`, and missing `prefs` fields. | `normaliseTrip()` derives `days` from the plan and fills defaults. |

## Deliberate changes (requested by the brief)

- No `window.claude` / `claude.use()`: localStorage only (zustand `persist`, key `trip-architect-v1`, `version: 1`,
  with a `migrate` hook that also upgrades the prototype's raw `{trips, ui}` format). Downloads use `Blob` +
  `<a download>`; copy uses `navigator.clipboard` with a textarea dialog fallback; print uses `window.print()`.
- The sync-status line is replaced by "Trips are saved in this browser. Use Share → Download trip file to back up."
- Hash routes became real URLs (see `PLAN.md`); the `plan`/`pack` tabs are `/itinerary` and `/packing`.
- The schematic SVG map became Leaflet with raster tiles in the first port, and Google Maps in upgrade Phase 5. The
  reference rule `.map svg{position:absolute;inset:0;…}` was removed because it broke the map's vector layer.
- HTML5 drag and drop became @dnd-kit (mouse + touch). Touch drags start after a 220 ms press-and-hold so the page
  still scrolls normally. Dropping a library place on the wishlist saves it there (the reference ignored that drop).
- Deleting a trip shows a toast with **Undo** that restores it (the reference said it couldn't be undone).
- New: read-only share links (`/shared#…`), About/FAQ page, footer disclaimer and tile attribution.
- On touch screens (`pointer: coarse`) the compact block controls, chips and small buttons grow to 44px tall. Desktop
  keeps the reference's compact sizes.

## Known limitations

- **Colour contrast:** Lighthouse flags a few reference palette pairs (terracotta text on the blush `tag.t`, the
  terracotta kicker, and the category colours on sand tags) as slightly under 4.5:1. They were kept to match the
  reference design. Accessibility still scores 96–97.
- **Maps** need `VITE_GOOGLE_MAPS_BROWSER_KEY` (since Phase 5). Without it, map tabs show a list of the day's stops
  with Google Maps links instead.
- **Share links** carry the whole trip, so large trips make long links (a warning appears over 8,000 characters).
- The dnd-kit keyboard sensor is deliberately not used: the ↑/↓ buttons are the keyboard path, as in the reference.

## Upgrade notes (phases 2+)

Judgement calls made while implementing the upgrade, so they can be reviewed:

- **Destination names are stored; place names are not.** Google's policy says not to "copy and save business names,
  addresses". A destination record stores the geographic name and region of a city/region/park the user picked
  (needed for the route, print and offline), plus its place ID. Places *inside* a trip (attractions, restaurants,
  hotels) store only their place ID; their names are fetched live and shown with `nameLive`, and are stripped before
  anything is saved, exported or shared. A user-typed title is the user's own data and is stored.
- **Coordinates:** Google coordinates carry `coordsFetchedAt`; refreshed after 25 days, deleted after 30, and
  removed from share links and exported files (they're re-fetched from the place ID when opened).
- **Areas:** Google's policy forbids using Places coordinates for point-in-polygon analysis, so places aren't
  assigned to OSM neighbourhood polygons. OSM areas are listed with their own OSM centres; distances to "your plan"
  are straight-line distances from those centres.
- **Cost table:** built only from the curated guides of the same type (tier-2 = Jaipur + Udaipur, beach = Goa +
  Pondicherry, hill = Manali, pilgrimage = Varanasi + Rishikesh). There is no curated metro or wildlife destination,
  so those types (and everywhere abroad) ask the user for figures rather than showing an invented number.
- **Destination type** is inferred only when unambiguous (national parks → wildlife); otherwise the user picks it.
- **Recommended days** for a live destination are computed live from the Famous list (1 day per ~5 attractions
  rated 4.2+ with 500+ reviews, clamped 1–7) and shown as "suggested"; they aren't stored, so the "usually needs N
  days" check only applies to curated guides or days the user sets.
- **Live starter plans** use default visit durations by place type and no entry costs (the data has none); every
  value is editable.
- **Autocomplete types:** Google allows 5. Chosen: `locality`, `administrative_area_level_1`,
  `administrative_area_level_2`, `natural_feature`, `national_park`. Curated guides are always searchable too.
- **Overpass:** `overpass-api.de` refused connections from the build sandbox, so `/api/areas` falls back to a
  mirror and the URL is configurable (`OVERPASS_URL`). Verify on the preview.

### Bugs found and fixed during the upgrade

- `new URL('places:searchText', base)` parses `places:` as a URL scheme; the Google client now concatenates.
- Drag and drop onto the sticky day rail or the Wishlist tab could miss after the page auto-scrolled mid-drag
  (dnd-kit assumes droppables scroll with the page). Collision now uses their live on-screen position.
- The side panel's tabs could scroll out of view inside the panel during a drag; they're now sticky.

### Phase 3 notes

- **Google Map arrives early.** The City Guide's split view shows Places results on a map, and Google requires that
  map to be a Google Map, so `GMap` (Maps JavaScript API) is used from Phase 3. Without `VITE_GOOGLE_MAPS_BROWSER_KEY`
  the guide is list-only. Without `VITE_GOOGLE_MAPS_MAP_ID` it uses Google's `DEMO_MAP_ID` (development only).
- **Exact-time inserts hold their time.** "Add to day at 1:00 PM" keeps 1:00 PM; only later items move. If an earlier
  item runs past it, that shows as an overlap alert for the user to resolve, rather than the new item silently
  moving (the existing cascade would have pushed it to 1:45 PM).
- **Veg-friendly** is an Enterprise + Atmosphere field, so it isn't in list searches; the filter only matches places
  whose details the user has opened, and says so.
- **Wheelchair entrance and opening hours** are in the list search mask; they don't change the SKU (the search is
  already Enterprise for ratings).
- **"All areas"** runs one first-page search per area only after a confirmation that states the cost in the shared
  daily budget; it stops early (and says so) if the budget runs out. Results per area are cached for 30 minutes in
  memory, so re-running doesn't spend again.
- **Hotels set as a stay** store the place ID only (name live) and a price of ₹0 for the user to fill in: there are no
  live room prices.
- **Badges:** "Editor's pick" and curated "Must-see" need `scripts/link-curated.ts` to have been run; until then only
  the top-10 Famous and Hidden-gem badges appear.

### Phase 4 notes

- **Locks** are honoured by cascade, Tidy, Optimise route (which reorders only the blocks between locks), every
  one-click fix (fixes aren't offered for locked blocks) and shifts. Conflicts with a locked block are alerts with a
  "Move X after it" fix.
- **"Insert after block X"** places the new block directly after X (plus travel time), pushing later blocks back,
  even if the next block would have started sooner. Exact-time inserts hold their time. Locked blocks never move.
- **Opening hours** are Place Details Enterprise data (220/day free), so they're fetched only for the open day's
  Google places on the Itinerary tab and held in memory for 30 minutes. Closures (temporarily/permanently closed)
  come free with the name lookups. Optimise route prefers places that are open on arrival when hours are known.
- **New checks** (thresholds on the About page): opening hours, closures, meals at a closed place, locked-block
  conflicts, first stop / day end 40+ minutes from the night's stay, busy mornings on check-in (>2 h before noon) and
  check-out (>2.5 h) days, blocks outside a day's start/end time, per-day pace. They run in addition to the reference
  rules; the parity suite runs the reference rules alone (`legacyOnly`) and still matches exactly.
- **Live travel times** (optional, off by default, session only): Routes API Essentials (no traffic), one call per
  leg of the open day, used in the gap connectors and the transfer checks; not stored.
- **Travel legs** in the Add bar are simple travel blocks for now; tickets, times and helpers come with Phase 10.
- **Day start/end points** can be the night's stay (default), nowhere, or a dropped pin. Pins are user data. A
  Google hotel's coordinates are never copied into a day's start point (they'd escape the 30-day refresh).

### Phase 5 notes

- **Google Maps everywhere.** Leaflet and OpenStreetMap tiles are gone; the trip map, destination map, shared view,
  custom-place pin and day start/end pins all use Google Maps (`GMap`). Day routes are dashed polylines in visit order;
  neighbourhoods are shaded circles; the night's stay is a house pin.
- **Without a browser key** the map tabs fall back to a list of stops with "Google Maps" links, and pin dropping falls
  back to typed coordinates.
- **Nearby layers** (restaurants, cafés, attractions, ATMs, pharmacies) call Nearby Search (Enterprise, 220/day) only
  when a layer is switched on or "Search this area" is tapped, for the visible area (radius capped at 10 km), one call
  per layer, cached in memory for 30 minutes. Rating, open-now and price filters run on the loaded results.
- **Navigate this day** builds Google Maps directions links (free, no key): start point, stops in order, end point,
  travel mode. Google allows 9 waypoints (3 in mobile browsers), so long days split into consecutive links. Place IDs
  are passed for the origin and destination when known, and for waypoints only when every waypoint has one (Google
  requires the two lists to match).
- **Test fix:** two tests depended on today's date (the sample trip starts 21 days from today); they now pin the date.

### Phase 6 notes

- **Night ranges.** A stay can be set for nights X–Y ("Set as my stay"; night 1 is the night after Day 1). That adds
  a locked Check-in block (the generator's "Arrive and check in" block when it's on that day, else 2 PM) and a locked
  Check-out block (11 AM the day after the last night). Changing the nights moves them; clearing the nights or
  deleting the stay removes them (the arrival block goes back to how it was). Setting a second hotel for overlapping
  nights replaces the first, unless the first is booked. The blocks carry the hotel's place ID and its ≤30-day
  coordinates, so they follow the same refresh, purge and share-link rules as other Google places; they are not sent
  for opening hours.
- **Start and end points.** A day starts at the stay for the night before it and ends at the stay for its own night,
  so a change-over day starts at one hotel and ends at the next. Stays without a night range behave as before
  (dates, then the destination's booked or shortlisted stay).
- **Auto budget lines.** Stay = night by night: booked stays covering the night; else your stay for that night; else
  the cheapest Shortlisted stay with a price; else the destination's planning estimate (labelled), else nothing.
  Price × rooms (rooms default to one per two travellers and can be changed per stay). With no stays saved, the line
  equals the estimate the trip was created with. Activities = entry fees × travellers. "How it's worked out" shows
  the breakdown; ✎ switches a line to Manual (starting from the current figure); "Back to auto" resets it.
- **Migration (schema v3).** Existing trips keep their typed Stay and Activities figures (Manual), so nothing jumps.
  New trips start Auto. Files and share links without the field are treated as Manual.
- **"Use in budget" is gone.** Prices are only ever typed by the user. "Check prices" opens plain searches on Google
  Hotels, Booking.com, Agoda and Expedia with the hotel, city, dates, adults and rooms filled in. Google Hotels has no
  documented date parameters, so the dates go into its search text and it may ask for them again.
- **Hotel compare (up to 4)** in the City Guide's Hotels tab: Google rating and reviews, area, average straight-line
  distance to your plan in that destination (or to the centre), nearest main railway station and airport (two Nearby
  Search Pro calls when the comparison opens, cached for the session), your price and notes if saved, and Check
  prices links.

### Phase 7 notes

- **Expenses tab** (new). Every expense is fully editable: description, amount, currency, category, date and time,
  linked activity and notes; paid by one person or several (amounts must add up); split equally, by exact amounts,
  percentages, shares or adjustments. All maths is in integer paise (`src/engine/expenses.ts`), so splits add up to
  the paisa and balances sum to exactly zero. Rounding remainders go to the payer (the largest payer when there are
  several; the first person sharing it if the payer isn't), and the form says so.
- **Foreign currency:** amounts are split in the expense currency, then each person's share is converted to the ₹
  value fixed at entry (largest-remainder rounding, so the ₹ shares still add up exactly).
- **Edit history** per expense ("Aman changed ₹1,200 → ₹1,450; split equal → exact"), credited to the traveller
  chosen in "I am" (guests) or "You". Deletes are soft: Undo in the toast, or Restore under "Recently deleted".
- **Settling:** "Settle" on an expense records linked payments for chosen people or everyone ("✓ Settled 22 Dec via
  UPI"), and can be un-settled per person. Editing a settled expense offers to settle it again with the new
  amounts. "Record a payment" covers anything else. With several payers, debtors are matched to creditors largest
  first, so every payment is exact.
- **Balances** with a drill-down per person, and a **Simplify debts** switch (on: fewest payments; off: what each
  pair owes from their shared expenses).
- **UPI:** a traveller's UPI ID, if they chose to share it, enables "Pay ₹X via UPI" (`upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`)
  and "I've paid". The app never processes money. UPI IDs stay in the trip on the device and in trip files, and are
  removed from read-only share links.
- **Views:** all, by person, by day, by category, unsettled; CSV export (formula-looking cells are neutralised).
  Spend summary in Share ("Copy spend summary") and in Print.
- **Receipts** need an account (Phase 8, Supabase Storage); guests see a note.
- **Removing a traveller** who is part of a live expense or payment is refused with a message (it used to silently
  move their expenses to the first traveller). Others are renumbered.
- **Migration (schema v4):** trips gain `payments: []`. Existing expenses are left exactly as they were and are read
  as single payer, equal split, unsettled; they gain payers/split fields only when edited.
- The Budget tab keeps the categories and the spending chart and links to Expenses.

### Phase 8 notes

- **Off unless configured.** Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` nothing changes: no sign-in
  button, and the Supabase library isn't even downloaded. Guest mode is unchanged with or without keys.
- **Sign-in:** Google or an email magic link. After sign-in, My trips offers "Move my trips to my account" (each trip
  gets a new id and is uploaded; the browser copy is replaced by the account copy).
- **Schema** (`supabase/migrations/20261121000001_init.sql`): profiles, trips, trip_members (owner/editor/viewer),
  invites, destinations + trip_destinations, days, items (position, version, updated_by, locked), stays, pack_items
  (assigned_to, shared), expenses + expense_payers + expense_shares (settled_at, settlement_id) + settlements, comments,
  polls, poll_options, votes, activity_log (field diffs written by triggers). RLS on every table, explicit GRANTs.
  Contact details of other members are only readable through `trip_people()`, which hides them unless shared.
  Bookings come with Phase 10.
- **Server checks:** invites (create, redeem) and role changes run in `api/invites/*` and `api/members/update` with
  the service-role key; members can't add themselves or change roles directly (RLS forbids it).
- **Sync:** the local store stays the working copy, so every page works the same. Each change is diffed into row
  writes and pushed about 0.35 s later (optimistic). Rows carry a `version`; a write against an old version changes
  nothing, the app re-reads the row, merges fields that don't overlap, and otherwise shows "Riya just changed this:
  Keep theirs / Keep mine / Merge fields". If a save fails, the trip goes back to what the server has and a message
  says so. Other people's changes arrive by Realtime and are merged with any edits you haven't saved yet.
- **Presence:** avatars of who has the trip open (and which day they're on), a coloured outline on blocks someone is
  editing, and a "Riya is editing this block" notice in the edit dialog (a soft lock: you can still save).
- **Comments** on blocks, stays and expenses with @mentions (first name) and resolve; **votes** on wishlist items and
  shortlisted stays; **polls** (wishlist items, stays or free text, optional close time) whose winner becomes a block
  or the stay in one click; **activity feed** filterable by person, Undo for your own changes and Restore for deleted
  blocks (owners). Viewers are read-only but can comment and vote.
- **Receipts:** the storage bucket and its policies exist; uploading from the expense form is not wired yet (Phase 10
  bookings vault adds file uploads).
- **Verified here:** the migration and 28 RLS checks against a local Postgres 16 with a stand-in for Supabase's auth
  schema (`npm run test:sql`); API functions with mocked Supabase; Trip ⇄ row mapping, diffing and merging (unit).
  **Not verified here:** a real Supabase project (auth redirects, Realtime delivery, two people editing live). The
  two-browser Playwright test runs only when `E2E_SUPABASE=1` and a configured preview are available.

### Deployment fix: one API function

Vercel's Hobby plan allows 12 functions per deployment; from Phase 4 the site had 14 (20 by Phase 8), so every
deployment since then failed. All endpoints now live in `api/_routes/` (underscore folders aren't deployed as
functions) and one function, `api/router.ts`, serves them: `vercel.json` rewrites `/api/<path>` to
`/api/router?__path=<path>`. The daily cron keeps its own function (`api/cron/keepalive.ts`), so 2 in total. URLs
are unchanged. A test fails if another deployable file appears in `api/`.

### Feedback batch (after Phase 8) and Phases 9–10

- **Photos (Phase 9):** Google Place Photos for every destination (owner's choice): Explore cards, destination heroes
  and trip cards; edge-cached lookups, credited, never re-hosted; illustrations as fallback. Single hero photo rather
  than a carousel (each extra photo costs from the 220/day budget).
- **More destinations:** 32 popular places across India on Explore (`src/data/popular.ts`: names, states, our mood
  tags and a one-line descriptor). Everything else is live (Google, OSM, Open-Meteo) when a card is opened. No data
  was scraped from Zostel, The Hosteller or elsewhere.
- **New trips start with one destination**; more can be added from Overview → Destinations.
- **Hotels:** "Where are you staying?" prompt on Itinerary and Map; Optimise route starts at the hotel; Stays tab finds
  hotels by name and suggests hotels by Google rating; Google rating, reviews and the hotel's own website are shown
  live (never stored). Booking-site links and the user rating field are gone. Room prices aren't available from Google,
  so the user types the price they're quoted (no invented prices).
- **Maps:** nearby cards open a details drawer (photos, hours, website) with Add to day / as a meal; nearby layer
  buttons explain why they're off when live data isn't available; an OpenStreetMap overview map shows guide places,
  the user's own pins and hand-typed hotels (Google places only on the Google map, per Google's terms).
- **City Guide:** for the eight curated cities, the hand-written places fill every tab when live data is off. An
  empty guide elsewhere means live data isn't available (check `/api/health` → `googlePlaces: true`).
- **Phase 10:** travel legs (locked, next-day start after overnight arrivals, IRCTC/flight/driving links, late-arrival
  check), bookings vault (references travel with the trip; files stay on the device in IndexedDB, not synced), Today
  mode (now/next, leave by, Navigate, mark done, +30/+60 min respecting locks), 16-day forecast on day headers with
  rain/heat checks and forecast-based packing suggestions, .ics export and Google Calendar links, personal needs
  (veg/Jain, wheelchair, children, seniors) shaping guide defaults and checks, per-person and shared packing,
  installable PWA (manifest, icons, service worker caching the app shell only; offline edits to account trips are
  sent when back online), emergency card (112/108, hotel address in English and the state's language from Google,
  nearest hospitals and pharmacies, contacts), templates via link (no expenses or personal data; "Use this
  itinerary"), Vercel Analytics, optional Sentry, feedback button, reduced-motion, 360 px overflow checks, and a
  one-time "What's new" banner.
- **Not done / limits:** template gallery (needs accounts in production), booking files don't sync between devices,
  receipt photo uploads, Lighthouse score not measured here, per-member (rather than per-trip) needs.
