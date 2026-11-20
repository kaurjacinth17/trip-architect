// Map tile configuration. Override with VITE_TILE_URL / VITE_TILE_ATTRIBUTION at build time.
export const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Plain-text form for the footer. */
export const TILE_ATTRIBUTION_TEXT = TILE_ATTRIBUTION.replace(/<[^>]+>/g, '').replace(/&copy;/g, '©').replace(/&amp;/g, '&');
