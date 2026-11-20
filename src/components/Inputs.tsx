import { useEffect, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Common = { value: string | number; onCommit: (v: string) => void };

/**
 * Text/number input that commits on blur or Enter (the reference listened to `change`, not `input`),
 * and resyncs when the stored value changes underneath it (undo, fixes).
 */
export function CommitInput({ value, onCommit, ...rest }: Common & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(String(value ?? ''));
  useEffect(() => setV(String(value ?? '')), [value]);
  const commit = () => { if (v !== String(value ?? '')) onCommit(v); };
  return (
    <input
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); } }}
    />
  );
}

export function CommitTextarea({ value, onCommit, ...rest }: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(String(value ?? ''));
  useEffect(() => setV(String(value ?? '')), [value]);
  return <textarea {...rest} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== String(value ?? '')) onCommit(v); }} />;
}

export function Stepper({ value, onStep, less, more }: { value: number; onStep: (d: number) => void; less: string; more: string }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onStep(-1)} aria-label={less}>−</button>
      <b aria-live="polite">{value}</b>
      <button type="button" onClick={() => onStep(1)} aria-label={more}>+</button>
    </div>
  );
}
