import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { checkHealth } from './lib/liveStatus';
import { makeQueryClient } from './lib/query';
import { App } from './App';
import { useTrips } from './store/trips';
import './styles/global.css';

// First visit: create the sample trip (kept out of storage until edited).
useTrips.getState().ensureSample();

// Which live providers this deployment has (a cheap call; no Google request).
void checkHealth();
const queryClient = makeQueryClient();

// Responsive tables: label each `.stack` cell with its column header (ported from the reference).
new MutationObserver(() => {
  for (const c of document.querySelectorAll<HTMLTableCellElement>('.stack td:not([data-l])')) {
    let i = 0;
    let p: Element | null = c;
    while ((p = p.previousElementSibling)) i += (p as HTMLTableCellElement).colSpan;
    c.dataset.l = c.closest('table')?.rows[0]?.cells[i]?.textContent || '';
  }
}).observe(document, { childList: true, subtree: true });

// Installable app: cache the app shell so trips open offline (production builds only).
const deployed = import.meta.env.PROD && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
if (deployed && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(() => {
      // Warm the cache with the trip screens (loaded on demand) so they open offline later.
      const warm = () => { void import('./pages/trip/TripPage'); void import('./pages/trip/Studio'); void import('./pages/trip/TripMap'); void import('./pages/Destination'); };
      if ('requestIdleCallback' in window) requestIdleCallback(warm); else setTimeout(warm, 3000);
    }).catch(() => {});
  });
}
// Vercel Web Analytics (cookie-free page views) and, only when a DSN is set, Sentry error reports.
if (deployed) void import('@vercel/analytics').then((m) => m.inject({ mode: 'production' })).catch(() => {});
if (import.meta.env.VITE_SENTRY_DSN) {
  void import('@sentry/react').then((S) => S.init({ dsn: import.meta.env.VITE_SENTRY_DSN, tracesSampleRate: 0, sendDefaultPii: false, environment: import.meta.env.MODE })).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
