import { Link } from 'react-router-dom';
import { useTitle } from '../lib/hooks';

const CONTACT = import.meta.env.VITE_CONTACT_EMAIL;
const UPDATED = '20 November 2026';
const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;

function Contact() {
  return CONTACT ? <p>Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p> : null;
}

export function Terms() {
  useTitle('Terms of use');
  return (
    <article className="faq legal">
      <span className="kicker">Last updated {UPDATED}</span>
      <h1>Terms of use</h1>
      <p>Trip Architect is a free planning tool. By using it you agree to these terms.</p>
      <h2>Planning estimates, not bookings</h2>
      <p>Costs, durations, travel times, seasons, weather and exchange rates are estimates to help you plan. They are not live prices, timetables, availability or advice. Trip Architect doesn’t sell or book anything and never processes payments. “Pay via UPI” links only open your own payment app; you confirm any payment there.</p>
      <h2>Google Maps</h2>
      <p>Maps and place information (names, ratings, opening hours, photos and similar) come from Google Maps. By using features powered by Google Maps you agree to the <Ext href="https://maps.google.com/help/terms_maps/">Google Maps/Google Earth Additional Terms of Service</Ext> and the <Ext href="https://policies.google.com/privacy">Google Privacy Policy</Ext>. Place details are shown live and are not stored by Trip Architect, except Google place IDs, which identify places in your trips.</p>
      <h2>Other sources</h2>
      <p>Neighbourhoods: © <Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</Ext> (ODbL). Destination overviews: <Ext href="https://www.wikipedia.org/">Wikipedia</Ext> (CC BY-SA), linked on each page. Weather and climate: <Ext href="https://open-meteo.com/">Open-Meteo</Ext> (CC BY 4.0). Exchange rates: <Ext href="https://frankfurter.dev/">Frankfurter</Ext> (European Central Bank reference rates). Photos: <Ext href="https://unsplash.com/">Unsplash</Ext> and Google Maps, credited to their authors.</p>
      <h2>Your content</h2>
      <p>You own what you write in your trips. Don’t use Trip Architect to store anything unlawful, or to copy or harvest data from it in bulk. If you share a trip, anyone with the link can see what you shared.</p>
      <h2>Availability</h2>
      <p>The service is provided as is, without warranties. Live data has daily limits; when they are reached, the app keeps working with saved and curated information. Features may change.</p>
      <p>See also the <Link to="/privacy">privacy policy</Link>.</p>
      <Contact />
    </article>
  );
}

export function Privacy() {
  useTitle('Privacy policy');
  return (
    <article className="faq legal">
      <span className="kicker">Last updated {UPDATED}</span>
      <h1>Privacy policy</h1>
      <h2>Without an account</h2>
      <p>Your trips are stored only in this browser (local storage). They are not sent to us unless you create a share link (the trip travels inside the link) or sign in.</p>
      <h2>With an account</h2>
      <p>If you sign in, your profile (name, picture, and optionally a UPI ID or phone number you choose to share with your trip members), your trips, expenses and any receipts or tickets you upload are stored with <Ext href="https://supabase.com/privacy">Supabase</Ext>, our database and authentication provider. People you invite to a trip can see that trip. You can delete trips, and ask us to delete your account.</p>
      <h2>Google Maps</h2>
      <p>Maps, place search and place details are provided by Google Maps Platform. When you use them, your browser or our server sends your search text, the area you’re looking at and technical data to Google, and Google may set cookies on map views. Google’s processing is covered by the <Ext href="https://policies.google.com/privacy">Google Privacy Policy</Ext>.</p>
      <h2>Other services</h2>
      <ul>
        <li><b>Vercel</b> hosts the site and its functions, and processes request logs (including IP addresses).</li>
        <li><b>Upstash</b> keeps short-lived counters keyed by IP address to limit abuse and protect free usage limits.</li>
        <li><b>Unsplash</b>, <b>Wikipedia</b>, <b>OpenStreetMap</b> (via Overpass), <b>Open-Meteo</b> and <b>Frankfurter</b> receive the destination or coordinates being looked up.</li>
        <li><b>Vercel Web Analytics</b> counts page views without cookies, and <b>Sentry</b> receives error reports (with personal data removed where possible) so we can fix bugs, once these are switched on for this site.</li>
      </ul>
      <h2>What we don’t do</h2>
      <p>No advertising trackers, no selling of data, no payment or bank details stored.</p>
      <Contact />
    </article>
  );
}
