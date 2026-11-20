# Build Trip Architect: a public travel-planning website

## What you're building

Trip Architect is a travel planning workspace. People explore destinations, compare them, create a trip, and get a fully editable day-by-day itinerary. The itinerary checks itself for unrealistic plans while leaving the user in complete control. Each trip also has a map, a budget and expense tracker with group splits, a stay comparison, a packing list, a readiness score, and export, print and share options.

Product philosophy: **ChatGPT gives you answers. Trip Architect gives you a system to manage your trip.** It is a persistent workspace, not a one-shot itinerary generator.

It must be a real website that anyone can open from a public URL. It needs no accounts, no backend and no paid APIs.

## The reference implementation (source of truth)

`trip-architect-reference.html` is in the project root. It is a complete, working single-file prototype of this exact product. **Read all of it before writing any code.** Treat it as the specification for:

- **Data:** the `DESTS` array: 8 destinations and about 120 places, with coordinates, durations, costs, best times, weekday-only markets, areas, tips, comparison scores and cost tiers. Port it verbatim; do not rewrite or "improve" the facts.
- **Engine:** in the reference's `core.js` section:
  - geometry and timing: `km`, `travelMin`, `cascade`, `tidy`, `routeOrder`, `dayStats`
  - realism checks: `analyzeDay` and `analyzeTrip`, with every rule, threshold and message
  - the starter-itinerary generator: `scorePlace`, `allocDays`, `genPlan`
  - budget, packing and readiness: `estBudget`, `genPack`, `readiness`
- **Fixes:** the one-click fixes in `FIXES`: moveOut, cascade, addTransit, breakAfter, addLunch, route, toEvening, moveTo and setAct.
- **UI, copy and design:** every screen, label, empty state and message, plus the colour tokens, fonts (Fraunces and Manrope) and illustrated SVG destination scenes (`scene()`).

Port the logic faithfully, function by function. Only change something where this prompt tells you to, or where something is clearly a bug. If you find a bug, fix it and list it in `NOTES.md`.

## Tech stack

- Vite, React 18 and TypeScript in strict mode.
- **React Router.** Use real URLs instead of the reference's hash routes:
  - `/`, `/explore`, `/destinations/:id`, `/compare`, `/new` (with optional `?dest=jaipur`), `/trips`
  - `/trips/:id/:tab`, where tab is one of overview, itinerary, map, budget, stays, packing, share
  - `/trips/:id/print`
  - `/shared`
- **Zustand** for state, persisted to `localStorage` (key `trip-architect-v1`) with a schema `version` and a migration hook. Keep a per-trip undo stack of up to 60 snapshots in memory, and support Ctrl/Cmd+Z.
- **Styling:** port the reference CSS into `src/styles/global.css`, keeping the same tokens and class names, with the `light-dark()` colour scheme and a dark mode that follows `prefers-color-scheme`. Don't introduce Tailwind; matching the reference matters more.
- **@dnd-kit** for drag and drop, so it works on touch devices. The reference uses HTML5 drag and drop, which fails on phones. Support:
  - reordering blocks within a day
  - dropping a block on another day in the day rail
  - dragging from the place library or wishlist onto the timeline
  - dropping a block onto the wishlist

  Keep the ↑/↓ buttons as the keyboard and accessibility path.
- **Leaflet and react-leaflet** for the trip map and the destination map. Replace the reference's schematic SVG map with real tiles, but keep its behaviour:
  - numbered pins coloured by day
  - dashed route line per day, in visit order
  - neighbourhood circles from the stay guide
  - day filter chips and layer toggles (planned, wishlist, all library places, stays, areas)
  - a side card for the selected pin with an "Open in Google Maps" link (`https://www.google.com/maps/search/?api=1&query=lat,lng`) and an "Add to Day N" button

  Use OpenFreeMap or OSM-compatible raster tiles, with the tile URL in an env var (`VITE_TILE_URL`) and proper attribution. Read the provider's usage policy, and note in the README that heavy public traffic needs a tile provider whose terms allow it.
- **Vitest and React Testing Library** for tests.
- **lz-string** for share links (see below).

## Things to change from the reference

1. **Remove everything that uses `window.claude` / `claude.use(...)`.** That is the artifact runtime and won't exist on the web.
   - Persistence is `localStorage` only, plus JSON export and import.
   - Downloads use a normal `Blob` with `<a download>`.
   - Printing uses `window.print()` with the reference's print CSS.
   - Copying uses `navigator.clipboard`, with a fallback dialog that has a selectable textarea.
2. **Read-only share links, so other people can see a trip.** On the Share tab, add "Create share link". It compresses the trip JSON with `lz-string` (`compressToEncodedURIComponent`) into `/shared#<data>`. The `/shared` page renders a read-only view of the itinerary, map and budget summary, with a **"Save a copy to my trips"** button. Show a warning if the link is over 8,000 characters. Nothing is sent to a server.
3. **Sample trip.** On a first visit with no trips, create the sample "Jaipur getaway" exactly as the reference does, starting 21 days from today. It must stay out of storage until the user edits it. The reference uses the `sample`/`touched` flags for this.
4. **Remove the sync-status line** in the sidebar. Replace it with "Trips are saved in this browser. Use Share → Download trip file to back up."
5. **Add an About/FAQ page at `/about`.** It explains:
   - estimates are not live prices
   - data is stored only in your browser
   - how to back up a trip
   - map attribution
6. **Add a footer** with a short disclaimer that costs, durations and seasons are planning estimates, plus attribution for the map tiles.

## Suggested structure

```
src/
  data/destinations.ts        # DESTS ported verbatim + typed indexes D and PL
  engine/types.ts             # Trip, Day, Item, Stay, Expense, PackItem, Warning, Fix
  engine/geo.ts               # km, travelMin, travel mode
  engine/time.ts              # fmtT, hm, dayDate, toHHMM/fromHHMM
  engine/schedule.ts          # cascade, cascadeOrdered, tidy, nextSlot, routeOrder, dayStats
  engine/checks.ts            # analyzeDay, analyzeTrip
  engine/fixes.ts             # FIXES as pure (trip, fix) => {trip, message}
  engine/generate.ts          # scorePlace, allocDays, genPlan, buildTrip
  engine/budget.ts            # estBudget, balances + settle-up
  engine/packing.ts           # genPack
  engine/readiness.ts
  store/trips.ts              # zustand store, persistence, undo, all mutations
  components/                 # Scene, DestCard, TripCard, Timeline, Block, DayRail, SidePanel,
                              # WarningCard, Library, Wishlist, TripMap, ItemDialog, Toast, ...
  pages/                      # Home, Explore, Destination, Compare, NewTrip, Trips, Trip/*, Print, Shared, About
  styles/global.css
```

Keep everything in `engine/` pure, with no React and no DOM, so it can be fully unit tested. Use `crypto.randomUUID()` (sliced) for ids.

## Feature checklist (all must work)

- **Home:**
  - hero for the next trip, with a readiness ring and its top 3 issues
  - mood chips that open Explore filtered by mood
  - My trips cards
  - a "Popular right now" section
- **Explore:**
  - search across destinations and place names
  - mood filter and trip-length filter
  - destination cards (best for, ideal stay, estimated budget per person, pace, ease of planning) with Compare toggles, up to 4
  - a "Good this month" line
- **Destination page:**
  - overview and why visit
  - month grid of best times
  - where-to-stay table and a map of all places
  - must-sees, lesser-known places and the rest, each with "Add to my trip" (choose a trip and add to its wishlist, or start a new trip)
  - food, tips and a daily cost table
  - a sample itinerary built with the same generator
- **Compare:**
  - 8 factors plus season fit, each with a weight slider showing its live percentage
  - travel month selector
  - ranked results with a "Best match" label
  - side-by-side table
  - a "Plan <winner>" button
- **New trip wizard (6 steps):**
  - destinations, multi-stop and in order, with a link to Compare for "haven't decided"
  - dates or flexible, number of days, recommended range, too-short and off-season warnings
  - group type, traveller count and names
  - pace and 5 preference sliders
  - budget as total or per person, with a live on-ground estimate
  - review, then create
- **Itinerary Studio**, the most important screen. Port it exactly:
  - day rail with load meters and alert/caution counts
  - hanging-time timeline, with travel connectors between blocks ("3.4 km ride · ~20 min") turning red when the gap is too short
  - "Free 1h 30m · add something" slots that open the library at that time
  - block controls: done, −15m/+15m, ↑/↓, edit, delete
  - edit dialog with title, day, type, start, duration, cost per person, priority, notes, duplicate and move to wishlist
  - day actions: add custom activity, add from library, tidy times, optimise route, clear day
  - side panel tabs: Checks (day and whole-trip warnings with fix buttons), Places (searchable library with category chips and "x km away" from today's plan), Wishlist
  - **Rule:** times never move earlier on their own. Only "Tidy times" closes gaps.
- **Trip map, Budget** (summary stats, editable categories, re-estimate, spending bars, expense form, expense list, who-owes-whom), **Stays** (area guide ranked by average distance to your planned places, saved stays with status, compare table, "Use in budget"), **Packing** (grouped, quantities, add, delete, uncheck all, rebuild suggestions while keeping your own items), **Overview** (readiness tiles, "Needs attention", trip settings, add/remove days, travellers, destination notes, notes, duplicate, delete with confirmation), **Share** (copy WhatsApp itinerary, copy summary, share link, print view, download printable HTML, download and copy JSON), **Trips** page with JSON import by file or paste.
- Toasts with Undo after destructive actions. Escape closes dialogs.

## Acceptance tests (write these in Vitest; they must pass)

Mock "today" so the dates are deterministic.

1. **Sample trip.** Jaipur, 4 days, 2 travellers, balanced pace, mid tier, ₹25,000 budget, with Chokhi Dhani added at 6:00 PM on Day 3.
   - Day 3 produces the alerts "Day 3 looks overloaded" and "Tight transfer to Chokhi Dhani".
   - The trip produces "Planned costs exceed your budget".
   - Applying `moveOut` removes the overload alert from Day 3.
2. **Arrival day.** The generator's Day 1 starts with "Arrive and check in" at 12:00 PM, followed by "Lunch". It contains no places whose best time is the morning, and no food or café stops.
3. **Two-stop trip.** Jaipur + Udaipur, 6 days, starting 2026-12-16.
   - Day 4 has dest `udaipur` and starts with a "Travel to Udaipur" transit block of about 6–7 hours (405 min in the reference).
   - Day 4 has no lunch-break warning, because a long transit block covers midday.
4. **Weekday-only market.** The Anjuna Flea Market scheduled on a non-Wednesday raises a weekday alert. Its fix moves it to a Wednesday in the trip, if there is one.
5. **Transfers.** Two geo items 10 km apart with a 5-minute gap produce a "Tight transfer" warning. The cascade fix resolves it.
6. **Overlaps.** Overlapping items produce an overlap alert, and `cascade` resolves it.
7. **Travel time.** `travelMin(0.3) === 5`, walking applies under 1.5 km, and long-distance trips use the highway speed band.
8. **Settle-up.** One ₹1,200 expense paid by traveller B and split equally between 2 people means A owes B ₹600.
9. **Persistence.** Export to JSON, then import, gives an equivalent trip with a new id.
10. **Share link.** Encoding a trip into a share link and decoding it again gives the same trip.

Also add a Playwright smoke test that visits every route at 1360px and 390px widths. It asserts:
- no console errors
- no horizontal overflow (`scrollWidth <= innerWidth`)
- the itinerary drag-and-drop works with mouse and touch

## Quality bar

- Responsive down to 360px. On phones the layout stacks: the day rail becomes a horizontal scroller, and the side panel moves below the timeline.
- Accessibility:
  - 44px tap targets
  - visible focus
  - labelled inputs
  - dialogs with focus trap
  - `aria-live` for toasts
  - keyboard reorder via ↑/↓
- Lighthouse 90+ for Performance, Accessibility and Best Practices.
- Respect `prefers-reduced-motion`.
- No photos. Keep the SVG destination illustrations, so there are no image-licensing problems.

## Deployment (so anyone can open it)

- Static build (`npm run build`) deployed to **Vercel**, with Netlify as a documented alternative.
- Add the SPA fallback: `vercel.json` rewrites everything to `/index.html` (for Netlify, `public/_redirects` with `/* /index.html 200`).
- Add a GitHub Actions workflow that runs typecheck, lint, Vitest and the build on every push.
- Add Open Graph and Twitter meta tags, a favicon made from the reference logo SVG, `robots.txt` and a basic `sitemap.xml`.
- Write a `README.md` with:
  1. local setup
  2. pushing to a new GitHub repo
  3. importing the repo into Vercel (free tier), and setting a custom domain (optional)
  4. how to add a new destination to `destinations.ts`
  5. the tile-provider note

## How to work

1. Read the reference file fully. Write `PLAN.md`: the module map, which reference functions go where, and anything you'll change and why. Then start building.
2. Build in this order:
   1. data and engine, plus their tests (get all acceptance tests green first)
   2. store and persistence
   3. app shell and routing
   4. Explore, Destination and Compare
   5. wizard
   6. Itinerary Studio
   7. Map
   8. Budget, Stays and Packing
   9. Overview and Share, including share links
   10. Print and About
   11. Playwright smoke tests
   12. deployment files and README
3. After each phase:
   - run `npm run typecheck && npm test`
   - compare against the reference by opening it in a browser
   - commit with a clear message
4. Don't add accounts, a backend, AI calls, paid APIs or live prices. Don't change the destination facts or check thresholds without noting it in `NOTES.md`.
5. When done, give me the exact commands to run it locally and deploy it, and list anything you couldn't finish.
