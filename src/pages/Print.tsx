import { Link, useParams } from 'react-router-dom';
import { Missing } from '../components/Shell';
import { printDocument, printHTML } from '../engine/share';
import { slug } from '../engine/util';
import { downloadFile } from '../lib/browser';
import { useTitle } from '../lib/hooks';
import { toast } from '../store/toast';
import { useTrips } from '../store/trips';

export default function Print() {
  const { id = '' } = useParams();
  const t = useTrips((s) => s.trips[id]);
  useTitle(t ? `${t.name} (print)` : 'Not found');
  if (!t) return <Missing />;
  return (
    <>
      <div className="row noprint" style={{ marginBottom: 16 }}>
        <Link className="btn" to={`/trips/${t.id}/share`}>← Back to trip</Link>
        <button type="button" className="btn pri" onClick={() => { try { window.print(); } catch { toast('Printing isn’t available here; download the printable file'); } }}>Print</button>
        <button type="button" className="btn" onClick={() => downloadFile(slug(t.name) + '-itinerary.html', printDocument(t), 'text/html')}>Download printable file</button>
        <span className="tiny muted">Choose “Save as PDF” in the print dialog for a PDF.</span>
      </div>
      {/* printHTML escapes every user-provided string */}
      <div dangerouslySetInnerHTML={{ __html: printHTML(t) }} />
    </>
  );
}
