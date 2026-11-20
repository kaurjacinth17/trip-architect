// Thin wrappers that pair a store mutation with the reference's toast/undo behaviour (`mut(fn,msg,undoable)`).
import type { Fix, Trip } from '../engine/types';
import { toast } from '../store/toast';
import { useTrips, type MutResult } from '../store/trips';
import { useUI } from '../store/ui';

export function mut(id: string, fn: (t: Trip) => MutResult, msg?: string | ((r: MutResult) => string | undefined), undoable?: boolean) {
  const r = useTrips.getState().mutate(id, fn);
  if (r === false || r === null) return r;
  const m = typeof msg === 'function' ? msg(r) : msg;
  if (m) toast(m, undoable ? id : undefined);
  return r;
}

/** Run a warning's fix. `ptab` fixes switch the Itinerary side panel instead of editing the trip. */
export function runFix(id: string, f: Fix, goItinerary?: () => void) {
  if (f.a === 'ptab') {
    useUI.getState().set({ ptab: f.v });
    goItinerary?.();
    return;
  }
  const msg = useTrips.getState().applyFix(id, f);
  if (msg) toast(msg, id);
  else toast('Nothing to change');
}

export function undoTrip(id: string) {
  if (useTrips.getState().undoTrip(id)) toast('Undone');
  else toast('Nothing to undo');
}
