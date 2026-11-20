// Whether live place data is available. Everything in the app keeps working in every state.
import { create } from 'zustand';

export type LiveState = 'unknown' | 'live' | 'unconfigured' | 'resting' | 'offline';
export interface Providers { googlePlaces: boolean; unsplash: boolean; supabase: boolean; upstash: boolean }

interface LiveStatus {
  state: LiveState;
  providers: Providers;
  set: (p: Partial<Pick<LiveStatus, 'state' | 'providers'>>) => void;
}

export const NO_PROVIDERS: Providers = { googlePlaces: false, unsplash: false, supabase: false, upstash: false };

export const useLiveStatus = create<LiveStatus>()((set) => ({
  state: 'unknown',
  providers: NO_PROVIDERS,
  set: (p) => set(p),
}));

/** One cheap call on start-up (no Google request): which providers does this deployment have? */
export async function checkHealth(fetchImpl: typeof fetch = fetch) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    useLiveStatus.getState().set({ state: 'offline' });
    return;
  }
  try {
    const r = await fetchImpl('/api/health');
    if (!r.ok) throw new Error(String(r.status));
    const b = (await r.json()) as { providers: Providers; resting: string[] };
    const resting = b.resting?.includes('textSearchEnterprise');
    useLiveStatus.getState().set({ providers: b.providers, state: !b.providers.googlePlaces ? 'unconfigured' : resting ? 'resting' : 'live' });
  } catch {
    // Static hosting without functions, or offline: curated mode.
    useLiveStatus.getState().set({ providers: NO_PROVIDERS, state: 'unconfigured' });
  }
}
