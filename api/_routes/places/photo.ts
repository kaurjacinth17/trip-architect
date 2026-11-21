// GET /api/places/photo  Kept for older clients. Photos are now direct Wikimedia Commons links.
import { handler, json } from '../../_lib/http.js';
export const GET = handler({ methods: ['GET'] }, async () => json({ uri: null }));
