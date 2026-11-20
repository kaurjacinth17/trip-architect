// GET /api/summary?title=…&lat=…&lng=…  Wikipedia page summary (CC BY-SA). Rejects disambiguation pages and articles
// whose coordinates are far from the destination, so "Spiti" doesn't return the wrong place.
import { z } from 'zod';
import { handler, json } from './_lib/http';
import { edgeCache, fetchJson } from './_lib/upstream';

const Q = z.object({ title: z.string().trim().min(1).max(100), lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() });

interface WikiSummary { type?: string; title?: string; extract?: string; coordinates?: { lat: number; lon: number }; content_urls?: { desktop?: { page?: string } } }

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'open', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const s = await fetchJson<WikiSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.title.replace(/ /g, '_'))}?redirect=true`);
  let ok = !!s?.extract && s.type !== 'disambiguation';
  if (ok && s?.coordinates && q.lat != null && q.lng != null) ok = kmBetween({ lat: q.lat, lng: q.lng }, { lat: s.coordinates.lat, lng: s.coordinates.lon }) < 150;
  const body = ok ? { title: s!.title, extract: s!.extract, url: s!.content_urls?.desktop?.page, source: 'wikipedia' } : null;
  return json({ summary: body }, { cache: edgeCache(7 * 86400) });
});
