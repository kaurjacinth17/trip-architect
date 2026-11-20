import type { BestTime, BudgetKey, Cat, FactorKey, PaceKey } from '../engine/types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WDL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export const CATS: Record<Cat, [string, string]> = {
  heritage: ['Heritage', '#b4532a'],
  sight: ['Sightseeing', '#c08a1e'],
  nature: ['Nature', '#2f7d5b'],
  spiritual: ['Spiritual', '#8a5fb0'],
  activity: ['Experience', '#2b6f9b'],
  food: ['Food', '#c9612c'],
  cafe: ['Café', '#93663f'],
  shop: ['Shopping', '#b04a6b'],
  night: ['Nightlife', '#5a4fb0'],
  meal: ['Meal break', '#c9612c'],
  transit: ['Travel', '#6b7a70'],
  rest: ['Free time', '#6b7a70'],
  custom: ['Custom', '#1f4d3a'],
};
export const NONACT: Cat[] = ['meal', 'transit', 'rest'];
export const BEST: Record<BestTime, string> = {
  am: 'Best in the morning',
  pm: 'Good in the afternoon',
  eve: 'Best at sunset / evening',
  any: 'Any time',
};
export const MOODS: [string, string][] = [
  ['mountain', 'Mountain escape'], ['beach', 'Beach vacation'], ['city', 'City break'], ['romantic', 'Romantic getaway'],
  ['slow', 'Peaceful, slow travel'], ['adventure', 'Adventure'], ['food', 'Food-focused'], ['photo', 'Photography'],
  ['budget', 'Budget-friendly'], ['luxury', 'Luxury'],
];
export const BCATS: [BudgetKey, string][] = [
  ['travel', 'Flights / train'], ['stay', 'Stay'], ['food', 'Food'], ['local', 'Local transport'],
  ['act', 'Activities and entry'], ['shop', 'Shopping'], ['misc', 'Miscellaneous'],
];
export interface PaceDef { l: string; cap: number; max: number; start: number }
export const PACE: Record<PaceKey, PaceDef> = {
  relaxed: { l: 'Relaxed', cap: 330, max: 4, start: 600 },
  balanced: { l: 'Balanced', cap: 450, max: 5, start: 540 },
  packed: { l: 'Packed', cap: 570, max: 7, start: 480 },
};
export const paceOf = (k: string | undefined): PaceDef => PACE[k as PaceKey] || PACE.balanced;
export const DAYC = ['#b4532a', '#1f6f8b', '#2f7d5b', '#8a5fb0', '#c08a1e', '#b04a6b', '#4b6e8f', '#6b7a3a'];
export const FACTORS: [FactorKey, string][] = [
  ['relax', 'Relaxation'], ['culture', 'Culture and history'], ['food', 'Food'], ['shop', 'Shopping'],
  ['night', 'Nightlife'], ['nature', 'Nature'], ['adventure', 'Adventure'], ['value', 'Value for money'],
];
export const GROUPS: [string, string, number][] = [
  ['solo', 'Solo', 1], ['couple', 'Couple', 2], ['friends', 'Friends', 4], ['family', 'Family', 4], ['group', 'Group', 6],
];
export const LIB_CATS: [string, string][] = [
  ['all', 'All'], ['heritage', 'Historical'], ['sight', 'Attractions'], ['nature', 'Nature'], ['activity', 'Experiences'],
  ['food', 'Food and cafés'], ['shop', 'Shopping'], ['spiritual', 'Spiritual'], ['night', 'Nightlife'],
];
export const PACK_CATS = ['Documents', 'Clothing', 'Toiletries', 'Electronics', 'Medicines', 'Essentials', 'Destination-specific'];
