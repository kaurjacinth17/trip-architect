import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTrips, tripList } from '../store/trips';
import { Icon, Logo, type IconName } from './Icon';
import { AccountButton } from './cloud/Account';
import { cloudConfigured } from '../lib/cloud/client';
import { useAuth } from '../store/auth';

const NAV: [string, string, IconName, (p: string) => boolean][] = [
  ['/', 'Home', 'home', (p) => p === '/'],
  ['/trips', 'My trips', 'trips', (p) => p.startsWith('/trips')],
  ['/explore', 'Explore', 'explore', (p) => p.startsWith('/explore') || p.startsWith('/destinations')],
  ['/compare', 'Compare destinations', 'compare', (p) => p.startsWith('/compare')],
  ['/new', 'New trip', 'plus', (p) => p.startsWith('/new')],
];

function Nav({ label }: { label: string }) {
  const { pathname } = useLocation();
  return (
    <nav className="nav" aria-label={label}>
      {NAV.map(([to, l, i, on]) => (
        <Link key={to} to={to} className={on(pathname) ? 'on' : ''} aria-current={on(pathname) ? 'page' : undefined}>
          <Icon n={i} /><span>{l}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const trips = useTrips((s) => s.trips);
  const ts = tripList(trips);
  const { pathname } = useLocation();
  return (
    <aside className="side">
      <Link className="brand" to="/">
        <Logo />
        <span><b>Trip Architect</b><small>Plan less. Experience more.</small></span>
      </Link>
      <Nav label="Main" />
      <div className="lab" id="ws-lab">Your workspace</div>
      <nav className="nav tlist" aria-labelledby="ws-lab">
        {ts.length ? ts.map((t) => (
          <NavLink key={t.id} to={`/trips/${t.id}/overview`} className={pathname.startsWith(`/trips/${t.id}/`) ? 'on' : ''}>
            <i className="dot" /><span>{t.name}</span>
          </NavLink>
        )) : <p className="tiny" style={{ padding: '0 10px', opacity: 0.75 }}>No trips yet.</p>}
      </nav>
      <div style={{ padding: '0 10px' }}><AccountButton /></div>
      <SaveNote />
    </aside>
  );
}

function SaveNote() {
  const user = useAuth((s) => s.user);
  return <p className="tiny note">{cloudConfigured() && user ? 'Trips in your account sync across devices; guest trips stay in this browser.' : 'Trips are saved in this browser. Use Share → Download trip file to back up.'}</p>;
}

export function Topbar() {
  return (
    <header className="top">
      <Link className="brand" to="/"><Logo size={28} /><b>Trip Architect</b></Link>
      <Nav label="Main (compact)" />
      <AccountButton compact />
    </header>
  );
}

export function Footer() {
  return (
    <footer className="sitefoot noprint">
      <p>Costs, durations, distances and seasons are planning estimates from curated data, not live prices, timetables or bookings. Check current conditions before you travel.</p>
      <p>Maps and place details © Google Maps. Neighbourhoods © OpenStreetMap contributors. Destination illustrations are original drawings.</p>
      <nav aria-label="Footer"><Link to="/about">About and FAQ</Link><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/explore">Explore</Link><Link to="/trips">My trips</Link></nav>
    </footer>
  );
}

export function Missing() {
  return (
    <div className="empty" style={{ marginTop: 40 }}>
      <h2>That page isn’t here</h2>
      <p>The trip may have been deleted, or the link is from another browser.</p>
      <Link className="btn pri" to="/">Go home</Link>
    </div>
  );
}
