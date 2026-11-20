import type { BestTime, Cat, Dest, Place } from '../engine/types';
import { DESTS as RAW } from './destinations.raw';

/** Destinations with normalised place objects (`d.pl`), exactly as the reference builds them. */
export const DESTS: Dest[] = RAW.map((d) => ({
  ...d,
  pl: d.places.map((p): Place => ({
    pid: d.id + ':' + p[0],
    dest: d.id,
    n: p[1],
    cat: p[2] as Cat,
    area: p[3],
    lat: p[4],
    lng: p[5],
    d: p[6],
    c: p[7],
    best: p[8] as BestTime,
    desc: p[9],
    must: (p[10] || '').includes('m'),
    hidden: (p[10] || '').includes('h'),
    wd: p[11] ?? null,
  })),
}));

/** Destinations by id. */
export const D: Record<string, Dest> = Object.fromEntries(DESTS.map((d) => [d.id, d]));
/** Places by pid (`dest:id`). */
export const PL: Record<string, Place> = Object.fromEntries(DESTS.flatMap((d) => d.pl.map((p) => [p.pid, p])));
