# Trip Architect: build plan

Source of truth: `trip-architect-reference.html` (single-file prototype). This plan maps every
reference function to its new home and lists every intentional change.

## Module map

| New module | Reference functions / constants |
| --- | --- |
| `src/data/destinations.raw.ts` | `DESTS`, extracted verbatim by `scripts/extract-dests.mjs` (no hand edits) |
| `src/data/destinations.ts` | `D`, `PL` indexes and `d.pl` normalisation (the `for(const d of DESTS)` loop) |
| `src/data/constants.ts` | `CATS`, `NONACT`, `BEST`, `MOODS`, `BCATS`, `PACE`, `DAYC`, `FACTORS`, `GROUPS`, `MONTHS`, `WD`, `WDL` |
| `src/engine/types.ts` | Types for `Trip`, `Day`, `Item`, `Stay`, `Expense`, `PackItem`, `Warning`, `Fix`, `Place`, `Dest` |
| `src/engine/util.ts` | `uid` (now `crypto.randomUUID().slice(0,8)`), `clone`, `sum`, `up5`, `up15`, `r500`, `inr`, `plural`, `slug`, `todayISO` |
| `src/engine/geo.ts` | `km`, `travelMin`, `mode`, `geo`, `pathKm`, `nnKm`, `trm` |
| `src/engine/time.ts` | `hm`, `fmtT`, `toHHMM`, `fromHHMM`, `dayDate`, `fmtD` |
| `src/engine/schedule.ts` | `sortDay`, `cascade`, `cascadeOrdered`, `tidy`, `nextSlot`, `routeOrder`, `dayStats`, `isAct`, `travellers`, `itemFromPlace`, `customItem`, `startFor`, `placeOnDay`, `lightest`, `findItem`, `pullItem` |
| `src/engine/checks.ts` | `analyzeDay`, `analyzeTrip` (every rule, threshold and message) |
| `src/engine/fixes.ts` | `FIXES` (moveOut, cascade, addTransit, breakAfter, addLunch, route, toEvening, moveTo, setAct) as pure `(trip, fix) => {trip, message}` |
| `src/engine/generate.ts` | `scorePlace`, `allocDays`, `genPlan`, `buildTrip`, `buildSampleTrip` (the start-up block), `estPP`, `estRange`, `seasonOf`, `wzEst` |
| `src/engine/budget.ts` | `estBudget`, balances and settle-up (lifted out of `tBudget`) |
| `src/engine/packing.ts` | `genPack`, `rebuildPack` (the `packRegen` handler) |
| `src/engine/readiness.ts` | `readiness` |
| `src/engine/share.ts` | `shareText`, `summaryText`, `printHTML` (as an HTML string for the download), export/import JSON (`importTrip` validation), share-link encode/decode with lz-string |
| `src/store/trips.ts` | `S.trips`, `S.undo`, `snap`, `mut`, `undo`, `persist`, `saveLocal`/`loadLocal` and every handler in `H` that edits a trip |
| `src/store/ui.ts` | `S.ui` / `S.sel` (selected day, side-panel tab, library query, map day/layers, selected pin, free slot), compare picks and weights (persisted) |
| `src/store/toast.ts` | `toast()` |
| `src/components/Scene.tsx` | `scene()` (same SVG maths, React output) |
| `src/components/*` | `destCard`, `tripCard`, `warnHTML`/`fixBtn`, `itemForm`, `modal`, rail, timeline, panel, map |
| `src/pages/*` | `vHome`, `vExplore`, `vDest`, `vCompare`, `vNew`, `vTrips`, `vTrip`+tabs, `vPrint`, `vMissing`, plus new `Shared` and `About` |
| `src/styles/global.css` | The reference `<style>` block verbatim, plus additions for Leaflet, dnd-kit overlays, footer, dialogs |

## Routing

Hash routes become real URLs: `#home` → `/`, `#explore` → `/explore`, `#d-x` → `/destinations/x`,
`#compare` → `/compare`, `#new-x` → `/new?dest=x`, `#trips` → `/trips`,
`#t-id-plan` → `/trips/id/itinerary` (`pack` → `packing`), `#p-id` → `/trips/id/print`.
New: `/shared#<lz data>` and `/about`. `/trips/:id` redirects to `/trips/:id/overview`.

## Changes from the reference (and why)

1. **No `window.claude`.** Remote sync, `claude.use('db'|'user'|'downloads')` are removed.
   Persistence is zustand `persist` → `localStorage['trip-architect-v1']`, `version: 1`, with a `migrate` hook.
   Downloads use `Blob` + `<a download>`; copy uses `navigator.clipboard` with a textarea dialog fallback.
2. **Sample trip stays out of storage** until touched: `partialize` drops trips with `sample && !touched`.
   (The reference called `saveLocal()` straight after creating it.)
3. **Share links** (new): `compressToEncodedURIComponent(JSON)` → `/shared#…`, read-only view, "Save a copy".
4. **Sync line** replaced by "Trips are saved in this browser. Use Share → Download trip file to back up."
5. **About/FAQ** page and a **footer** (estimates disclaimer + tile attribution).
6. **Maps:** the schematic SVG map becomes Leaflet + raster tiles (`VITE_TILE_URL`), keeping numbered day-coloured
   pins, dashed day routes, area circles, day chips, layer toggles and the side card.
7. **Drag and drop:** HTML5 DnD → `@dnd-kit/core` (mouse + touch sensors). Same drop semantics as the reference
   `drop` handler: before/after a block, onto a day in the rail, onto the timeline, onto the wishlist.
8. **Pure engine:** functions that mutated `S`/the DOM now take a trip and return data. Fixes clone the trip.
   "Today" is read through `new Date()` inside the engine only where the reference did, so tests can fake time.
9. Undo: per-trip in-memory stack of 60 JSON snapshots, Ctrl/Cmd+Z outside inputs, toast "Undo" buttons.

Bugs found while porting are listed in `NOTES.md`.

## Build order

1. data + engine + Vitest acceptance tests → 2. store → 3. shell/routing → 4. Explore/Destination/Compare →
5. wizard → 6. Itinerary Studio → 7. map → 8. Budget/Stays/Packing → 9. Overview/Share/share links →
10. Print/About → 11. Playwright smoke → 12. deploy files + README.
