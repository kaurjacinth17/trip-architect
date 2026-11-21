// Offline banner, a one-time "What's new" note, and the feedback button.
import { useEffect, useState } from 'react';

const NEW_KEY = 'trip-architect-whats-new-2026-11';
export function WhatsNew() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(NEW_KEY) && localStorage.getItem('trip-architect-v1')) setOpen(true); } catch { /* private mode */ }
  }, []);
  const close = () => { setOpen(false); try { localStorage.setItem(NEW_KEY, '1'); } catch { /* ignore */ } };
  if (!open) return null;
  return (
    <details className="whatsnew" role="region" aria-label="What’s new">
      <summary className="small"><b>New in Trip Architect:</b> 40 destinations with real photos, City Guides, hotels, maps, shared expenses, travel legs and more. <span className="linkish">See all</span></summary>
      <ul className="small" style={{ paddingLeft: 18, margin: '8px 0' }}>
        <li>Go anywhere: 40 destinations on Explore with real photos, and search for any other place.</li>
        <li>City Guides with real places, ratings and filters; hotels with websites and official class, all from open data.</li>
        <li>Lock, move, insert and reorder anything in the itinerary; days start and end at your hotel.</li>
        <li>Maps with restaurants and cafés nearby (OpenStreetMap), and one-tap navigation.</li>
        <li>A budget that follows your stays and plans; Splitwise-style expenses with UPI links.</li>
        <li>Travel legs, a bookings vault, Today mode, weather, calendar export and an emergency card.</li>
      </ul>
      <button type="button" className="btn sm" onClick={close}>Got it</button>
    </details>
  );
}

export function FeedbackButton() {
  const to = import.meta.env.VITE_CONTACT_EMAIL;
  if (!to) return null;
  const href = `mailto:${to}?subject=${encodeURIComponent('Trip Architect feedback')}&body=${encodeURIComponent(`\n\n— Page: ${typeof location !== 'undefined' ? location.pathname : ''}`)}`;
  return <a className="feedback btn sm" href={href}>Feedback</a>;
}
