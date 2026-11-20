// Illustration for any destination: its own scene if curated, otherwise a generic one by type.
import { D } from '../data/destinations';
import { destView } from '../engine/dest';
import type { Dest, DestType, Trip } from '../engine/types';

const SCENE_FOR: Record<DestType, string> = { beach: 'goa', hill: 'manali', pilgrimage: 'varanasi', wildlife: 'kerala', tier2: 'jaipur', metro: 'pondicherry', other: 'udaipur' };

export function sceneFor(t: Pick<Trip, 'destRecords'> | null | undefined, key: string | undefined): Pick<Dest, 'scene' | 'name'> | null {
  const v = destView(t, key);
  if (!v) return null;
  if (v.curated) return v.curated;
  return { scene: D[SCENE_FOR[v.type || 'other']].scene, name: v.name };
}
