// GET /api/places/summary?id=…  Kept for older clients; destination overviews come from Wikipedia (/api/summary).
import { handler, json } from '../../_lib/http.js';
export const GET = handler({ methods: ['GET'] }, async () => json({ summary: null }));
