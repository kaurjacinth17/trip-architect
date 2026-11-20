import { afterEach, describe, expect, it } from 'vitest';
import { checkHealth, useLiveStatus } from '../liveStatus';
import { CuratedOnlyProvider } from './curated';
import { providers, registerProviders } from './index';
import type { PlacesProvider } from './types';

const jaipur = { key: 'jaipur', name: 'Jaipur', center: { lat: 26.91, lng: 75.81 } };

afterEach(() => useLiveStatus.setState({ state: 'unknown' }));

describe('CuratedOnlyProvider', () => {
  it('lists curated places by tab, area and text', async () => {
    const all = await CuratedOnlyProvider.search({ dest: jaipur, tab: 'famous' });
    expect(all.places.map((p) => p.name)).toContain('Amber Fort');
    expect(all.places.every((p) => p.source === 'curated' && p.rating === undefined)).toBe(true);
    const amer = await CuratedOnlyProvider.search({ dest: jaipur, tab: 'famous', area: 'Amer' });
    expect(amer.places.every((p) => p.areaHint === 'Amer')).toBe(true);
    const food = await CuratedOnlyProvider.search({ dest: jaipur, tab: 'restaurants', text: 'kachori' });
    expect(food.places.map((p) => p.name)).toEqual(['Rawat Mishtan Bhandar']);
  });

  it('returns nothing (honestly) for hotels and unknown destinations', async () => {
    expect((await CuratedOnlyProvider.search({ dest: jaipur, tab: 'hotels' })).places).toEqual([]);
    expect((await CuratedOnlyProvider.search({ dest: { key: 'x', name: 'Jodhpur', center: { lat: 0, lng: 0 } }, tab: 'famous' })).places).toEqual([]);
  });
});

describe('provider registry', () => {
  it('uses live places only while live data is available', () => {
    const fake = { id: 'google' } as PlacesProvider;
    registerProviders({ places: fake });
    useLiveStatus.setState({ state: 'live' });
    expect(providers().places).toBe(fake);
    useLiveStatus.setState({ state: 'resting' });
    expect(providers().places.id).toBe('curated');
  });
});

describe('checkHealth', () => {
  it('falls back to curated mode when there is no API (static hosting)', async () => {
    await checkHealth(async () => new Response('<html>', { status: 404 }));
    expect(useLiveStatus.getState().state).toBe('unconfigured');
  });
  it('detects a resting daily budget', async () => {
    await checkHealth(async () => new Response(JSON.stringify({ providers: { googlePlaces: true, unsplash: false, supabase: false, upstash: true }, resting: ['textSearchEnterprise'] })));
    expect(useLiveStatus.getState().state).toBe('resting');
  });
});
