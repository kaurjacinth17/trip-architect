// TEST FIXTURES ONLY. Shapes follow the real provider responses; the values are made up for tests and are never
// shown to users. Used by API tests (MSW) and Playwright (route mocks).
export const IDS = {
  jodhpur: 'osm-R900001',
  spiti: 'osm-R900002',
  mehrangarh: 'osm-W900003',
  stepwell: 'osm-N900004',
  clocktower: 'osm-N900005',
  umaid: 'osm-W900006',
  cafe: 'osm-N900007',
  thali: 'osm-N900008',
  hotelA: 'osm-N900009',
  hotelB: 'osm-N900010',
  hotelC: 'osm-N900011',
};

export const googleAutocomplete = (input: string) => ({
  suggestions: [
    ...(/jod/i.test(input) ? [{ placePrediction: { placeId: IDS.jodhpur, types: ['locality', 'political'], structuredFormat: { mainText: { text: 'Jodhpur' }, secondaryText: { text: 'Rajasthan, India' } } } }] : []),
    ...(/spiti/i.test(input) ? [{ placePrediction: { placeId: IDS.spiti, types: ['natural_feature'], structuredFormat: { mainText: { text: 'Spiti Valley' }, secondaryText: { text: 'Himachal Pradesh, India' } } } }] : []),
  ],
});

export const googleDestination: Record<string, unknown> = {
  [IDS.jodhpur]: {
    id: IDS.jodhpur, displayName: { text: 'Jodhpur' }, location: { latitude: 26.2389, longitude: 73.0243 },
    viewport: { low: { latitude: 26.18, longitude: 72.95 }, high: { latitude: 26.33, longitude: 73.1 } },
    types: ['locality', 'political'], primaryType: 'locality', timeZone: { id: 'Asia/Kolkata' },
    addressComponents: [{ longText: 'Jodhpur', types: ['locality'] }, { longText: 'Rajasthan', shortText: 'RJ', types: ['administrative_area_level_1'] }, { longText: 'India', shortText: 'IN', types: ['country'] }],
    googleMapsUri: 'https://maps.google.com/?cid=1',
  },
  [IDS.spiti]: {
    id: IDS.spiti, displayName: { text: 'Spiti Valley' }, location: { latitude: 32.246, longitude: 78.035 },
    viewport: { low: { latitude: 31.9, longitude: 77.6 }, high: { latitude: 32.6, longitude: 78.5 } },
    types: ['natural_feature'], primaryType: 'natural_feature', timeZone: { id: 'Asia/Kolkata' },
    addressComponents: [{ longText: 'Himachal Pradesh', shortText: 'HP', types: ['administrative_area_level_1'] }, { longText: 'India', shortText: 'IN', types: ['country'] }],
  },
};

const pl = (id: string, name: string, lat: number, lng: number, types: string[], rating: number, count: number, area: string, price?: string) => ({
  id, displayName: { text: name }, location: { latitude: lat, longitude: lng }, types, primaryType: types[0], rating, userRatingCount: count,
  ...(price ? { priceLevel: price } : {}), currentOpeningHours: { openNow: true }, googleMapsUri: 'https://maps.google.com/?cid=' + id.slice(-3),
  addressComponents: [{ longText: area, types: ['sublocality_level_1', 'sublocality'] }, { longText: 'Jodhpur', types: ['locality'] }],
  shortFormattedAddress: area + ', Jodhpur', businessStatus: 'OPERATIONAL',
});

export const googleSearch: Record<string, { places: unknown[]; nextPageToken?: string }> = {
  famous: { places: [
    pl(IDS.mehrangarh, 'Mehrangarh Fort', 26.2978, 73.0185, ['tourist_attraction', 'historical_landmark'], 4.7, 61000, 'Fort Area'),
    pl(IDS.umaid, 'Umaid Bhawan Palace Museum', 26.2809, 73.0469, ['museum', 'tourist_attraction'], 4.5, 22000, 'Cantonment'),
    pl(IDS.clocktower, 'Ghanta Ghar (Clock Tower)', 26.2946, 73.0244, ['tourist_attraction'], 4.3, 18000, 'Old City'),
    pl(IDS.stepwell, 'Toorji Ka Jhalra stepwell', 26.2927, 73.0201, ['tourist_attraction', 'historical_landmark'], 4.5, 9000, 'Old City'),
  ] },
  restaurants: { places: [
    pl(IDS.thali, 'Thali House', 26.2931, 73.0221, ['restaurant'], 4.4, 2100, 'Old City', 'PRICE_LEVEL_MODERATE'),
    pl(IDS.cafe, 'Rooftop Café', 26.2939, 73.0232, ['cafe', 'restaurant'], 4.2, 640, 'Old City', 'PRICE_LEVEL_INEXPENSIVE'),
  ] },
};

googleSearch.hotels = { places: [
  pl(IDS.hotelA, 'Haveli Alpha (fixture)', 26.2951, 73.0230, ['lodging', 'hotel'], 4.6, 1200, 'Old City', 'PRICE_LEVEL_MODERATE'),
  pl(IDS.hotelB, 'Beta Residency (fixture)', 26.2800, 73.0450, ['lodging', 'hotel'], 4.1, 800, 'Cantonment', 'PRICE_LEVEL_EXPENSIVE'),
  pl(IDS.hotelC, 'Gamma Stay (fixture)', 26.2930, 73.0215, ['lodging', 'hotel'], 4.8, 300, 'Old City', 'PRICE_LEVEL_INEXPENSIVE'),
] };
googleSearch.cafes = { places: [googleSearch.restaurants.places[1]] };

export const wikipedia = { type: 'standard', title: 'Jodhpur', extract: 'Jodhpur is a city in Rajasthan (test fixture).', coordinates: { lat: 26.28, lon: 73.02 }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Jodhpur' } } };

/** Ten years of synthetic daily weather: hot dry May, wet July/August, pleasant winter. */
export function openMeteoArchive() {
  const time: string[] = [], hi: number[] = [], lo: number[] = [], rain: number[] = [];
  const HI = [24, 27, 33, 38, 41, 39, 34, 32, 33, 33, 29, 25];
  const RAIN_DAYS = [0, 0, 0, 0, 1, 3, 12, 11, 4, 0, 0, 0];
  for (let y = 2015; y <= 2024; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) {
    time.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    hi.push(HI[m - 1]); lo.push(HI[m - 1] - 12); rain.push(d <= RAIN_DAYS[m - 1] ? 8 : 0);
  }
  return { daily: { time, temperature_2m_max: hi, temperature_2m_min: lo, precipitation_sum: rain } };
}

export const overpass = { elements: [
  { type: 'node', id: 1, lat: 26.2946, lon: 73.0244, tags: { place: 'neighbourhood', name: 'Old City' } },
  { type: 'node', id: 2, lat: 26.2809, lon: 73.0469, tags: { place: 'suburb', name: 'Cantonment' } },
  { type: 'way', id: 3, center: { lat: 26.27, lon: 73.0 }, tags: { place: 'suburb', name: 'Sardarpura', 'name:en': 'Sardarpura' } },
  { type: 'node', id: 4, lat: 26.2946, lon: 73.0244, tags: { place: 'neighbourhood', name: 'Old City' } },
] };

export const frankfurter = { base: 'INR', date: '2026-11-20', rates: { USD: 0.0118, EUR: 0.0109, THB: 0.41 } };
