/**
 * Minimal global toast store. Any part of the app can call toast.push(...)
 * without needing a provider wrapper; ToastHost renders whatever's queued.
 */

import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  variant?: "default" | "success" | "warning" | "danger";
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: Toast["variant"]) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, variant = "default") => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  push: (message: string, variant?: Toast["variant"]) => useToastStore.getState().push(message, variant),
};
