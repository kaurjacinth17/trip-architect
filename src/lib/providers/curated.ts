// Offline / no-key fallback: answers from the 8 hand-written destination guides only.
import { D, DESTS } from '../../data/destinations';
import type { Cat, Dest } from '../../engine/types';
import type { AreasProvider, ClimateProvider, GuideTab, PhotoProvider, PlaceLite, PlacesProvider, SummaryProvider, DestinationLite } from './types';

const TAB_CATS: Record<GuideTab, Cat[]> = {
  famous: ['heritage', 'sight', 'spiritual', 'nature'],
  todo: ['activity', 'nature', 'sight', 'spiritual'],
  restaurants: ['food'],
  cafes: ['cafe'],
  hotels: [],
  shopping: ['shop'],
  nightlife: ['night'],
};

const curatedFor = (d: DestinationLite): Dest | undefined => D[d.key] || DESTS.find((x) => x.name.toLowerCase() === d.name.toLowerCase());

export const CuratedOnlyProvider: PlacesProvider & AreasProvider & SummaryProvider & ClimateProvider & PhotoProvider = {
  id: 'curated',
  async search(q) {
    const d = curatedFor(q.dest);
    if (!d) return { places: [] };
    const t = (q.text || '').toLowerCase();
    const places: PlaceLite[] = d.pl
      .filter((p) => TAB_CATS[q.tab].includes(p.cat) || (q.tab === 'famous' && p.must))
      .filter((p) => !q.area || p.area === q.area)
      .filter((p) => !t || (p.n + ' ' + p.desc + ' ' + p.area).toLowerCase().includes(t))
      .sort((a, b) => Number(b.must) - Number(a.must))
      .map((p) => ({ id: p.pid, source: 'curated', name: p.n, category: p.cat, location: { lat: p.lat, lng: p.lng }, areaHint: p.area, curatedPid: p.pid }));
    return { places };
  },
  async details(id) {
    const [dest] = id.split(':');
    const p = D[dest]?.pl.find((x) => x.pid === id);
    return p ? { id: p.pid, source: 'curated', name: p.n, category: p.cat, location: { lat: p.lat, lng: p.lng }, areaHint: p.area, summary: p.desc, curatedPid: p.pid } : null;
  },
  async suggestDestinations(input) {
    const t = input.trim().toLowerCase();
    if (!t) return [];
    return DESTS.filter((d) => (d.name + ' ' + d.state).toLowerCase().includes(t)).map((d) => ({ placeId: 'curated:' + d.id, name: d.name, secondary: d.state + ', India', types: ['locality'] }));
  },
  async areas(dest) {
    return curatedFor(dest)?.areas.map((a) => ({ name: a[0], bestFor: a[1], center: { lat: a[2], lng: a[3] } })) || [];
  },
  async summary(dest) {
    const d = curatedFor(dest);
    return d ? { title: d.name, extract: d.overview, source: 'curated' } : null;
  },
  async normals() {
    return null;
  },
  async photos() {
    return [];
  },
};
