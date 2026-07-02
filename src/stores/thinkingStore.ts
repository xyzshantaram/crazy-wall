/**
 * Per-chat reasoning/thinking trace store.
 *
 * Stores a structured sequence of events (reasoning chunks, tool calls,
 * tool results, status messages) so ThinkingPanel can render each type
 * distinctly instead of a single flat text blob.
 */

import { create } from "zustand";

export type ThinkingEventType = "reasoning" | "tool_call" | "tool_result" | "status";

export interface ThinkingEvent {
  type: ThinkingEventType;
  /** For reasoning: the text chunk. For tool_call: "toolName(argsJson)".
   *  For tool_result: the result string. For status: a short label. */
  content: string;
  /** Human-readable tool name for tool_call/tool_result events. */
  toolName?: string;
}

export interface ChatThinkingState {
  active: boolean;
  /** Top-level label shown in the panel header. */
  label: string | null;
  /** Ordered sequence of events making up this generation's trace. */
  events: ThinkingEvent[];
  /** Whether the panel has been manually dismissed for this chat. Reset when
   *  a new generation starts. */
  dismissed: boolean;
}

interface ThinkingStore {
  chats: Record<string, ChatThinkingState>;
  start: (chatId: string, label: string) => void;
  pushEvent: (chatId: string, event: ThinkingEvent) => void;
  /** Append to the last reasoning event, or create a new one. */
  appendReasoning: (chatId: string, chunk: string) => void;
  finish: (chatId: string) => void;
  dismiss: (chatId: string) => void;
  reopen: (chatId: string) => void;
}

const EMPTY: ChatThinkingState = { active: false, label: null, events: [], dismissed: false };

export const useThinkingStore = create<ThinkingStore>()((set) => ({
  chats: {},

  start: (chatId, label) =>
    set((s) => ({
      chats: { ...s.chats, [chatId]: { active: true, label, events: [], dismissed: false } },
    })),

  pushEvent: (chatId, event) =>
    set((s) => {
      const prev = s.chats[chatId] ?? EMPTY;
      return { chats: { ...s.chats, [chatId]: { ...prev, events: [...prev.events, event] } } };
    }),

  appendReasoning: (chatId, chunk) =>
    set((s) => {
      const prev = s.chats[chatId] ?? EMPTY;
      const events = [...prev.events];
      const last = events[events.length - 1];
      if (last?.type === "reasoning") {
        events[events.length - 1] = { ...last, content: last.content + chunk };
      } else {
        events.push({ type: "reasoning", content: chunk });
      }
      return { chats: { ...s.chats, [chatId]: { ...prev, events } } };
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
