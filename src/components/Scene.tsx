import { useId } from 'react';
import type { Dest } from '../engine/types';
import { sceneSVG } from './scene';

export function Scene({ d, h = 240 }: { d: Pick<Dest, 'scene' | 'name'>; h?: number }) {
  const id = 's' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: sceneSVG(d, h, id) }} />;
}
