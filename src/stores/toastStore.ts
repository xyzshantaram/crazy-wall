/**
 * Minimal global toast store. Any part of the app can call toast.push(...)
 * without needing a provider wrapper; ToastHost renders whatever's queued.
 */

import { create } from "zustand";
import { nanoid } from "nanoid";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  variant?: "default" | "success" | "warning" | "danger";
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: Toast["variant"], action?: ToastAction) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, variant = "default", action) => {
    const id = nanoid();
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, action }] }));
    // Toasts with an action get longer to live — the user needs time to
    // read the message and decide whether to click it, not just glance
    // and dismiss.
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, action ? 10000 : 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  push: (message: string, variant?: Toast["variant"], action?: ToastAction) => useToastStore.getState().push(message, variant, action),
};
