import { Link } from 'react-router-dom';
import { useTitle } from '../lib/hooks';

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
            <summary>How do locks, opening hours and the hotel checks work?</summary>
            <p><b>Locked blocks</b> (🔒) keep their time: pushing later items, Tidy times, Optimise route, one-click fixes and shifts all leave them alone, and anything that runs into one is flagged.</p>
            <p><b>Opening hours</b> come live from Google Maps for the day you’re looking at (they aren’t stored), so hours checks appear once that day has loaded: closed that weekday, not open yet, or closing before your visit ends.</p>
            <p><b>Hotel distance:</b> if the first stop of the day, or the way back at the end, is 40 minutes or more from the stay for that night (by our travel-time estimate, or Google’s when live travel times are on), you’ll see a note. Change a day’s start or end point in Day options.</p>
            <p><b>Check-in and check-out days:</b> more than 2 hours of plans before noon on the day you arrive somewhere, or more than 2½ hours on the day you leave, gets a note, because you’ll likely have bags with you.</p>
          </details>
          <details>
            <summary>Who made the maps and pictures?</summary>
            <p>Maps, place details, ratings and place photos come from Google Maps. Neighbourhood lists come from © OpenStreetMap contributors, overviews from Wikipedia, and climate averages from Open-Meteo. Pins for the 8 hand-written guides use our own stored coordinates. The destination illustrations are original SVG drawings.</p>
          </details>
        </div>
      </section>
    </>
  );
}
