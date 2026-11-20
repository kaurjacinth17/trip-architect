import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { useTrips } from './store/trips';
import './styles/global.css';

// First visit: create the sample trip (kept out of storage until edited).
useTrips.getState().ensureSample();

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
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
