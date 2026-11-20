// @vitest-environment node
// Parity check: runs the reference prototype's own engine code (extracted from trip-architect-reference.html)
// and compares its output with the TypeScript port across every destination, pace and preference extreme.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { analyzeTrip } from './checks';
import { applyFix } from './fixes';
import { buildTrip } from './generate';
import { readiness } from './readiness';
import type { PaceKey, Prefs, Trip, TripFix } from './types';

const file = path.resolve(__dirname, '../../trip-architect-reference.html');
const has = fs.existsSync(file);

interface RefEngine {
  buildTrip: (o: unknown) => Trip;
  analyzeTrip: (t: Trip) => ReturnType<typeof analyzeTrip>;
  readiness: (t: Trip) => ReturnType<typeof readiness>;
  FIXES: Record<string, (t: Trip, f: TripFix) => string | false>;
}

function loadReference(): RefEngine {
  const html = fs.readFileSync(file, 'utf8');
  const js = html.slice(html.indexOf('const DESTS = ['), html.indexOf('// ---------- illustrated scenes'));
  const fixes = html.slice(html.indexOf('function findItem('), html.indexOf('function runFix('));
  const fn = new Function('window', 'localStorage', `${js}\n${fixes}\nreturn {buildTrip, analyzeTrip, readiness, FIXES};`);
  return fn({}, { getItem: () => null, setItem: () => {} }) as RefEngine;
}

/** Ids are random in both implementations; replace them with their order of appearance. */
function canon<T>(o: T): T {
  const ids = new Map<string, string>();
  return JSON.parse(JSON.stringify(o, (k, v) => {
    if (k === 'id' && typeof v === 'string') { if (!ids.has(v)) ids.set(v, 'id' + ids.size); return ids.get(v); }
    if (k === 'created' || k === 'updated' || k === 'sample' || k === 'touched') return undefined;
    return v;
  }));
}

const DESTS = ['jaipur', 'udaipur', 'goa', 'kerala', 'manali', 'varanasi', 'rishikesh', 'pondicherry'];
const PACES: PaceKey[] = ['relaxed', 'balanced', 'packed'];
const PREFS: Prefs[] = [
  { natureCity: 0, sightExp: 0, foodShop: 0, advComfort: 0, tier: 1 },
  { natureCity: -2, sightExp: 2, foodShop: -2, advComfort: -2, tier: 2 },
  { natureCity: 2, sightExp: -2, foodShop: 2, advComfort: 2, tier: 0 },
];

describe.runIf(has)('parity with the reference engine', () => {
  let R: RefEngine;
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00'));
    R = loadReference();
  });
  afterAll(() => vi.useRealTimers());

  const cases: { dests: string[]; days: number; pace: PaceKey; prefs: Prefs; n: number; start: string }[] = [];
  for (const d of DESTS) for (const pace of PACES) for (const [pi, prefs] of PREFS.entries()) {
    cases.push({ dests: [d], days: 2 + ((pi + pace.length) % 5), pace, prefs, n: 1 + pi, start: pi === 1 ? '' : '2026-12-16' });
  }
  cases.push({ dests: ['jaipur', 'udaipur'], days: 6, pace: 'balanced', prefs: PREFS[0], n: 2, start: '2026-12-16' });
  cases.push({ dests: ['goa', 'kerala'], days: 9, pace: 'packed', prefs: PREFS[1], n: 4, start: '2027-06-03' });
  cases.push({ dests: ['manali', 'rishikesh', 'varanasi'], days: 10, pace: 'relaxed', prefs: PREFS[2], n: 3, start: '2027-07-20' });
  cases.push({ dests: ['pondicherry'], days: 1, pace: 'balanced', prefs: PREFS[0], n: 2, start: '2026-11-25' });

  it.each(cases.map((c) => [`${c.dests.join('+')} ${c.days}d ${c.pace} n=${c.n} ${JSON.stringify(c.prefs)}`, c] as const))('%s', (_n, c) => {
    const o = { ...c, travelers: Array.from({ length: c.n }, (_, i) => 'T' + i), group: 'friends', budgetTotal: 20000 };
    const ref = R.buildTrip(structuredClone(o));
    const mine = buildTrip(structuredClone(o) as never);
    expect(canon(mine.plan)).toEqual(canon(ref.plan));
    expect(canon(mine.wish)).toEqual(canon(ref.wish));
    expect(mine.budget).toEqual(ref.budget);
    expect(canon(mine.pack)).toEqual(canon(ref.pack));

    // Feed the SAME trip to both analysers.
    const t = canon(ref);
    expect(canon(analyzeTrip(t))).toEqual(canon(R.analyzeTrip(structuredClone(t))));
    const { A: _a, ...rm } = readiness(t);
    const { A: _b, ...rr } = R.readiness(structuredClone(t));
    expect(rm).toEqual(rr);

    // Apply every offered fix (except breakAfter, which is restructured; see NOTES.md) in both and compare.
    const A = R.analyzeTrip(structuredClone(t));
    const fixes = [...A.trip, ...A.days.flat()].map((w) => w.fix).filter((f): f is TripFix => !!f && f.a !== 'ptab' && f.a !== 'breakAfter');
    for (const f of fixes) {
      const refT = structuredClone(t);
      const refMsg = R.FIXES[f.a](refT, f);
      const r = applyFix(t, f);
      expect(r.message ?? false).toEqual(refMsg ?? false);
      if (refMsg) expect(canon(r.trip)).toEqual(canon(refT));
    }
  });
});
