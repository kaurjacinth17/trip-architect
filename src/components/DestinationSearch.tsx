// Search any destination: curated guides instantly, any city, town, hill station, island, region or park from
// Google, or a custom place with a dropped pin. Accessible combobox (arrow keys, Enter, Escape).
import { lazy, Suspense, useId, useMemo, useRef, useState } from 'react';
import type { DestRecord } from '../engine/types';
import { fetchDestinationRecord, newSessionToken, useDestinationSuggestions, type Suggestion } from '../lib/live';
import { ApiClientError } from '../lib/api';
import { useDestCache } from '../store/dests';
import { toast } from '../store/toast';

const CustomDestinationDialog = lazy(() => import('./CustomDestinationDialog'));

export interface PickedDest { key: string; name: string; record?: DestRecord }

export function DestinationSearch({ onPick, label = 'Search any destination', placeholder = 'City, town, hill station, island, region or park', exclude = [], autoFocus }: {
  onPick: (d: PickedDest) => void;
  label?: string;
  placeholder?: string;
  exclude?: string[];
  autoFocus?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const session = useRef(newSessionToken());
  const { items: raw, loading, live } = useDestinationSuggestions(q, session.current);
  const items = useMemo(() => raw.filter((s) => !exclude.includes(s.key)), [raw, exclude]);
  const put = useDestCache((s) => s.put);
  const total = items.length + 1; // + "add a custom place"

  const choose = async (s: Suggestion) => {
    setOpen(false);
    if (s.kind === 'curated') { onPick({ key: s.key, name: s.name }); setQ(''); return; }
    setBusy(true);
    try {
      const rec = await fetchDestinationRecord(s.placeId!, session.current);
      session.current = newSessionToken(); // a session ends with the details call
      put(rec);
      onPick({ key: rec.key, name: rec.name, record: rec });
      setQ('');
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : 'Couldn’t load that destination');
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % total); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + total) % total); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (active < items.length) void choose(items[active]); else setCustom(true); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const listId = id + '-list';
  return (
    <div className="dsearch">
      <label className="f" htmlFor={id + '-in'}>{label}
        <input id={id + '-in'} type="text" role="combobox" aria-expanded={open && q.length > 0} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && q ? `${id}-o${active}` : undefined} autoComplete="off" autoFocus={autoFocus}
          value={q} placeholder={placeholder} disabled={busy}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
      </label>
      {open && q.trim().length > 0 && (
        <ul className="dsugg" id={listId} role="listbox" aria-label="Destinations">
          {items.map((s, i) => (
            <li key={s.key} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); void choose(s); }} onMouseEnter={() => setActive(i)}>
              <b>{s.name}</b><span className="tiny muted">{s.secondary}</span>
            </li>
          ))}
          {loading && <li className="tiny muted" aria-live="polite">Searching…</li>}
          {!live && q.trim().length >= 2 && <li className="tiny muted">Showing curated guides only; worldwide search isn’t available right now.</li>}
          <li id={`${id}-o${items.length}`} role="option" aria-selected={active === items.length} className={'dcustom' + (active === items.length ? ' on' : '')}
            onMouseDown={(e) => { e.preventDefault(); setCustom(true); setOpen(false); }}>
            <b>Can’t find it? Add “{q.trim()}” as a custom place</b><span className="tiny muted">Name it and drop a pin on the map</span>
          </li>
          {live && items.some((s) => s.kind === 'google') && <li className="gattr" aria-hidden="true"><span>© OpenStreetMap</span></li>}
        </ul>
      )}
      {busy && <p className="tiny muted" role="status">Loading destination…</p>}
      {custom && (
        <Suspense fallback={null}>
          <CustomDestinationDialog initialName={q.trim()} onClose={() => setCustom(false)} onCreate={(rec) => { put(rec); setCustom(false); setQ(''); onPick({ key: rec.key, name: rec.name, record: rec }); }} />
        </Suspense>
      )}
    </div>
  );
}
