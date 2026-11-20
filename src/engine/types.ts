export type Cat =
  | 'heritage' | 'sight' | 'nature' | 'spiritual' | 'activity' | 'food' | 'cafe' | 'shop' | 'night'
  | 'meal' | 'transit' | 'rest' | 'custom';
export type BestTime = 'am' | 'pm' | 'eve' | 'any';
export type PaceKey = 'relaxed' | 'balanced' | 'packed';
export type Tier = 0 | 1 | 2;
export type BudgetKey = 'travel' | 'stay' | 'food' | 'local' | 'act' | 'shop' | 'misc';
export type FactorKey = 'relax' | 'culture' | 'food' | 'shop' | 'night' | 'nature' | 'adventure' | 'value';
export type SceneType = 'fort' | 'lake' | 'beach' | 'backwater' | 'mountain' | 'ghat' | 'river' | 'colonial';

/** [id, name, cat, cluster, lat, lng, minutes, costPerPerson, bestTime, description, flags, weekdayOnly?] */
export type PlaceRaw =
  | [string, string, string, string, number, number, number, number, string, string, string]
  | [string, string, string, string, number, number, number, number, string, string, string, number];

export interface DestRaw {
  id: string;
  name: string;
  state: string;
  tag: string;
  moods: string[];
  bestFor: string;
  days: [number, number];
  pace: string;
  ease: string;
  good: number[];
  poor: number[];
  bestTime: string;
  climate: string[];
  center: [number, number];
  scene: [string, string, string, string];
  cost: { stay: [number, number, number]; food: [number, number, number]; local: [number, number, number] };
  scores: Record<FactorKey, number>;
  overview: string;
  why: string[];
  foods: string[];
  tips: string[];
  getThere: string;
  areas: [string, string, number, number][];
  places: PlaceRaw[];
}

export interface Place {
  pid: string;
  dest: string;
  n: string;
  cat: Cat;
  area: string;
  lat: number;
  lng: number;
  d: number;
  c: number;
  best: BestTime;
  desc: string;
  must: boolean;
  hidden: boolean;
  wd: number | null;
}

export interface Dest extends DestRaw {
  pl: Place[];
}

export interface LatLng {
  lat: number | null;
  lng: number | null;
}

export interface Item {
  id: string;
  pid: string | null;
  t: string;
  cat: Cat;
  /** start, minutes after midnight */
  s: number;
  /** duration, minutes */
  d: number;
  /** cost per person, INR */
  c: number;
  lat: number | null;
  lng: number | null;
  area: string;
  dest: string | null;
  pri: 'must' | 'nice';
  n: string;
  done: boolean;
}

export interface Day {
  dest: string;
  label: string;
  items: Item[];
}

export interface Prefs {
  natureCity: number;
  sightExp: number;
  foodShop: number;
  advComfort: number;
  tier: Tier;
}

export interface Expense {
  id: string;
  amt: number;
  cat: BudgetKey;
  date: string;
  paid: number;
  among: number[];
  note: string;
}

export type StayStatus = 'idea' | 'shortlisted' | 'booked';

export interface Stay {
  id: string;
  name: string;
  area: string;
  dest: string;
  lat: number | null;
  lng: number | null;
  price: number;
  nights: number;
  checkin: string;
  checkout: string;
  rating: number;
  link: string;
  notes: string;
  status: StayStatus;
}

export interface PackItem {
  id: string;
  cat: string;
  name: string;
  qty: number;
  done: boolean;
  custom?: boolean;
}

export type Budget = Record<BudgetKey, number>;

export interface Trip {
  id: string;
  name: string;
  dests: string[];
  start: string;
  days: number;
  group: string;
  travelers: string[];
  pace: PaceKey;
  prefs: Prefs;
  budgetTotal: number;
  plan: Day[];
  wish: Item[];
  budget: Budget;
  expenses: Expense[];
  stays: Stay[];
  pack: PackItem[];
  notes: string;
  created: number;
  updated: number;
  sample?: boolean;
  touched?: boolean;
}

export type Level = 'alert' | 'caution' | 'tip';

export type Fix =
  | { l: string; a: 'ptab'; v: 'lib' | 'wish' }
  | { l: string; a: 'moveOut'; di: number; v: number }
  | { l: string; a: 'cascade'; di: number }
  | { l: string; a: 'addTransit'; di: number; id: string; v: number }
  | { l: string; a: 'breakAfter'; di: number; id: string }
  | { l: string; a: 'addLunch'; di: number }
  | { l: string; a: 'route'; di: number }
  | { l: string; a: 'toEvening'; di: number; id: string }
  | { l: string; a: 'moveTo'; di: number; id: string; v: number }
  | { l: string; a: 'setAct'; v: number };

export type TripFix = Exclude<Fix, { a: 'ptab' }>;

export interface Warning {
  lvl: Level;
  k: string;
  title: string;
  body: string;
  id?: string;
  fix?: Fix | null;
  tab?: 'budget' | 'stays';
}

export interface TripAnalysis {
  days: Warning[][];
  trip: Warning[];
  count: { alert: number; caution: number };
}
