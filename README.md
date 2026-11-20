# Trip Architect

A travel planning workspace. Explore destinations, compare them, create a trip and get a fully editable
day-by-day itinerary that checks itself for unrealistic plans while you stay in control. Each trip also has a
map, a budget and expense tracker with group splits, a stay comparison, a packing list, a readiness score, and
export, print and share options.

> ChatGPT gives you answers. Trip Architect gives you a system to manage your trip.

- Works with no keys at all (guest mode, trips in `localStorage`, 8 curated destinations). Live place data, maps,
  photos and accounts switch on as you add keys: see **[docs/SETUP.md](docs/SETUP.md)**.
- Server code lives in `api/` (Vercel functions); `npm run dev` serves it locally too.
- Vite + React 18 + TypeScript (strict), React Router, Zustand, @dnd-kit, Leaflet, lz-string.
- Ported from the single-file prototype `trip-architect-reference.html` (see `PLAN.md` and `NOTES.md`).

## 1. Run it locally

You need Node.js 20 or newer (22 recommended).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Other scripts:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint |
| `npm test` | Vitest: engine acceptance tests, reference parity tests, store and component tests |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run e2e` | Playwright smoke tests (builds, serves on :4173, visits every route at 1360px and 390px, tests mouse and touch drag and drop) |

To run the Playwright tests the first time on your machine:

```bash
npx playwright install chromium
```

Optional settings go in a `.env` file (copy `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Raster tile template for the maps |
| `VITE_TILE_ATTRIBUTION` | `© OpenStreetMap contributors` (linked) | Attribution shown on maps and in the footer |
| `VITE_SITE_URL` | `https://trip-architect.vercel.app` | Your public URL, for canonical/Open Graph tags, `robots.txt` and `sitemap.xml` |

## 2. Push to a new GitHub repository

Create an empty repository on GitHub (no README or licence), then from this folder:

```bash
git remote add origin https://github.com/<your-username>/trip-architect.git
```

```bash
git push -u origin main
```

GitHub Actions (`.github/workflows/ci.yml`) then runs typecheck, lint, Vitest and the build on every push.

## 3. Deploy to Vercel (free tier)

1. Sign in at https://vercel.com with GitHub.
2. **Add New → Project**, pick the `trip-architect` repository, and **Import**.
3. Vercel detects Vite. Leave the build command (`npm run build`) and output directory (`dist`) as they are.
4. Under **Environment Variables**, add `VITE_SITE_URL` with the URL you'll use (for example
   `https://trip-architect-yourname.vercel.app`). Add `VITE_TILE_URL` / `VITE_TILE_ATTRIBUTION` if you use another
   tile provider.
5. **Deploy**. Every push to `main` redeploys; pull requests get preview URLs.

`vercel.json` rewrites every path to `/index.html`, so deep links such as `/trips/abc/itinerary` work on reload.

**Custom domain (optional):** in the project, open **Settings → Domains**, add your domain and follow the DNS
instructions Vercel shows (an `A` record for an apex domain or a `CNAME` for a subdomain). Then update
`VITE_SITE_URL` to the new domain and redeploy.

### Netlify (guest mode only)

The `api/` functions are Vercel functions, so on Netlify the site runs in guest + curated mode only (no live place
data). `netlify.toml` and `public/_redirects` still build and serve it.

## 4. Add a new destination

All destination data lives in `src/data/destinations.raw.ts`, in the same shape as the reference. Add an object to
the `DESTS` array:

```ts
{id:'hampi',name:'Hampi',state:'Karnataka',tag:'Boulder hills and temple ruins',
 moods:['city','photo','budget','adventure'],          // ids from MOODS in src/data/constants.ts
 bestFor:'Culture, photography',days:[2,3],pace:'Balanced',ease:'Easy to plan',
 good:[11,12,1,2],poor:[4,5],                          // month numbers, 1 = January
 bestTime:'November to February.',
 climate:['hot','temple'],                             // drives the packing list: hot, cold, beach, hills, monsoon, temple
 center:[15.335,76.46],                                // used for travel time between stops on multi-stop trips
 scene:['fort','#f0c08a','#b0643a','#5a2e1c'],         // illustration: fort|lake|beach|backwater|mountain|ghat|river|colonial + 3 colours
 cost:{stay:[1200,3000,9000],food:[500,900,2000],local:[400,700,1500]}, // INR per room / per person per day: budget, mid, luxury
 scores:{relax:6,culture:10,food:5,shop:4,night:2,nature:7,adventure:6,value:9}, // editorial, out of 10 (Compare page)
 overview:'…', why:['…'], foods:['…'], tips:['…'], getThere:'…',
 areas:[['Hampi Bazaar','Backpacker stays, temples on foot',15.335,76.46]],  // [name, best for, lat, lng]
 places:[
  // [id, name, category, area, lat, lng, minutes, cost per person, best time, description, flags, weekday?]
  ['virupaksha','Virupaksha Temple','spiritual','Hampi Bazaar',15.335,76.4595,60,0,'am','…','m'],
  ['market','Sunday market','shop','Hospet',15.27,76.39,90,0,'pm','…','',0],
 ]}
```

- **category:** `heritage`, `sight`, `nature`, `spiritual`, `activity`, `food`, `cafe`, `shop`, `night`.
- **best time:** `am`, `pm`, `eve` or `any`. The generator and checks use it.
- **flags:** `m` = must-see, `h` = lesser-known, both or neither.
- **weekday (optional):** `0` = Sunday … `6` = Saturday, for weekday-only places such as markets.
- Places of 360+ minutes are treated as full-day trips.
- Add the id to `DEST_IDS` in `vite.config.ts` so it appears in `sitemap.xml`.

Then run `npm test`. The engine tests and the type checker will catch shape errors. (The parity test compares
against the reference file's own data, so it only covers the original eight destinations.)

## 5. Map tiles: read this before you get traffic

The maps use Leaflet with raster tiles from `VITE_TILE_URL`, defaulting to the OpenStreetMap Foundation's
`tile.openstreetmap.org`, with the required attribution on every map and in the footer.

The OSMF tile servers are run on donated resources and are **not meant for heavy use**. Their
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/) requires visible attribution, a valid
HTTP referer/user agent (browsers send these), respecting the servers' caching headers, and no bulk downloading or
prefetching. The OSMF may limit or block sites that put a heavy load on the servers, without notice, and there is
no uptime guarantee. That's fine for a personal project, a demo or light traffic. **If you expect real public
traffic, switch to a tile provider whose terms allow it** (a paid or free-tier plan from a commercial OSM tile
host, or tiles you host yourself) by setting `VITE_TILE_URL` and `VITE_TILE_ATTRIBUTION`. Check the policy page
again before you launch, since terms change.

OpenFreeMap (mentioned in the brief) serves vector tiles and MapLibre styles rather than raster PNGs, so it would
need a vector renderer (for example MapLibre GL) instead of Leaflet's `L.tileLayer`.

## How it's built

```
src/
  data/        destinations.raw.ts (verbatim from the reference), indexes D and PL, constants
  engine/      pure TypeScript, no React or DOM: geo, time, schedule, checks, fixes, generate, budget,
               packing, readiness, share (text exports, print HTML, JSON import/export, share links)
  store/       zustand: trips (persisted, versioned, undo stack of 60 per trip), ui (session), toast
  components/  Scene (SVG illustrations), cards, Modal (focus trap), Toast, MapView (Leaflet), shell
  pages/       Home, Explore, Destination, Compare, NewTrip, Trips, About, Print, Shared, trip/* tabs
  styles/      global.css: the reference stylesheet plus web additions
```

**Your data:** trips are stored only in your browser. Use **Share → Download trip file** to back up, and
**My trips → Import** to restore. Share links hold the whole trip after the `#`, which browsers never send to a
server.
