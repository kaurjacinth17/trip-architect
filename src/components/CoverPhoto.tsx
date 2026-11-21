// A real photo of a destination from Google (loaded by the browser from Google, credited), with the illustration
// as the placeholder and the fallback when live data is off, used up for the day, or has no photo.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCover } from '../lib/live';

export function useVisible<T extends Element>(margin = '200px') {
  const ref = useRef<T>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || vis) return;
    if (typeof IntersectionObserver === 'undefined') { setVis(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setVis(true); }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [vis, margin]);
  return [ref, vis] as const;
}

export function CoverPhoto({ q, alt, height, fallback }: { q: string; alt: string; height: number | string; fallback: ReactNode }) {
  const [ref, vis] = useVisible<HTMLDivElement>();
  const c = useCover(q, vis);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const uri = c.data?.uri && !failed ? c.data.uri : null;
  return (
    <div ref={ref} className="cover" style={{ height }}>
      {(!uri || !loaded) && <div className="cover-fb" aria-hidden={!!uri}>{fallback}</div>}
      {uri && <img src={uri} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={{ opacity: loaded ? 1 : 0 }} />}
      {uri && loaded && c.data?.author && (
        <span className="credit tiny">Photo: {c.data.author.uri ? <a href={c.data.author.uri} target="_blank" rel="noopener noreferrer">{c.data.author.name}</a> : c.data.author.name} · Google Maps</span>
      )}
    </div>
  );
}
