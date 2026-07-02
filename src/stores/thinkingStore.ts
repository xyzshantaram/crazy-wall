/**
 * Per-chat reasoning/thinking trace store.
 *
 * Keyed by chatId so switching chats doesn't clobber an in-flight trace,
 * and so the user can reopen a previous chat's last reasoning trace from
 * the toolbar even after dismissing it.
 */

import { create } from "zustand";

export interface ChatThinkingState {
  active: boolean;
  text: string;
  label: string | null;
  /** Whether the panel has been manually dismissed for this chat. Reset when
   *  a new generation starts. */
  dismissed: boolean;
}

interface ThinkingStore {
  chats: Record<string, ChatThinkingState>;
  start: (chatId: string, label: string) => void;
  append: (chatId: string, chunk: string) => void;
  finish: (chatId: string) => void;
  dismiss: (chatId: string) => void;
  reopen: (chatId: string) => void;
}

const EMPTY: ChatThinkingState = { active: false, text: "", label: null, dismissed: false };

export const useThinkingStore = create<ThinkingStore>()((set) => ({
  chats: {},

  start: (chatId, label) =>
    set((s) => ({
      chats: { ...s.chats, [chatId]: { active: true, text: "", label, dismissed: false } },
    })),

  append: (chatId, chunk) =>
    set((s) => {
      const prev = s.chats[chatId] ?? EMPTY;
      return { chats: { ...s.chats, [chatId]: { ...prev, text: prev.text + chunk } } };
    }),

  finish: (chatId) =>
    set((s) => {
      const prev = s.chats[chatId] ?? EMPTY;
      return { chats: { ...s.chats, [chatId]: { ...prev, active: false } } };
    }),

  dismiss: (chatId) =>
    set((s) => {
      const prev = s.chats[chatId] ?? EMPTY;
      return { chats: { ...s.chats, [chatId]: { ...prev, dismissed: true } } };
    }),

  reopen: (chatId) =>
    set((s) => {
      const prev = s.chats[chatId] ?? EMPTY;
      return { chats: { ...s.chats, [chatId]: { ...prev, dismissed: false } } };
    }),
}));
