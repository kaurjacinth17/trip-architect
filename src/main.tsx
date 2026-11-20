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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
