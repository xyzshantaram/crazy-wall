/**
 * Per-chat token/cost usage tracking.
 *
 * "Last turn" is ephemeral, in-memory only (mirrors thinkingStore's pattern)
 * — it reflects the most recently completed generateGraph() call, summed
 * across all of that call's internal sub-requests (tool-calling loop turns +
 * the final forced call + any repair retries), since a single user prompt
 * can trigger several raw HTTP requests but the user thinks of it as "one
 * turn". Cumulative totals persist on the Chat record itself (graphStore +
 * IndexedDB) so they survive reload, mirroring promptLog.
 */

import { create } from "zustand";
import type { UsageInfo } from "../lib/providers/client";

/** Accumulator shape — same fields as UsageInfo, but summed across however
 *  many raw requests make up one logical turn (or, for cumulative, across
 *  every turn ever run in this chat). costUsd/reasoningTokens are nullable
 *  per-request but always summed as 0 when absent so a single request
 *  without a cost figure doesn't poison the whole cumulative total to null. */
export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  /** Sum of real, provider-reported costUsd values only (OpenRouter). 0 if
   *  none of the summed requests reported a real cost — the caller decides
   *  whether to show an estimate instead based on hasRealCost. */
  costUsd: number;
  /** True if at least one summed request had a real provider-reported cost
   *  (OpenRouter). False means costUsd is meaningless as-is and the modal
   *  should fall back to the hardcoded-pricing-table estimate. */
  hasRealCost: boolean;
}

export const EMPTY_USAGE_TOTALS: UsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  costUsd: 0,
  hasRealCost: false,
};

export function addUsage(a: UsageTotals, b: UsageInfo): UsageTotals {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    reasoningTokens: a.reasoningTokens + (b.reasoningTokens ?? 0),
    costUsd: a.costUsd + (b.costUsd ?? 0),
    hasRealCost: a.hasRealCost || b.costUsd !== null,
  };
}

interface UsageStore {
  /** Most recent completed turn's usage, per chat. Cleared to null when a
   *  new generation starts (so stale numbers don't linger mid-generation). */
  lastTurn: Record<string, UsageTotals | null>;
  /** The model/provider that produced lastTurn, for cost-estimation lookup
   *  and context-window-length lookup in the modal. */
  lastTurnMeta: Record<string, { providerId: string; model: string } | null>;
  beginTurn: (chatId: string) => void;
  recordTurn: (chatId: string, usage: UsageTotals, meta: { providerId: string; model: string }) => void;
}

export const useUsageStore = create<UsageStore>()((set) => ({
  lastTurn: {},
  lastTurnMeta: {},
  beginTurn: (chatId) =>
    set((s) => ({ lastTurn: { ...s.lastTurn, [chatId]: null } })),
  recordTurn: (chatId, usage, meta) =>
    set((s) => ({
      lastTurn: { ...s.lastTurn, [chatId]: usage },
      lastTurnMeta: { ...s.lastTurnMeta, [chatId]: meta },
    })),
}));
