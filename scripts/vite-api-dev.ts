// Development only: serve /api/* through the same router function Vercel deploys, so `npm run dev` has a working API.
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

export function apiDev(env: Record<string, string>): Plugin {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        // Everything goes through the same single router function Vercel deploys (api/router.ts).
        const hit = { file: path.join(server.config.root, 'api', 'router.ts'), params: {} as Record<string, string> };
        const send = (status: number, body: string) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(body); };
        if (!hit) return send(404, JSON.stringify({ error: { code: 'not_found', message: 'No such endpoint' } }));
        for (const [k, v] of Object.entries(hit.params)) url.searchParams.set(k, v);
        try {
          const mod = await server.ssrLoadModule(hit.file);
          const fn = mod[req.method || 'GET'];
          if (typeof fn !== 'function') return send(405, JSON.stringify({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }));
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
          const request = new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
          const r: Response = await fn(request);
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(String(e));
          send(500, JSON.stringify({ error: { code: 'internal', message: 'Something went wrong' } }));
        }
      });
    },
  };
}
