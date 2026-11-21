// POST /api/routes/legs  Live travel times needed Google Routes, which this site no longer uses. Travel times come
// from distance-based estimates instead.
import { ApiError, handler } from '../../_lib/http.js';
export const POST = handler({ methods: ['POST'] }, async () => { throw new ApiError(503, 'not_configured', 'Live travel times aren’t available'); });
