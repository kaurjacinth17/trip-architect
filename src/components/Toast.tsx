import { useEffect } from 'react';
import { useCopyFallback } from '../lib/browser';
import { useToast } from '../store/toast';
import { useTrips } from '../store/trips';
import { Modal } from './Modal';

export function Toast() {
  const cur = useToast((s) => s.current);
  const hide = useToast((s) => s.hide);
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(hide, cur.undoTrip ? 6000 : 4200);
    return () => clearTimeout(t);
  }, [cur, hide]);
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {cur && (
        <div className="toast" key={cur.key}>
          <span>{cur.msg}</span>
          {cur.undoTrip && (
            <button type="button" onClick={() => { if (useTrips.getState().undoTrip(cur.undoTrip!)) useToast.getState().show('Undone'); else hide(); }}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CopyFallback() {
  const text = useCopyFallback((s) => s.text);
  const set = useCopyFallback((s) => s.set);
  if (text == null) return null;
  return (
    <Modal title="Copy this text" onClose={() => set(null)} initialFocus="textarea">
      <h2>Copy this text</h2>
      <p className="small muted">Your browser blocked automatic copying. Select all and copy.</p>
      <label className="vh" htmlFor="copyfb">Text to copy</label>
      <textarea id="copyfb" style={{ minHeight: 280 }} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
      <div className="row"><button type="button" className="btn pri" onClick={() => set(null)}>Done</button></div>
    </Modal>
  );
}
