import { create } from 'zustand';

/** `undo` is a trip id (undo that trip's last change) or a callback (e.g. restore a deleted trip). */
export type ToastUndo = string | (() => void);
export interface ToastMsg { key: number; msg: string; undo?: ToastUndo }

interface ToastState {
  current: ToastMsg | null;
  show: (msg: string, undo?: ToastUndo) => void;
  hide: () => void;
}

let n = 0;
export const useToast = create<ToastState>()((set) => ({
  current: null,
  show: (msg, undo) => set({ current: { key: ++n, msg, undo } }),
  hide: () => set({ current: null }),
}));

export const toast = (msg: string, undo?: ToastUndo) => useToast.getState().show(msg, undo);
