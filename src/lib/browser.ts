// Browser-only helpers: downloads and clipboard (replacing the reference's claude.use('downloads')).
import { create } from 'zustand';
import { toast } from '../store/toast';

export function downloadFile(filename: string, data: string, type = 'application/octet-stream') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Downloaded ' + filename);
}

/** Text shown in the "copy this text" fallback dialog when the Clipboard API is blocked. */
export const useCopyFallback = create<{ text: string | null; set: (t: string | null) => void }>()((set) => ({
  text: null,
  set: (text) => set({ text }),
}));

export async function copyText(s: string, done = 'Copied') {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(s);
    toast(done);
  } catch {
    useCopyFallback.getState().set(s);
  }
}
