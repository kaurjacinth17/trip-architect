import { create } from 'zustand';

export interface ToastMsg { key: number; msg: string; undoTrip?: string }

interface ToastState {
  current: ToastMsg | null;
  show: (msg: string, undoTrip?: string) => void;
  hide: () => void;
}

let n = 0;
export const useToast = create<ToastState>()((set) => ({
  current: null,
  show: (msg, undoTrip) => set({ current: { key: ++n, msg, undoTrip } }),
  hide: () => set({ current: null }),
}));

export const toast = (msg: string, undoTrip?: string) => useToast.getState().show(msg, undoTrip);
