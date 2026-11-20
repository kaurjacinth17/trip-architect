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
