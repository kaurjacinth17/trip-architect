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
- The schematic SVG map became Leaflet with raster tiles. The reference rule `.map svg{position:absolute;inset:0;…}`
  was removed because it breaks Leaflet's vector layer (routes and area circles).
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
- **Map tiles:** the default is `tile.openstreetmap.org`, which is not meant for heavy traffic (see README).
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
