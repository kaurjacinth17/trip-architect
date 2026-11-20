// Daily call budget per Google Maps Platform SKU, so monthly use stays under the free usage.
//
// Google's console only offers per-minute quotas for Places API (New), so the daily cap is enforced here.
// Defaults are floor(monthly free usage / 31) minus a margin, from "Google Maps Platform core services
// pricing list – India" (checked 20 Nov 2026). With Upstash configured the counter is shared by every
// function instance; without it each instance counts separately (development only).
import { ApiError } from './http';
import { env } from './env';
import { redis } from './redis';

export type Sku =
  | 'autocomplete'                 // Autocomplete Requests (India): 70,000 free / month
  | 'detailsEssentials'            // Place Details Essentials (India): 70,000
  | 'detailsPro'                   // Place Details Pro (India): 35,000
  | 'detailsEnterprise'            // Place Details Enterprise (India): 7,000
  | 'detailsEnterpriseAtmosphere'  // Place Details Enterprise + Atmosphere (India): 7,000
  | 'textSearchPro'                // Text Search Pro (India): 35,000
  | 'textSearchEnterprise'         // Text Search Enterprise (India): 7,000
  | 'nearbySearchEnterprise'       // Nearby Search Enterprise (India): 7,000
  | 'placePhotos'                  // Place Details Photos (India): 7,000
  | 'routesEssentials';            // Routes: Compute Routes Essentials (India): 70,000

export const MONTHLY_FREE: Record<Sku, number> = {
  autocomplete: 70_000,
  detailsEssentials: 70_000,
  detailsPro: 35_000,
  detailsEnterprise: 7_000,
  detailsEnterpriseAtmosphere: 7_000,
  textSearchPro: 35_000,
  textSearchEnterprise: 7_000,
  nearbySearchEnterprise: 7_000,
  placePhotos: 7_000,
  routesEssentials: 70_000,
};

/** 31 days at the default never exceeds the monthly free usage (e.g. 7,000 → 220/day → 6,820 in a 31-day month). */
export const DEFAULT_DAILY: Record<Sku, number> = Object.fromEntries(
  Object.entries(MONTHLY_FREE).map(([k, m]) => [k, Math.floor((m / 31) * 0.975)]),
) as Record<Sku, number>;

export const dailyLimit = (sku: Sku) => env.budgetOverride(sku) ?? DEFAULT_DAILY[sku];

const memory = new Map<string, number>();
const today = () => new Date().toISOString().slice(0, 10); // UTC day

export const QUOTA_MESSAGE = 'Live place data is resting for today; showing saved and curated info.';

/** Count one call against today's budget for `sku`, or throw `quota_exhausted` (without calling Google). */
export async function spend(sku: Sku, n = 1): Promise<void> {
  const limit = dailyLimit(sku);
  const key = `ta:budget:${sku}:${today()}`;
  const r = redis();
  let used: number;
  if (r) {
    used = await r.incrby(key, n);
    if (used === n) await r.expire(key, 60 * 60 * 48);
  } else {
    used = (memory.get(key) || 0) + n;
    memory.set(key, used);
  }
  if (used > limit) throw new ApiError(503, 'quota_exhausted', QUOTA_MESSAGE);
}

/** Today's usage, for /api/health (numbers only). */
export async function usage(): Promise<Record<Sku, { used: number; limit: number }>> {
  const r = redis();
  const out = {} as Record<Sku, { used: number; limit: number }>;
  for (const sku of Object.keys(MONTHLY_FREE) as Sku[]) {
    const key = `ta:budget:${sku}:${today()}`;
    const used = r ? Number((await r.get<number>(key)) || 0) : memory.get(key) || 0;
    out[sku] = { used, limit: dailyLimit(sku) };
  }
  return out;
}

/** Tests only. */
export function _resetBudget() {
  memory.clear();
}
