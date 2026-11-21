import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exportJSON, printDocument, SHARE_WARN_LENGTH, shareText, shareURL, spendText, summaryText } from '../../engine/share';
import { slug } from '../../engine/util';
import { copyText, downloadFile } from '../../lib/browser';
import type { TabProps } from './TripPage';
import { People } from './People';

export function Share({ t }: TabProps) {
  const [link, setLink] = useState<string | null>(null);
  const make = () => setLink(shareURL(location.origin, t));
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="grid" style={{ gap: 14 }}>
        <People t={t} />
        <div className="card grid" style={{ gap: 10 }}>
          <h3>Send the itinerary on WhatsApp</h3>
          <p className="small muted">Formatted text with each day’s times, ready to paste into a chat.</p>
          <div className="row">
            <button type="button" className="btn pri" onClick={() => copyText(shareText(t))}>Copy itinerary</button>
            <button type="button" className="btn" onClick={() => copyText(summaryText(t))}>Copy short summary</button>
            {spendText(t) && <button type="button" className="btn" onClick={() => copyText(spendText(t), 'Spend summary copied')}>Copy spend summary</button>}
          </div>
        </div>
        <div className="card grid" style={{ gap: 10 }}>
          <h3>Share a read-only link</h3>
          <p className="small muted">The whole trip is packed into the link itself. Nothing is uploaded: anyone with the link sees a read-only copy and can save their own. Later edits need a new link.</p>
          <div className="row">
            <button type="button" className="btn pri" onClick={make}>{link ? 'Update share link' : 'Create share link'}</button>
            {link && <button type="button" className="btn" onClick={() => copyText(link, 'Link copied')}>Copy link</button>}
            {link && <a className="btn" href={link} target="_blank" rel="noopener noreferrer">Open</a>}
          </div>
          {link && <>
            <label className="vh" htmlFor="sharelink">Share link</label>
            <input id="sharelink" type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <span className="tiny muted">{link.length.toLocaleString('en-IN')} characters</span>
            {link.length > SHARE_WARN_LENGTH && (
              <div className="warn caution">
                <b>This link is long</b>
                <p>At {link.length.toLocaleString('en-IN')} characters, some chat apps and email clients may cut it off. If it doesn’t open for someone, send the trip file instead.</p>
              </div>
            )}
          </>}
        </div>
        <div className="card grid" style={{ gap: 10 }}>
          <h3>Print or save as PDF</h3>
          <p className="small muted">A clean, printable version of the whole trip: days, budget, stays and packing list.</p>
          <div className="row">
            <Link className="btn" to={`/trips/${t.id}/print`}>Open print view</Link>
            <button type="button" className="btn" onClick={() => downloadFile(slug(t.name) + '-itinerary.html', printDocument(t), 'text/html')}>Download printable file</button>
          </div>
        </div>
        <div className="card grid" style={{ gap: 10 }}>
          <h3>Back up or move this trip</h3>
          <p className="small muted">Export the full trip as a file. Import it later from My trips, on any device.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => downloadFile(slug(t.name) + '.json', exportJSON(t), 'application/json')}>Download trip file (.json)</button>
            <button type="button" className="btn" onClick={() => copyText(exportJSON(t))}>Copy trip data</button>
          </div>
        </div>
      </div>
      <div className="card">
        <b className="small">Preview</b>
        <pre style={{ whiteSpace: 'pre-wrap', font: '14px/1.5 var(--sans)', margin: '10px 0 0', maxHeight: 520, overflow: 'auto' }} tabIndex={0} aria-label="Itinerary text preview">{shareText(t)}</pre>
      </div>
    </div>
  );
}
