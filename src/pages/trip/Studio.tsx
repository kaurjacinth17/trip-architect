// Itinerary Studio: day rail, hanging-time timeline and side panel (reference `tPlan` + `panel`), with
// @dnd-kit drag and drop that follows the reference `drop` handler's semantics.
import { destName, destView } from '../../engine/dest';
import { poolFromLive } from '../../engine/livePool';
import { usePlaceList } from '../../lib/live';
import { DestinationSearch } from '../../components/DestinationSearch';
import { Modal } from '../../components/Modal';
import {
  DndContext, DragOverlay, MeasuringStrategy, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { WarningCard } from '../../components/Cards';
import { BEST, CATS, LIB_CATS, paceOf } from '../../data/constants';
import { D, PL } from '../../data/destinations';
import { fmtDist, geo, km, travelMin, trm } from '../../engine/geo';
import {
  cascade, cascadeOrdered, customItem, dayCentre, dayStats, findItem, isAct, itemFromPlace, placeOnDay, pullItem,
  routeOrder, sortDay, startFor, tidy, travellers,
} from '../../engine/schedule';
import { dayDate, fmtD, fmtT, hm } from '../../engine/time';
import type { Item, Trip, TripAnalysis } from '../../engine/types';
import { inr, plural, up15, up5 } from '../../engine/util';
import { mut } from '../../lib/actions';
import { toast } from '../../store/toast';
import { useUI, type PanelTab } from '../../store/ui';
import { ItemDialog } from './ItemDialog';
import { changeDays } from './Overview';
import type { TabProps } from './TripPage';

type DragKind = 'item' | 'lib' | 'wish';
interface DragData { k: DragKind; id: string; title: string; col: string }
type DropData = { kind: 'blk'; id: string } | { kind: 'day'; di: number } | { kind: 'list' } | { kind: 'wish' };
interface Indicator { over: string | null; before: boolean }

const PRIORITY: Record<DropData['kind'], number> = { day: 0, wish: 1, blk: 2, list: 3 };
/** Only count droppables under the pointer; prefer a day or the wishlist over a block, and a block over the list. */
const collide: CollisionDetection = (args) => {
  // Sticky targets (day rail, Wishlist tab) don't move when the page auto-scrolls mid-drag, so test the pointer
  // against where they actually are on screen right now.
  const p = args.pointerCoordinates;
  if (p) {
    for (const c of args.droppableContainers) {
      const kind = (c.data.current as DropData | undefined)?.kind;
      if (kind !== 'day' && kind !== 'wish') continue;
      const r = c.node.current?.getBoundingClientRect();
      if (r && r.width && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) return [{ id: c.id, data: { droppableContainer: c, value: 0 } }];
    }
  }
  return pointerWithin(args).sort((a, b) => {
    const ka = (args.droppableContainers.find((c) => c.id === a.id)?.data.current as DropData | undefined)?.kind ?? 'list';
    const kb = (args.droppableContainers.find((c) => c.id === b.id)?.data.current as DropData | undefined)?.kind ?? 'list';
    return PRIORITY[ka] - PRIORITY[kb];
  });
};

function pointerY(e: DragMoveEvent | DragEndEvent): number {
  const a = e.activatorEvent as MouseEvent & TouchEvent;
  const y = a.touches?.length ? a.touches[0].clientY : a.changedTouches?.length ? a.changedTouches[0].clientY : a.clientY;
  return y + e.delta.y;
}

export default function Studio({ t, A, fix, goDay: _goDay }: TabProps) {
  const ui = useUI();
  const di = Math.min(ui.day, t.plan.length - 1);
  const [dialog, setDialog] = useState<{ x: Item; di: number; isNew: boolean } | null>(null);
  const [drag, setDrag] = useState<DragData | null>(null);
  const [ind, setInd] = useState<Indicator>({ over: null, before: false });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const onStart = (e: DragStartEvent) => setDrag(e.active.data.current as DragData);
  const onMove = (e: DragMoveEvent) => {
    const o = e.over;
    const before = o ? pointerY(e) < o.rect.top + o.rect.height / 2 : false;
    const over = o ? String(o.id) : null;
    if (over !== ind.over || before !== ind.before) setInd({ over, before });
  };
  const reset = () => { setDrag(null); setInd({ over: null, before: false }); };

  const onEnd = (e: DragEndEvent) => {
    const d = e.active.data.current as DragData;
    const tgt = e.over?.data.current as DropData | undefined;
    const before = e.over ? pointerY(e) < e.over.rect.top + e.over.rect.height / 2 : false;
    reset();
    if (!d || !tgt) return;
    if (tgt.kind === 'wish') {
      if (d.k === 'item') mut(t.id, (tt) => { const f = pullItem(tt, d.id); if (!f) return false; tt.wish.push(f.x); }, 'Moved to wishlist', true);
      else if (d.k === 'lib') mut(t.id, (tt) => { if (tt.wish.some((w) => w.pid === d.id)) return false; tt.wish.push(itemFromPlace(PL[d.id])); }, 'Saved to wishlist');
      return;
    }
    const target = tgt.kind === 'day' ? tgt.di : di;
    const refId = tgt.kind === 'blk' ? tgt.id : null;
    if (refId === d.id) return;
    mut(t.id, (tt) => {
      let x: Item | null | undefined;
      if (d.k === 'item') x = pullItem(tt, d.id)?.x;
      else if (d.k === 'lib') x = PL[d.id] ? itemFromPlace(PL[d.id]) : null;
      else { const i = tt.wish.findIndex((w) => w.id === d.id); x = i >= 0 ? tt.wish.splice(i, 1)[0] : null; }
      if (!x) return false;
      const day = tt.plan[target];
      if (!x.dest) x.dest = day.dest;
      sortDay(day);
      const idx = refId ? day.items.findIndex((y) => y.id === refId) : -1;
      if (idx >= 0) {
        const ref = day.items[idx];
        if (before) {
          const prev = day.items[idx - 1];
          x.s = prev ? up5(prev.s + prev.d + trm(prev, x)) : Math.max(360, up5(ref.s - x.d - trm(x, ref)));
          day.items.splice(idx, 0, x);
        } else {
          x.s = up5(ref.s + ref.d + trm(ref, x));
          day.items.splice(idx + 1, 0, x);
        }
        cascadeOrdered(day);
      } else {
        x.s = startFor(tt, day, x);
        day.items.push(x);
        cascade(day);
      }
    }, tgt.kind === 'day' ? `Moved to Day ${target + 1}` : d.k === 'item' ? undefined : `Added to Day ${target + 1}`, true);
  };

  const addCustom = () => {
    const day = t.plan[di];
    const x = customItem({ dest: day.dest });
    x.s = ui.slot ?? startFor(t, structuredClone(day), x);
    setDialog({ x, di, isNew: true });
  };

  return (
    // Drop targets in the day rail and the side-panel tabs are `position: sticky`: while auto-scrolling, dnd-kit
    // would assume they moved with the page, so they're re-measured throughout the drag.
    <DndContext sensors={sensors} collisionDetection={collide} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={onStart} onDragMove={onMove} onDragEnd={onEnd} onDragCancel={reset}
      accessibility={{
        screenReaderInstructions: { draggable: 'Drag with a mouse, or press and hold on touch screens. Keyboard users can reorder with the ↑ and ↓ buttons.' },
        announcements: {
          onDragStart: () => `Picked up ${drag?.title ?? 'activity'}.`,
          onDragOver: () => undefined,
          onDragEnd: ({ over }) => (over ? 'Dropped.' : 'Dropped outside the plan; nothing changed.'),
          onDragCancel: () => 'Drag cancelled.',
        },
      }}>
      <div className="studio">
        <DayRail t={t} A={A} di={di} ind={ind} />
        <DayMain t={t} A={A} di={di} ind={ind} drag={drag} onEdit={(x) => setDialog({ x, di, isNew: false })} onAddCustom={addCustom} />
        <aside className="panel" aria-label="Checks, places and wishlist">
          <Panel t={t} A={A} di={di} ind={ind} fix={fix} />
        </aside>
      </div>
      <DragOverlay dropAnimation={null}>
        {drag && <div className="dragov" style={{ '--c': drag.col } as React.CSSProperties}>{drag.title}</div>}
      </DragOverlay>
      {dialog && <ItemDialog t={t} x={dialog.x} di={dialog.di} isNew={dialog.isNew} onClose={() => setDialog(null)} />}
    </DndContext>
  );
}

/* ----------------------------------------------------------------------------------------------- rail */

function DayButton({ t, A, i, on, over }: { t: Trip; A: TripAnalysis; i: number; on: boolean; over: boolean }) {
  const { setNodeRef } = useDroppable({ id: 'day:' + i, data: { kind: 'day', di: i } satisfies DropData });
  const d = t.plan[i];
  const s = dayStats(d);
  const a = A.days[i].filter((w) => w.lvl === 'alert').length, c = A.days[i].filter((w) => w.lvl === 'caution').length;
  const ratio = s.actMin / paceOf(t.pace).cap;
  const date = dayDate(t, i);
  return (
    <button ref={setNodeRef} type="button" className={'dayb' + (on ? ' on' : '') + (over ? ' drop' : '')} aria-current={on ? 'true' : undefined}
      data-dropday={i} onClick={() => useUI.getState().set({ day: i, slot: null })}>
      <span className="row between" style={{ flexWrap: 'nowrap' }}>
        <b>Day {i + 1}</b>
        <span className="flags">
          {a > 0 && <i className="a" aria-label={plural(a, 'alert')}>{a}</i>}
          {c > 0 && <i className="c" aria-label={plural(c, 'caution')}>{c}</i>}
        </span>
      </span>
      <span className="lbl">{date ? fmtD(date) + ' · ' : ''}{d.label || destName(t, d.dest)}</span>
      <div className={'meter' + (ratio > 1.1 ? ' bad' : ratio > 1 ? ' warn' : '')}><i style={{ width: Math.min(100, ratio * 100) + '%' }} /></div>
      <span className="tiny muted">{hm(s.actMin)} planned</span>
    </button>
  );
}

function DayRail({ t, A, di, ind }: { t: Trip; A: TripAnalysis; di: number; ind: Indicator }) {
  return (
    <nav className="rail" aria-label="Days">
      {t.plan.map((_, i) => <DayButton key={i} t={t} A={A} i={i} on={i === di} over={ind.over === 'day:' + i} />)}
      <button type="button" className="btn sm" onClick={() => changeDays(t.id, 1)}>Add a day</button>
    </nav>
  );
}

/* ------------------------------------------------------------------------------------------- timeline */

function Block({ t, x, flagged, ind, onEdit }: { t: Trip; x: Item; flagged: boolean; ind: Indicator; onEdit: () => void }) {
  const cat = CATS[x.cat] || CATS.custom;
  const p = x.pid ? PL[x.pid] : undefined;
  const drag = useDraggable({ id: 'item:' + x.id, data: { k: 'item', id: x.id, title: x.t, col: cat[1] } satisfies DragData });
  const drop = useDroppable({ id: 'blk:' + x.id, data: { kind: 'blk', id: x.id } satisfies DropData });
  const over = ind.over === 'blk:' + x.id && !drag.isDragging;
  const id = t.id;
  const act = (fn: (tt: Trip) => false | void, msg?: string, undo?: boolean) => mut(id, fn, msg, undo);
  const nudge = (dir: number) => act((tt) => {
    const f = findItem(tt, x.id);
    if (!f) return false;
    sortDay(f.day);
    const it = f.day.items;
    const i = it.indexOf(f.x), j = i + dir;
    if (j < 0 || j >= it.length) return false;
    const s0 = Math.min(it[i].s, it[j].s);
    [it[i], it[j]] = [it[j], it[i]];
    it[Math.min(i, j)].s = s0;
    cascadeOrdered(f.day);
  });
  return (
    <div
      ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      {...drag.listeners}
      className={['blk', x.done && 'done', flagged && 'flag-a', drag.isDragging && 'dragging', over && (ind.before ? 'over-top' : 'over-bot')].filter(Boolean).join(' ')}
      style={{ '--c': cat[1] } as React.CSSProperties}
      data-id={x.id}
    >
      <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'start' }}>
        <span className="bt">{x.t}</span>
        {x.pri === 'must' && <span className="tag t">Must-do</span>}
      </div>
      <div className="bm">
        <span className="tag" style={{ color: cat[1] }}>{cat[0]}</span>
        <span>until {fmtT(x.s + x.d)}</span>
        {x.area && <span>{x.area}</span>}
        {x.c > 0 && <span>{inr(x.c)} pp</span>}
        {p && p.best !== 'any' && <span>{BEST[p.best]}</span>}
      </div>
      {x.n && <div className="bnote">{x.n}</div>}
      <div className="bctl noprint">
        <button type="button" aria-pressed={x.done} aria-label={`Mark ${x.t} done`} onClick={() => act((tt) => { const f = findItem(tt, x.id); if (!f) return false; f.x.done = !f.x.done; })}>{x.done ? 'Undo done' : 'Done'}</button>
        <button type="button" aria-label={`Shorten ${x.t} by 15 minutes`} onClick={() => act((tt) => { const f = findItem(tt, x.id); if (!f) return false; f.x.d = Math.max(15, f.x.d - 15); cascade(f.day); })}>−15m</button>
        <button type="button" aria-label={`Lengthen ${x.t} by 15 minutes`} onClick={() => act((tt) => { const f = findItem(tt, x.id); if (!f) return false; f.x.d = Math.max(15, f.x.d + 15); cascade(f.day); })}>+15m</button>
        <button type="button" aria-label={`Move ${x.t} up`} onClick={() => nudge(-1)}>↑</button>
        <button type="button" aria-label={`Move ${x.t} down`} onClick={() => nudge(1)}>↓</button>
        <button type="button" aria-label={`Edit ${x.t}`} onClick={onEdit}>Edit</button>
        <button type="button" aria-label={`Delete ${x.t}`} style={{ color: 'var(--alert)' }} onClick={() => act((tt) => { if (!pullItem(tt, x.id)) return false; }, 'Activity deleted', true)}>Delete</button>
      </div>
    </div>
  );
}

function Gap({ p, x }: { p: Item; x: Item }) {
  const end = p.s + p.d, gap = x.s - end;
  const d = geo(p) && geo(x) ? km(p, x) : null;
  const tr = travelMin(d);
  const bad = (d != null && gap < tr) || gap < 0;
  return (
    <div className={'gap' + (bad ? ' bad' : '')}>
      {d != null && <span>{d < 1.5 ? Math.round(d * 1000) + ' m walk' : d.toFixed(1) + ' km ride'} · ~{tr} min</span>}
      {gap < 0 ? <span>Overlaps by {hm(-gap)}</span> : bad ? <span>only {gap} min left</span> : null}
      {gap - tr >= 60 && (
        <button type="button" className="free" onClick={() => useUI.getState().set({ slot: up15(end + tr), ptab: 'lib' })}>Free {hm(gap - tr)} · add something</button>
      )}
    </div>
  );
}

function TimelineDrop({ children, di, active }: { children: ReactNode; di: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'list', data: { kind: 'list' } satisfies DropData });
  return <div ref={setNodeRef} className={'tl' + (isOver && active ? ' drop-list' : '')} data-droplist={di}>{children}</div>;
}

function DayMain({ t, A, di, ind, drag, onEdit, onAddCustom }: {
  t: Trip; A: TripAnalysis; di: number; ind: Indicator; drag: DragData | null; onEdit: (x: Item) => void; onAddCustom: () => void;
}) {
  const day = t.plan[di];
  const st = dayStats(day);
  const W = A.days[di];
  const flagged = new Set(W.filter((w) => w.lvl === 'alert' && w.id).map((w) => w.id));
  const date = dayDate(t, di);
  const set = useUI((s) => s.set);
  const [pickDest, setPickDest] = useState(false);
  const action = (fn: (tt: Trip) => false | void, msg: string) => mut(t.id, fn, msg, true);

  return (
    <div>
      <div className="dayhead">
        <div className="row between" style={{ alignItems: 'center' }}>
          <h2 className="kicker" style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 700 }}>Day {di + 1}{date ? ' · ' + fmtD(date) : ''}</h2>
          <span className="tiny muted">
            {plural(st.acts.length, 'activity', 'activities')} · {hm(st.actMin)} · {hm(st.travel)} travel · {st.free ? hm(st.free) + ' free' : 'no free time'} · {inr(st.cost * travellers(t))} entries
          </span>
        </div>
        <DayTitle key={t.id + di} t={t} di={di} />
        <div className="row" style={{ gap: 6 }}>
          <select value={day.dest} style={{ width: 'auto' }} aria-label="Destination for this day" onChange={(e) => {
            if (e.target.value === '__new') { setPickDest(true); return; }
            mut(t.id, (tt) => { tt.plan[di].dest = e.target.value; });
          }}>
            {t.dests.map((id) => <option key={id} value={id}>{destName(t, id)}</option>)}
            <option value="__new">Another destination…</option>
          </select>
          <button type="button" className="btn sm" onClick={onAddCustom}>Add custom activity</button>
          <button type="button" className="btn sm" onClick={() => set({ ptab: 'lib' })}>Add from library</button>
          <button type="button" className="btn sm" title="Remove gaps and add travel buffers" onClick={() => action((tt) => { const d = tt.plan[di]; if (!d.items.length) return false; tidy(d); }, 'Times tidied')}>Tidy times</button>
          <button type="button" className="btn sm" title="Reorder by distance" onClick={() => {
            if (dayStats(day).it.filter(geo).length < 3) { toast('Needs at least three mapped places'); return; }
            action((tt) => { if (!routeOrder(tt.plan[di])) return false; }, 'Reordered by distance');
          }}>Optimise route</button>
          <button type="button" className="btn sm ghost" onClick={() => action((tt) => {
            const d = tt.plan[di];
            if (!d.items.length) return false;
            tt.wish.push(...d.items.filter(isAct));
            d.items = [];
          }, 'Day cleared; activities moved to wishlist')}>Clear day</button>
        </div>
      </div>
      <TimelineDrop di={di} active={!!drag}>
        {st.it.length ? st.it.map((x, i) => (
          <div key={x.id}>
            {i > 0 && <Gap p={st.it[i - 1]} x={x} />}
            <div className="slot">
              <div className="time">{fmtT(x.s).replace(' ', ' ')}<small>{hm(x.d)}</small></div>
              <Block t={t} x={x} flagged={flagged.has(x.id)} ind={ind} onEdit={() => onEdit(x)} />
            </div>
          </div>
        )) : (
          <div className="empty">
            <b>Nothing planned for Day {di + 1}</b>
            <span className="small">Drag places in from the library or wishlist, or add your own.</span>
            <div className="row">
              <button type="button" className="btn pri sm" onClick={() => set({ ptab: 'lib' })}>Browse places</button>
              <button type="button" className="btn sm" onClick={onAddCustom}>Add custom activity</button>
            </div>
          </div>
        )}
      </TimelineDrop>
      {pickDest && (
        <Modal title={`Destination for Day ${di + 1}`} onClose={() => setPickDest(false)}>
          <h2>Destination for Day {di + 1}</h2>
          <p className="small muted">Pick any place. It’s added to the trip’s route and this day moves there; nothing else changes.</p>
          <DestinationSearch autoFocus exclude={t.dests} onPick={(d) => {
            setPickDest(false);
            mut(t.id, (tt) => {
              if (!tt.dests.includes(d.key)) tt.dests.push(d.key);
              if (d.record) tt.destRecords = { ...(tt.destRecords || {}), [d.key]: d.record };
              tt.plan[di].dest = d.key;
            }, `Day ${di + 1} is now in ${d.name}`, true);
          }} />
        </Modal>
      )}
      <p className="tiny muted" style={{ marginTop: 14 }}>Drag blocks to reorder or drop them on another day (press and hold on touch screens); ↑ and ↓ reorder from the keyboard. Edit has duplicate and move to wishlist. Times only ever move later on their own; use Tidy times to close gaps.</p>
    </div>
  );
}

function DayTitle({ t, di }: { t: Trip; di: number }) {
  const label = t.plan[di].label;
  const [v, setV] = useState(label);
  const [last, setLast] = useState(label);
  if (label !== last) { setLast(label); setV(label); }
  const commit = () => { if (v.trim() !== label) mut(t.id, (tt) => { tt.plan[di].label = v.trim(); }); };
  return (
    <input className="title" type="text" value={v} placeholder="Name this day" aria-label="Day title"
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
  );
}

/* ----------------------------------------------------------------------------------------------- panel */

function PanelTabButton({ k, on, children, over }: { k: PanelTab; on: boolean; children: ReactNode; over?: boolean }) {
  const drop = useDroppable({ id: 'wishtab', data: { kind: 'wish' } satisfies DropData, disabled: k !== 'wish' });
  return (
    <button ref={k === 'wish' ? drop.setNodeRef : undefined} type="button" role="tab" aria-selected={on}
      className={(on ? 'on' : '') + (over ? ' drop' : '')} onClick={() => useUI.getState().set({ ptab: k })}>
      {children}
    </button>
  );
}

function LibItem({ t, pid, inPlan, dist, onAdd }: { t: Trip; pid: string; inPlan: boolean; dist: number | null; onAdd: () => void }) {
  const p = PL[pid];
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: 'lib:' + pid, data: { k: 'lib', id: pid, title: p.n, col: CATS[p.cat][1] } satisfies DragData });
  return (
    <div ref={setNodeRef} {...listeners} className="li" data-drag="lib" style={isDragging ? { opacity: 0.4 } : undefined}>
      <div>
        <div className="nm">{p.n}{inPlan && <> <span className="tag f">Planned</span></>}</div>
        <div className="mt">{CATS[p.cat][0]} · {hm(p.d)} · {p.c ? inr(p.c) : 'Free'}{dist != null ? ` · ${fmtDist(dist)} away` : ''}{t.dests.length > 1 ? ' · ' + destName(t, p.dest) : ''}</div>
      </div>
      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <button type="button" className="btn sm icon" aria-label={`Save ${p.n} to wishlist`} title="Save to wishlist"
          onClick={() => mut(t.id, (tt) => { if (tt.wish.some((w) => w.pid === pid)) return false; tt.wish.push(itemFromPlace(p)); }, 'Saved to wishlist')}>♡</button>
        <button type="button" className="btn sm pri" aria-label={`Add ${p.n}`} onClick={onAdd}>Add</button>
      </div>
    </div>
  );
}

function WishItem({ t, x, di }: { t: Trip; x: Item; di: number }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: 'wish:' + x.id, data: { k: 'wish', id: x.id, title: x.t, col: (CATS[x.cat] || CATS.custom)[1] } satisfies DragData });
  const add = () => {
    const at = useUI.getState().slot;
    useUI.getState().set({ slot: null });
    mut(t.id, (tt) => {
      const i = tt.wish.findIndex((w) => w.id === x.id);
      if (i < 0) return false;
      placeOnDay(tt, di, tt.wish.splice(i, 1)[0], at);
    }, `Added to Day ${di + 1}`, true);
  };
  return (
    <div ref={setNodeRef} {...listeners} className="li" data-drag="wish" style={isDragging ? { opacity: 0.4 } : undefined}>
      <div>
        <div className="nm">{x.t}</div>
        <div className="mt">{CATS[x.cat]?.[0] || 'Custom'} · {hm(x.d)}{x.c ? ' · ' + inr(x.c) : ''}{x.area ? ' · ' + x.area : ''}</div>
      </div>
      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <button type="button" className="btn sm icon" aria-label={`Remove ${x.t} from wishlist`} onClick={() => mut(t.id, (tt) => { tt.wish = tt.wish.filter((w) => w.id !== x.id); }, 'Removed from wishlist', true)}>×</button>
        <button type="button" className="btn sm pri" onClick={add}>Add to Day {di + 1}</button>
      </div>
    </div>
  );
}

function WishList({ t, di, ind }: { t: Trip; di: number; ind: Indicator }) {
  const { setNodeRef } = useDroppable({ id: 'wish', data: { kind: 'wish' } satisfies DropData });
  return (
    <div ref={setNodeRef} className={'lib' + (ind.over === 'wish' ? ' drop' : '')} data-dropwish="1" style={{ minHeight: 120 }}>
      {t.wish.length ? t.wish.map((x) => <WishItem key={x.id} t={t} x={x} di={di} />)
        : <div className="empty small">Your wishlist is empty. Save places with ♡ or send blocks here with “Move to wishlist”. Drop blocks here to park them.</div>}
    </div>
  );
}

function Panel({ t, A, di, ind, fix }: { t: Trip; A: TripAnalysis; di: number; ind: Indicator; fix: TabProps['fix'] }) {
  const { ptab, lq, lcat, slot, set } = useUI();
  const day = t.plan[di];
  const n = A.days[di].length;
  let body: ReactNode = null;

  if (ptab === 'checks') {
    const W = A.days[di];
    body = (
      <>
        {W.length ? W.map((w, i) => <WarningCard key={i} w={w} tripId={t.id} onFix={fix} />)
          : <div className="warn tip"><b>Day {di + 1} looks realistic</b><p>Pace, transfers, meals and timing all check out.</p></div>}
        {A.trip.length > 0 && <>
          <b className="small" style={{ marginTop: 6 }}>Whole trip</b>
          {A.trip.map((w, i) => <WarningCard key={'t' + i} w={w} tripId={t.id} onFix={fix} />)}
        </>}
      </>
    );
  }
  if (ptab === 'lib') {
    const inPlan = new Set(t.plan.flatMap((d) => d.items.map((x) => x.pid)).filter(Boolean));
    const cen = dayCentre(day, t);
    const q = lq.toLowerCase();
    const list = t.dests.flatMap((id) => D[id]?.pl || [])
      .filter((p) => (lcat === 'all' || p.cat === lcat || (lcat === 'food' && p.cat === 'cafe')) && (!q || (p.n + ' ' + p.desc + ' ' + p.area).toLowerCase().includes(q)))
      .map((p) => ({ p, d: km(p, cen) }))
      .sort((a, b) => (a.p.dest === day.dest ? 0 : 1) - (b.p.dest === day.dest ? 0 : 1) || (a.d ?? 0) - (b.d ?? 0));
    const libAdd = (pid: string) => {
      const at = slot;
      set({ slot: null });
      mut(t.id, (tt) => { placeOnDay(tt, di, itemFromPlace(PL[pid]), at); }, `${PL[pid].n} added to Day ${di + 1}`, true);
    };
    body = (
      <>
        <input type="text" placeholder="Search places" value={lq} aria-label="Search places" onChange={(e) => set({ lq: e.target.value })} />
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Category">
          {LIB_CATS.map(([k, l]) => (
            <button type="button" key={k} className={'chip' + (lcat === k ? ' on' : '')} aria-pressed={lcat === k} style={{ minHeight: 32, padding: '4px 10px', fontSize: 13 }} onClick={() => set({ lcat: k })}>{l}</button>
          ))}
        </div>
        {slot != null && (
          <div className="warn tip">
            <b>Adding at {fmtT(slot)}</b>
            <p>Places you add go into the free slot on Day {di + 1}.</p>
            <div><button type="button" className="btn sm ghost" onClick={() => set({ slot: null })}>Cancel</button></div>
          </div>
        )}
        {destView(t, day.dest)?.kind === 'google' && <LiveLibrary t={t} di={di} q={q} cen={cen} />}
        <div className="lib">
          {list.length ? list.map(({ p, d }) => <LibItem key={p.pid} t={t} pid={p.pid} inPlan={inPlan.has(p.pid)} dist={d} onAdd={() => libAdd(p.pid)} />)
            : destView(t, day.dest)?.kind === 'google' ? null : <p className="small muted">No places match.</p>}
        </div>
      </>
    );
  }
  if (ptab === 'wish') body = <WishList t={t} di={di} ind={ind} />;

  return (
    <>
      <div className="ptabs" role="tablist" aria-label="Side panel">
        <PanelTabButton k="checks" on={ptab === 'checks'}>Checks{n ? ` (${n})` : ''}</PanelTabButton>
        <PanelTabButton k="lib" on={ptab === 'lib'}>Places</PanelTabButton>
        <PanelTabButton k="wish" on={ptab === 'wish'} over={ind.over === 'wishtab'}>Wishlist ({t.wish.length})</PanelTabButton>
      </div>
      {body}
    </>
  );
}

/** Live Famous attractions for a non-curated day destination (one search, on opening the Places tab). */
function LiveLibrary({ t, di, q, cen }: { t: Trip; di: number; q: string; cen: { lat: number; lng: number } | null }) {
  const day = t.plan[di];
  const v = destView(t, day.dest);
  const res = usePlaceList(v, 'famous');
  const { slot, set } = useUI();
  const inPlan = new Set([...t.plan.flatMap((d) => d.items), ...t.wish].map((x) => x.gid).filter(Boolean));
  if (!v) return null;
  if (res.isLoading) return <p className="small muted">Loading places in {v.name}…</p>;
  if (!res.data) return <p className="small muted">Live places for {v.name} aren’t available right now. Add a custom activity instead.</p>;
  const pool = poolFromLive(v.key, res.data.places);
  const rows = pool.filter((p) => !q || p.n.toLowerCase().includes(q)).map((p) => ({ p, d: km(p, cen), src: res.data!.places.find((x) => x.id === p.gid)! }));
  const add = (p: (typeof pool)[number]) => {
    const at = slot;
    set({ slot: null });
    mut(t.id, (tt) => { placeOnDay(tt, di, itemFromPlace(p), at); }, `${p.n} added to Day ${di + 1}`, true);
  };
  return (
    <div className="lib gbox">
      <div className="row between"><b className="small">Top places in {v.name}</b><span className="gmaps-attr" translate="no">Google Maps</span></div>
      {rows.map(({ p, d, src }) => (
        <div className="li" key={p.pid}>
          <div>
            <div className="nm">{p.n}{inPlan.has(p.gid) && <> <span className="tag f">Planned</span></>}</div>
            <div className="mt">{CATS[p.cat][0]} · {hm(p.d)} (default){src.rating != null ? ` · ★ ${src.rating.toFixed(1)} (${(src.userRatingCount || 0).toLocaleString('en-IN')})` : ''}{d != null ? ` · ${fmtDist(d)} away` : ''}</div>
          </div>
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            <button type="button" className="btn sm icon" aria-label={`Save ${p.n} to wishlist`} title="Save to wishlist"
              onClick={() => mut(t.id, (tt) => { if (tt.wish.some((w) => w.gid === p.gid)) return false; tt.wish.push(itemFromPlace(p)); }, 'Saved to wishlist')}>♡</button>
            <button type="button" className="btn sm pri" aria-label={`Add ${p.n}`} onClick={() => add(p)}>Add</button>
          </div>
        </div>
      ))}
    </div>
  );
}
