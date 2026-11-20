// One-off: copy the DESTS literal verbatim from the reference into src/data/destinations.ts
import fs from 'node:fs';
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('const DESTS = [');
const b = src.indexOf('];\n\n// ---------- helpers');
const literal = src.slice(a + 'const DESTS = '.length, b + 1);
// sanity: evaluate
const data = eval(literal);
if (data.length !== 8) throw new Error('expected 8 destinations');
const header = `// Curated destination data, ported verbatim from the reference prototype.
// Costs are rough on-ground estimates in INR, not live prices.
// place: [id, name, cat, cluster, lat, lng, minutes, costPerPerson, bestTime(am|pm|eve|any), description, flags(m=must,h=hidden), weekdayOnly(0=Sun)]
import type { DestRaw } from '../engine/types';

export const DESTS: DestRaw[] = `;
fs.writeFileSync(process.argv[3], header + literal + ';\n');
console.log('places:', data.reduce((s, d) => s + d.places.length, 0));
