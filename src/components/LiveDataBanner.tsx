import { useEffect, useState } from 'react';
import { useLiveStatus } from '../lib/liveStatus';

/** Shown when the daily Google budget is used up or the device is offline. The app stays fully usable. */
export function LiveDataBanner() {
  const state = useLiveStatus((s) => s.state);
  const set = useLiveStatus((s) => s.set);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [set]);
  if (!online) return <div className="livebar" role="status">You’re offline. Your trips still work; live place data will load when you reconnect.</div>;
  if (state !== 'resting') return null;
  return <div className="livebar" role="status">Live place data is resting for today; showing saved and curated info.</div>;
}
