// Server-side environment. Values never leave the server: only booleans are ever returned to clients.
const v = (k: string) => (process.env[k] || '').trim();

export const env = {
  googlePlacesKey: () => v('GOOGLE_PLACES_SERVER_KEY'),
  unsplashKey: () => v('UNSPLASH_ACCESS_KEY'),
  supabaseUrl: () => v('SUPABASE_URL') || v('VITE_SUPABASE_URL'),
  supabaseAnonKey: () => v('SUPABASE_ANON_KEY') || v('VITE_SUPABASE_ANON_KEY'),
  supabaseServiceRole: () => v('SUPABASE_SERVICE_ROLE_KEY'),
  upstashUrl: () => v('UPSTASH_REDIS_REST_URL'),
  upstashToken: () => v('UPSTASH_REDIS_REST_TOKEN'),
  cronSecret: () => v('CRON_SECRET'),
  /** Optional override of a Google SKU's daily budget, e.g. GOOGLE_DAILY_BUDGET_TEXT_SEARCH_ENTERPRISE=150 */
  budgetOverride: (sku: string): number | null => {
    const raw = v('GOOGLE_DAILY_BUDGET_' + sku.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase());
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  },
};

/** Which providers are configured. Booleans only. */
export function configured() {
  return {
    googlePlaces: !!env.googlePlacesKey(),
    unsplash: !!env.unsplashKey(),
    supabase: !!(env.supabaseUrl() && env.supabaseAnonKey()),
    upstash: !!(env.upstashUrl() && env.upstashToken()),
  };
}
