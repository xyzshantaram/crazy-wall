/**
 * ContextUsageModal — token/cost/context-window breakdown for the currently
 * active chat, opened from the context ring in the canvas toolbar.
 *
 * Shows both the most recent turn (a single generateGraph() call, which may
 * itself be several raw requests — tool loop + final call + repair retries,
 * all summed) and the running cumulative total for the whole wall.
 *
 * Cost: OpenRouter reports real billed cost directly (usage.cost); DeepSeek
 * and Z.AI don't return a cost field at all, so their figure is computed
 * client-side from a hardcoded pricing table (pricingTables.ts) and clearly
 * labeled "estimated" with the table's last-checked date, since it will
 * drift whenever the provider changes prices.
 */

import { useEffect, useState } from "react";
import type { Chat } from "../../types/graph";
import type { UsageTotals } from "../../stores/usageStore";
import { EMPTY_USAGE_TOTALS } from "../../stores/usageStore";
import { getModelRate, estimateCost, PRICING_LAST_UPDATED } from "../../lib/providers/pricingTables";
import { findModelContextLength } from "../../lib/providers/modelDiscovery";
import { PROVIDERS, type ProviderId } from "../../lib/providers/registry";

interface Props {
  chat: Chat;
  apiKey: string;
  lastTurn: UsageTotals | null;
  lastTurnMeta: { providerId: string; model: string } | null;
  onClose: () => void;
}

function fmtTokens(n: number): string {
  return n.toLocaleString();
}

function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function ContextUsageModal({ chat, apiKey, lastTurn, lastTurnMeta, onClose }: Props) {
  const cumulative = chat.cumulativeUsage ?? EMPTY_USAGE_TOTALS;
  const providerId = (lastTurnMeta?.providerId ?? chat.provider) as ProviderId;
  const model = lastTurnMeta?.model ?? chat.model;
  const providerLabel = PROVIDERS[providerId]?.label ?? providerId;

  const [contextLength, setContextLength] = useState<number | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    findModelContextLength(providerId, apiKey, model).then((len) => {
      if (!cancelled) setContextLength(len);
    });
    return () => { cancelled = true; };
  }, [providerId, apiKey, model]);

  const rate = getModelRate(providerId, model);

  function costFor(u: UsageTotals): { amount: number; estimated: boolean } | null {
    if (u.hasRealCost) return { amount: u.costUsd, estimated: false };
    if (rate) return { amount: estimateCost(rate, u.promptTokens, u.cachedTokens, u.completionTokens), estimated: true };
    return null;
  }

  const lastTurnCost = lastTurn ? costFor(lastTurn) : null;
  const cumulativeCost = costFor(cumulative);

  // "Effective"/billed-rate tokens: what you're actually charged full price
  // for, i.e. total input MINUS the discount cache hits give you, plus all
  // completion tokens (completion tokens aren't cacheable on any of these
  // three providers).
  const effectiveTokens = (u: UsageTotals) => Math.max(0, u.promptTokens - u.cachedTokens) + u.completionTokens;

  const windowPct = lastTurn && contextLength ? Math.min(100, (lastTurn.promptTokens / contextLength) * 100) : null;
  const windowColor = windowPct === null ? "bg-accent" : windowPct > 90 ? "bg-bad" : windowPct > 70 ? "bg-warn" : "bg-good";

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-[90vw] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
      >
        <div className="px-5 pt-4 pb-3 border-b border-border-soft flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium">Context &amp; usage</div>
            <h3 className="text-[14px] font-semibold text-ink mt-0.5">{providerLabel} · {model || "(no model)"}</h3>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5 max-h-[65vh] overflow-auto scroll-thin">
          {/* Context window usage — only meaningful for the LAST turn (a
              cumulative total spanning many turns isn't "how full is the
              window right now"). */}
          <Section title="Context window (last turn)">
            {lastTurn === null ? (
              <p className="text-[12.5px] text-ink-faint italic">No generation has completed in this wall yet.</p>
            ) : contextLength ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className={`h-full rounded-full ${windowColor}`} style={{ width: `${windowPct}%` }} />
                  </div>
                  <span className="text-[12px] text-ink-dim font-mono">{windowPct!.toFixed(1)}%</span>
                </div>
                <p className="text-[11.5px] text-ink-faint mt-1.5">
                  {fmtTokens(lastTurn.promptTokens)} / {fmtTokens(contextLength)} tokens
                </p>
              </>
            ) : (
              <p className="text-[12.5px] text-ink-faint italic">
                Context window size unknown for this model — {fmtTokens(lastTurn.promptTokens)} prompt tokens used last turn.
              </p>
            )}
          </Section>

          <Section title="Last turn">
            {lastTurn === null ? (
              <p className="text-[12.5px] text-ink-faint italic">No generation has completed in this wall yet.</p>
            ) : (
              <UsageGrid usage={lastTurn} cost={lastTurnCost} effectiveTokens={effectiveTokens(lastTurn)} />
            )}
          </Section>

          <Section title="Cumulative (this wall)">
            <UsageGrid usage={cumulative} cost={cumulativeCost} effectiveTokens={effectiveTokens(cumulative)} />
          </Section>

          {(lastTurnCost?.estimated || cumulativeCost?.estimated) && (
            <p className="text-[10.5px] text-ink-faint leading-relaxed">
              Cost is estimated from a hardcoded {providerLabel} pricing table (pricing as of {PRICING_LAST_UPDATED}) —
              {providerLabel} doesn't report actual billed cost in its API response, unlike OpenRouter. Actual rates may have changed since.
            </p>
          )}
          {!rate && !lastTurn?.hasRealCost && providerId !== "openrouter" && (
            <p className="text-[10.5px] text-ink-faint leading-relaxed italic">
              No pricing data available for model "{model}" — cost cannot be estimated.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function UsageGrid({
  usage, cost, effectiveTokens,
}: {
  usage: UsageTotals;
  cost: { amount: number; estimated: boolean } | null;
  effectiveTokens: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Stat label="Tokens in" value={fmtTokens(usage.promptTokens)} />
      <Stat label="Tokens out" value={fmtTokens(usage.completionTokens)} />
      <Stat label="Cached tokens" value={fmtTokens(usage.cachedTokens)} />
      <Stat label="Effective tokens" value={fmtTokens(effectiveTokens)} hint="billed-rate, excludes cache discount" />
      {usage.reasoningTokens > 0 && <Stat label="Reasoning tokens" value={fmtTokens(usage.reasoningTokens)} />}
      <Stat
        label={cost?.estimated ? "Est. cost" : "Cost"}
        value={cost ? fmtUsd(cost.amount) : "—"}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface-2 border border-border-soft rounded-lg px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-medium">{label}</div>
      <div className="text-[14px] font-mono text-ink mt-0.5">{value}</div>
      {hint && <div className="text-[9.5px] text-ink-faint mt-0.5">{hint}</div>}
    </div>
  );
}
