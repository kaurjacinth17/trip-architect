import { beforeEach, describe, expect, it } from 'vitest';
import { buildTrip, DEFAULT_PREFS } from '../engine/generate';
import { exportJSON } from '../engine/share';
import { migrate, SCHEMA_VERSION, STORAGE_KEY, useTrips } from './trips';

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');

beforeEach(() => {
  localStorage.clear();
  useTrips.setState({ trips: {}, undo: {} });
});

describe('trips store', () => {
  it('keeps the sample trip out of storage until it is edited', () => {
    useTrips.getState().ensureSample(new Date('2026-11-20T10:00:00'));
    const [t] = Object.values(useTrips.getState().trips);
    expect(t.sample).toBe(true);
    expect(t.start).toBe('2026-12-11');
    expect(stored().state.trips).toEqual({});
    expect(stored().version).toBe(SCHEMA_VERSION);

    useTrips.getState().mutate(t.id, (x) => { x.notes = 'hi'; });
    expect(Object.keys(stored().state.trips)).toEqual([t.id]);
    expect(stored().state.trips[t.id].touched).toBe(true);
  });

  it('does not create a sample when trips exist', () => {
    const t = useTrips.getState().add(buildTrip({ dests: ['goa'], days: 3, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS }));
    useTrips.getState().ensureSample();
    expect(Object.keys(useTrips.getState().trips)).toEqual([t.id]);
  });

  it('undoes mutations and caps the stack at 60', () => {
    const t = useTrips.getState().add(buildTrip({ dests: ['goa'], days: 3, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS, name: 'G' }));
    for (let i = 0; i < 65; i++) useTrips.getState().mutate(t.id, (x) => { x.name = 'G' + i; });
    expect(useTrips.getState().undo[t.id]).toHaveLength(60);
    expect(useTrips.getState().undoTrip(t.id)).toBe(true);
    expect(useTrips.getState().trips[t.id].name).toBe('G63');
  });

  it('cancels a mutation that returns false', () => {
    const t = useTrips.getState().add(buildTrip({ dests: ['goa'], days: 3, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS }));
    useTrips.getState().mutate(t.id, (x) => { x.name = 'changed'; return false; });
    expect(useTrips.getState().trips[t.id].name).toBe(t.name);
    expect(useTrips.getState().undo[t.id]).toBeUndefined();
  });

  it('imports with a new id and renames duplicates', () => {
    const t = useTrips.getState().add(buildTrip({ dests: ['goa'], days: 3, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS, name: 'Goa' }));
    const back = useTrips.getState().importTrip(exportJSON(t));
    expect(back.id).not.toBe(t.id);
    expect(back.name).toBe('Goa (imported)');
  });

  it('migrates the prototype’s raw storage format', () => {
    const t = buildTrip({ dests: ['goa'], days: 3, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS });
    const m = migrate({ trips: { [t.id]: t, bad: { nope: 1 } }, compare: { cmp: ['goa'] } }, 0);
    expect(Object.keys(m.trips)).toEqual([t.id]);
    expect(m.compare.cmp).toEqual(['goa']);
    expect(m.compare.w.season).toBe(5);
  });
});
