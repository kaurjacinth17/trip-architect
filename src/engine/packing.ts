import { D } from '../data/destinations';
import type { PackItem, Trip } from './types';
import { uid } from './util';

export function genPack(t: Pick<Trip, 'start' | 'dests' | 'days'>): PackItem[] {
  const months = t.start ? [new Date(t.start + 'T00:00:00').getMonth() + 1] : [];
  const cl = new Set(t.dests.flatMap((id) => D[id]?.climate || []));
  const days = t.days;
  const L: PackItem[] = [];
  const add = (cat: string, name: string, qty = 1) => L.push({ id: uid(), cat, name, qty, done: false });
  ['Photo ID (Aadhaar, licence or passport)', 'Train or flight tickets', 'Hotel confirmations', 'Emergency contacts on paper', 'Some cash for small vendors'].forEach((x) => add('Documents', x));
  add('Clothing', 'T-shirts or tops', Math.min(days, 7));
  add('Clothing', 'Trousers or skirts', Math.ceil(Math.min(days, 7) / 2));
  add('Clothing', 'Innerwear', Math.min(days + 1, 8));
  add('Clothing', 'Sleepwear');
  add('Clothing', 'Comfortable walking shoes');
  add('Clothing', 'Sandals or flip-flops');
  ['Toothbrush and toothpaste', 'Shampoo and soap', 'Deodorant', 'Sunscreen', 'Lip balm', 'Hand sanitiser', 'Wet wipes'].forEach((x) => add('Toiletries', x));
  ['Phone charger', 'Power bank', 'Earphones', 'Camera'].forEach((x) => add('Electronics', x));
  ['Personal medicines', 'Basic first-aid kit', 'ORS sachets'].forEach((x) => add('Medicines', x));
  ['Reusable water bottle', 'Day pack', 'Sunglasses'].forEach((x) => add('Essentials', x));
  const ds = 'Destination-specific';
  if (cl.has('hot')) { add(ds, 'Cap or sun hat'); add(ds, 'Light cotton clothes'); add(ds, 'Scarf or stole for sun and dust'); }
  if (cl.has('temple')) add(ds, 'Clothes covering shoulders and knees for temples');
  if (cl.has('beach')) { add(ds, 'Swimwear'); add(ds, 'Quick-dry towel'); add(ds, 'Waterproof phone pouch'); }
  if (cl.has('cold')) { add(ds, 'Thermals'); add(ds, 'Warm jacket'); add(ds, 'Gloves and beanie'); add(ds, 'Moisturiser'); }
  if (cl.has('hills')) { add(ds, 'Light layer for cool mornings'); add(ds, 'Shoes with grip for trails'); }
  if (cl.has('monsoon') || months.some((m) => m >= 6 && m <= 9)) add(ds, 'Umbrella or rain jacket');
  if (t.dests.includes('kerala') || cl.has('beach')) add(ds, 'Mosquito repellent');
  if (t.dests.includes('jaipur') && months.some((m) => m === 12 || m === 1)) add(ds, 'Light jacket for cold evenings');
  return L;
}

/** Rebuild suggestions, keeping ticks/quantities of matching items and every item the user added. */
export function rebuildPack(t: Trip): PackItem[] {
  const old = new Map(t.pack.map((x) => [x.name, x]));
  const fresh = genPack(t).map((x) => (old.has(x.name) ? { ...x, done: old.get(x.name)!.done, qty: old.get(x.name)!.qty } : x));
  return fresh.concat(t.pack.filter((x) => x.custom));
}
