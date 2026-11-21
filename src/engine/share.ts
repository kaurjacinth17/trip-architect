// Text exports, print HTML, JSON backup/import and read-only share links. No DOM.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { BCATS, PACE } from '../data/constants';
import { D } from '../data/destinations';
import { stripGoogleCoords } from './coords';
import { routeName } from './dest';
import { effectiveBudget, plannedTotal } from './budget';
import { travellers } from './schedule';
import { dayDate, fmtD, fmtT, hm } from './time';
import type { Trip } from './types';
import { esc, inr, plural, uid } from './util';

export const APP_ID = 'trip-architect';
export const FILE_VERSION = 1;
export const SHARE_WARN_LENGTH = 8000;

const route = (t: Trip) => routeName(t);
const range = (t: Trip) => `${fmtD(dayDate(t, 0))} – ${fmtD(dayDate(t, t.plan.length - 1))}`;

/** WhatsApp-formatted itinerary. */
export function shareText(t: Trip): string {
  const n = travellers(t);
  let s = `*${t.name}*\n${route(t)} · ${plural(t.plan.length, 'day')} · ${plural(n, 'traveller')}${t.start ? `\n${range(t)}` : ''}\n`;
  t.plan.forEach((d, i) => {
    s += `\n*Day ${i + 1}${dayDate(t, i) ? ' · ' + fmtD(dayDate(t, i)) : ''}${d.label ? ' — ' + d.label : ''}*\n`;
    [...d.items].sort((a, b) => a.s - b.s).forEach((x) => { s += `• ${fmtT(x.s)}  ${x.t}${x.n ? ` (${x.n})` : ''}\n`; });
    if (!d.items.length) s += '• Free day\n';
  });
  const planned = plannedTotal(t);
  s += `\nBudget: ${inr(planned)} planned (${inr(planned / n)} per person)`;
  const b = t.stays.filter((x) => x.status === 'booked');
  if (b.length) s += `\nStay: ${b.map((x) => x.name + ', ' + x.area).join('; ')}`;
  return s;
}

export function summaryText(t: Trip): string {
  const n = travellers(t);
  const planned = plannedTotal(t);
  const hl = t.plan.flatMap((d) => d.items.filter((x) => x.pri === 'must')).map((x) => x.t).slice(0, 6).join(', ');
  return `${t.name}: ${route(t)}, ${plural(t.plan.length, 'day')}${t.start ? ' from ' + fmtD(dayDate(t, 0)) : ''}, ${plural(n, 'traveller')}. Highlights: ${hl || 'to be decided'}. Planned budget ${inr(planned)} (${inr(planned / n)} each).`;
}

/** The printable trip as an HTML fragment (reference `printHTML`). Every user string is escaped. */
export function printHTML(t: Trip): string {
  const n = travellers(t);
  const planned = plannedTotal(t);
  return `<div class="printv"><h1>${esc(t.name)}</h1><p>${esc(route(t))} · ${plural(t.plan.length, 'day')} · ${plural(n, 'traveller')}: ${t.travelers.map(esc).join(', ')}${t.start ? ` · ${range(t)}` : ''}</p>
 ${t.plan.map((d, i) => `<h2 style="margin-top:22px;font-size:20px">Day ${i + 1}${dayDate(t, i) ? ' · ' + fmtD(dayDate(t, i)) : ''}${d.label ? ' — ' + esc(d.label) : ''}</h2><table><tbody>${[...d.items].sort((a, b) => a.s - b.s).map((x) => `<tr><td style="width:120px;white-space:nowrap"><b>${fmtT(x.s)}</b><br><span style="font-size:12px;color:#666">${hm(x.d)}</span></td><td><b>${esc(x.t)}</b>${x.area ? ` · ${esc(x.area)}` : ''}${x.c ? ` · ${inr(x.c)} pp` : ''}${x.n ? `<br><span style="font-size:13px">${esc(x.n)}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="2">Free day</td></tr>'}</tbody></table>`).join('')}
 <h2 style="margin-top:26px;font-size:20px">Budget</h2><table><tbody>${BCATS.map(([k, l]) => `<tr><td>${l}</td><td class="n" style="text-align:right">${inr(effectiveBudget(t)[k])}</td></tr>`).join('')}<tr><td><b>Total planned</b></td><td style="text-align:right"><b>${inr(planned)}</b> (${inr(planned / n)} pp)</td></tr></tbody></table>
 ${t.stays.length ? `<h2 style="margin-top:26px;font-size:20px">Stays</h2><table><tbody>${t.stays.map((s) => `<tr><td><b>${esc(s.name)}</b> · ${esc(s.area)}</td><td>${esc(s.status)}</td><td style="text-align:right">${inr(s.price)}/night × ${s.nights}</td></tr>`).join('')}</tbody></table>` : ''}
 <h2 style="margin-top:26px;font-size:20px">Packing list</h2><p style="columns:2;font-size:14px">${t.pack.map((x) => `${x.done ? '☑' : '☐'} ${esc(x.name)}${x.qty > 1 ? ' ×' + x.qty : ''}`).join('<br>')}</p>
 ${t.notes ? `<h2 style="margin-top:26px;font-size:20px">Notes</h2><p style="white-space:pre-wrap">${esc(t.notes)}</p>` : ''}<p style="margin-top:26px;font-size:12px;color:#666">Made with Trip Architect. Times, distances and costs are planning estimates.</p></div>`;
}

export function printDocument(t: Trip): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(t.name)}</title><style>body{font:15px/1.5 Georgia,serif;max-width:760px;margin:32px auto;padding:0 16px;color:#111}h1{font-size:32px;margin:0 0 6px}h2{font-size:20px}table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}</style></head><body>${printHTML(t)}</body></html>`;
}

/**
 * Prepare a trip to leave the app (file export or share link): drop in-browser flags and Google coordinates
 * (they may only be cached by us, for 30 days). Place IDs and the user's own data travel; details are fetched
 * live when the trip is opened.
 */
function portable(t: Trip): Trip {
  const { sample: _s, touched: _t, ...rest } = stripGoogleCoords(t);
  return rest as Trip;
}

export function exportJSON(t: Trip): string {
  return JSON.stringify({ app: APP_ID, version: FILE_VERSION, trip: portable(t) }, null, 2);
}

/**
 * Validate and normalise an imported trip (reference `importTrip`). Accepts a `{app, version, trip}` file or a bare
 * trip object. Always assigns a new id. Throws on anything that isn't a trip.
 */
export function normaliseTrip(input: unknown, opts: { keepId?: boolean } = {}): Trip {
  const o = (typeof input === 'string' ? JSON.parse(input) : input) as Record<string, unknown> | null;
  const t = ((o && typeof o === 'object' && 'trip' in o ? o.trip : o) || {}) as Partial<Trip>;
  if (!Array.isArray(t.plan) || !Array.isArray(t.dests) || !t.name || typeof t.name !== 'string') {
    throw new Error('That doesn’t look like a Trip Architect file');
  }
  const out: Trip = {
    id: opts.keepId && t.id ? t.id : uid(),
    name: t.name,
    dests: t.dests.filter((id) => typeof id === 'string' && (D[id] || t.destRecords?.[id])),
    start: typeof t.start === 'string' ? t.start : '',
    days: t.plan.length,
    group: t.group || 'couple',
    travelers: Array.isArray(t.travelers) && t.travelers.length ? t.travelers.map(String) : ['You'],
    pace: t.pace && PACE[t.pace] ? t.pace : 'balanced',
    prefs: { natureCity: 0, sightExp: 0, foodShop: 0, advComfort: 0, tier: 1, ...(t.prefs || {}) },
    budgetTotal: Math.max(0, Number(t.budgetTotal) || 0),
    plan: t.plan.map((d) => ({ dest: d.dest, label: d.label || '', items: Array.isArray(d.items) ? d.items : [] })),
    wish: t.wish ?? [],
    budget: { travel: 0, stay: 0, food: 0, local: 0, act: 0, shop: 0, misc: 0, ...(t.budget || {}) },
    ...(t.budgetMode ? { budgetMode: { ...(t.budgetMode.stay ? { stay: t.budgetMode.stay } : {}), ...(t.budgetMode.act ? { act: t.budgetMode.act } : {}) } } : {}),
    expenses: t.expenses ?? [],
    stays: t.stays ?? [],
    pack: t.pack ?? [],
    notes: t.notes ?? '',
    destRecords: Object.fromEntries(Object.entries(t.destRecords || {}).filter(([k]) => (t.dests || []).includes(k))),
    currency: typeof t.currency === 'string' && /^[A-Z]{3}$/.test(t.currency) ? t.currency : 'INR',
    created: t.created || Date.now(),
    updated: t.updated || Date.now(),
  };
  if (!out.dests.length) throw new Error('That trip uses destinations this app doesn’t know');
  return out;
}

export function encodeShare(t: Trip): string {
  return compressToEncodedURIComponent(JSON.stringify({ app: APP_ID, version: FILE_VERSION, trip: portable(t) }));
}

export function decodeShare(data: string): Trip {
  const raw = decompressFromEncodedURIComponent(data.replace(/^#/, ''));
  if (!raw) throw new Error('This share link is incomplete or damaged');
  const o = JSON.parse(raw) as { trip?: Trip };
  if (!o?.trip || !Array.isArray(o.trip.plan)) throw new Error('This share link is incomplete or damaged');
  return o.trip;
}

export const shareURL = (origin: string, t: Trip) => `${origin}/shared#${encodeShare(t)}`;
