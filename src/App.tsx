import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { CopyFallback, Toast } from './components/Toast';
import { Footer, Missing, Sidebar, Topbar } from './components/Shell';
import { undoTrip } from './lib/actions';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { Compare } from './pages/Compare';
import { NewTrip } from './pages/NewTrip';
import { Trips } from './pages/Trips';
import { About } from './pages/About';
import { Privacy, Terms } from './pages/Legal';
import { LiveDataBanner } from './components/LiveDataBanner';

const Destination = lazy(() => import('./pages/Destination'));
const TripPage = lazy(() => import('./pages/trip/TripPage'));
const Print = lazy(() => import('./pages/Print'));
const Shared = lazy(() => import('./pages/Shared'));

/** Reference behaviour: scroll to top when the page (not just the tab) changes. */
function useScrollReset() {
  const { pathname } = useLocation();
  const last = useRef('');
  useEffect(() => {
    const base = pathname.split('/').slice(0, 3).join('/');
    if (base !== last.current) window.scrollTo(0, 0);
    last.current = base;
  }, [pathname]);
}

/** Ctrl/Cmd+Z undoes the last change to the open trip (not while typing). */
function useUndoShortcut() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = pathname.match(/^\/trips\/([^/]+)\/(?!print)/);
    if (!m) return;
    const id = m[1];
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input,textarea,select,[contenteditable]')) return;
      if (document.querySelector('.scrim')) return;
      e.preventDefault();
      undoTrip(id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pathname]);
}

function TripRedirect() {
  const { id } = useParams();
  return <Navigate to={`/trips/${id}/overview`} replace />;
}

export function App() {
  useScrollReset();
  useUndoShortcut();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app">
        <Sidebar />
        <div>
          <Topbar />
          <LiveDataBanner />
          <main className="main" id="main" tabIndex={-1}>
            <Suspense fallback={<p className="muted" role="status">Loading…</p>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/destinations/:id" element={<Destination />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/new" element={<NewTrip />} />
                <Route path="/trips" element={<Trips />} />
                <Route path="/trips/:id" element={<TripRedirect />} />
                <Route path="/trips/:id/print" element={<Print />} />
                <Route path="/trips/:id/:tab" element={<TripPage />} />
                <Route path="/shared" element={<Shared />} />
                <Route path="/about" element={<About />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="*" element={<Missing />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>
      </div>
      <Toast />
      <CopyFallback />
    </>
  );
}
