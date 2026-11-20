/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { apiDev } from './scripts/vite-api-dev';

const DEST_IDS = ['jaipur', 'udaipur', 'goa', 'kerala', 'manali', 'varanasi', 'rishikesh', 'pondicherry'];

/** Emit robots.txt and sitemap.xml for the public pages, using VITE_SITE_URL. */
function seoFiles(site: string): Plugin {
  const pages = ['/', '/explore', '/compare', '/new', '/about', ...DEST_IDS.map((id) => `/destinations/${id}`)];
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /trips/\nDisallow: /shared\n\nSitemap: ${site}/sitemap.xml\n` });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const site = (env.VITE_SITE_URL || 'https://trip-architect.vercel.app').replace(/\/$/, '');
  process.env.VITE_SITE_URL = site; // used by %VITE_SITE_URL% in index.html
  return {
    plugins: [react(), seoFiles(site), apiDev(env)],
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            leaflet: ['leaflet', 'react-leaflet'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'tests/api/**/*.test.ts'],
      environmentMatchGlobs: [['tests/api/**', 'node']],
    },
  };
});
