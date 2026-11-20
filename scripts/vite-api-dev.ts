// Development only: serve /api/* from the same handler files Vercel deploys, so `npm run dev` has a working API.
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

/** Resolve /api/a/b to api/a/b.ts, api/a/b/index.ts, or a [param].ts file (param added to the query string). */
export function resolveApiFile(root: string, pathname: string): { file: string; params: Record<string, string> } | null {
  const segs = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (segs.some((s) => s.startsWith('_') || s.startsWith('.'))) return null;
  let dir = path.join(root, 'api');
  const params: Record<string, string> = {};
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const last = i === segs.length - 1;
    if (last && fs.existsSync(path.join(dir, s + '.ts'))) return { file: path.join(dir, s + '.ts'), params };
    if (fs.existsSync(path.join(dir, s)) && fs.statSync(path.join(dir, s)).isDirectory()) { dir = path.join(dir, s); continue; }
    const dyn = fs.readdirSync(dir).find((f) => /^\[[^\]]+\](\.ts)?$/.test(f));
    if (!dyn) return null;
    params[dyn.replace(/^\[|\](\.ts)?$/g, '')] = decodeURIComponent(s);
    if (dyn.endsWith('.ts')) return last ? { file: path.join(dir, dyn), params } : null;
    dir = path.join(dir, dyn);
  }
  const idx = path.join(dir, 'index.ts');
  return fs.existsSync(idx) ? { file: idx, params } : null;
}

export function apiDev(env: Record<string, string>): Plugin {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const hit = resolveApiFile(server.config.root, url.pathname);
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
