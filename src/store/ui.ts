// Session-only UI state (reference `S.ui` / `S.sel` / `S.wz`). Not persisted.
import { create } from 'zustand';
import type { PaceKey, Prefs } from '../engine/types';

export type PanelTab = 'checks' | 'lib' | 'wish';
export interface MapLayers { plan: boolean; wish: boolean; lib: boolean; stay: boolean; area: boolean }

export interface Wizard {
  pre: string;
  step: number;
  dests: string[];
  start: string;
  days: number;
  group: string;
  n: number;
  names: string[];
  pace: PaceKey;
  prefs: Prefs;
  bMode: 'total' | 'pp';
  budget: string;
  name: string;
}

interface UIState {
  /** trip whose selection below applies */
  cur: string | null;
  day: number;
  slot: number | null;
  pin: string | null;
  ptab: PanelTab;
  lq: string;
  lcat: string;
  mapDay: 'all' | number;
  mapLayers: MapLayers;
  mood: string | null;
  q: string;
  len: 'any' | 'short' | 'mid' | 'long';
  cmpMonth: number;
  wz: Wizard | null;
  set: (p: Partial<UIState>) => void;
  /** Reset per-trip selection when switching trips (reference: `if(S.cur!==t.id){S.sel={day:0};S.ui.mapDay='all'}`). */
  enterTrip: (id: string) => void;
}

export const useUI = create<UIState>()((set, get) => ({
  cur: null,
  day: 0,
  slot: null,
  pin: null,
  ptab: 'checks',
  lq: '',
  lcat: 'all',
  mapDay: 'all',
  mapLayers: { plan: true, wish: true, lib: false, stay: true, area: true },
  mood: null,
  q: '',
  len: 'any',
  cmpMonth: 0,
  wz: null,
  set: (p) => set(p),
  enterTrip: (id) => {
    if (get().cur !== id) set({ cur: id, day: 0, slot: null, pin: null, mapDay: 'all' });
  },
}));
