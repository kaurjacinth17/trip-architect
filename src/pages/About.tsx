import { Link } from 'react-router-dom';
import { useTitle } from '../lib/hooks';
import { TILE_ATTRIBUTION_TEXT } from '../lib/tiles';

export function About() {
  useTitle('About and FAQ');
  return (
    <>
      <span className="kicker">About</span>
      <h1 style={{ marginTop: 4 }}>A system to manage your trip</h1>
      <p className="muted" style={{ marginTop: 10, maxWidth: 760 }}>
        ChatGPT gives you answers. Trip Architect gives you a system to manage your trip: a persistent workspace with an editable
        day-by-day itinerary that checks itself for unrealistic plans, plus a map, budget and expense splits, stay comparison,
        packing list, readiness score, and export, print and share options. You stay in control of every change.
      </p>
      <section className="sec">
        <h2>Questions</h2>
        <div className="faq" style={{ marginTop: 14 }}>
          <details open>
            <summary>Are the prices live?</summary>
            <p>No. Costs, durations, distances, travel times and seasons are planning estimates from a curated dataset of eight Indian destinations and about 120 places. They are not live prices, timetables, opening hours or availability. Replace the budget figures with your real quotes, and check current conditions before you book or travel.</p>
          </details>
          <details>
            <summary>Where is my data stored?</summary>
            <p>Only in this browser, in its local storage. There are no accounts and no server: nothing you type is sent anywhere. Clearing your browser data, using a private window or switching browsers or devices means you won’t see your trips there.</p>
          </details>
          <details>
            <summary>How do I back up or move a trip?</summary>
            <p>Open the trip, go to <b>Share</b> and choose <b>Download trip file (.json)</b>. To restore it, open <Link to="/trips">My trips</Link> and import the file, or paste its contents. Imported trips get a new id, so you can import the same file twice.</p>
          </details>
          <details>
            <summary>How do share links work?</summary>
            <p>“Create share link” compresses the whole trip into the link itself (after the <code>#</code>, which browsers never send to a server). Anyone with the link sees a read-only copy and can save their own copy. Edits you make later don’t update a link you already sent; create a new one.</p>
          </details>
          <details>
            <summary>What does the checker look for?</summary>
            <p>Overloaded days for your pace, overlapping blocks, transfers that don’t leave enough time, intercity jumps, long stretches without a break, missing lunch, very long or late days, zig-zag routes, places at the wrong time of day, weekday-only markets on the wrong day, budget gaps, off-season dates and more. Every warning is advice: fix it in one click, or ignore it.</p>
          </details>
          <details>
            <summary>Who made the maps and pictures?</summary>
            <p>Map tiles: {TILE_ATTRIBUTION_TEXT}. Place pins use stored, approximate coordinates; open a place in Google Maps for streets and directions. The destination illustrations are original SVG drawings, not photos.</p>
          </details>
        </div>
      </section>
    </>
  );
}
