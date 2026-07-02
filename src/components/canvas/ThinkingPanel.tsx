/**
 * ThinkingPanel — floating collapsible top-center panel showing the AI's
 * reasoning trace (or a generation spinner if the model doesn't emit one).
 */

import { useThinkingStore } from "../../stores/thinkingStore";

interface Props {
  chatId: string;
  /** True whenever the chat is generating — ensures the panel shows even for
   *  models that don't return a reasoning trace. */
  busy: boolean;
}

export function ThinkingPanel({ chatId, busy }: Props) {
  const state = useThinkingStore((s) => s.chats[chatId]);
  const dismiss = useThinkingStore((s) => s.dismiss);
  const reopen = useThinkingStore((s) => s.reopen);
  const active = state?.active ?? false;
  const text = state?.text ?? "";
  const label = state?.label ?? null;
  const dismissed = state?.dismissed ?? false;

  // Show whenever generating or there's content; hide only if explicitly dismissed
  // and not currently busy.
  const hasAnything = busy || active || Boolean(text);
  if (!hasAnything) return null;
  if (dismissed && !busy) return null;

  // If dismissed but generation just restarted, auto-reopen.
  // (handled by start() resetting dismissed=false in the store already)

  const isWorking = busy || active;
  const displayLabel = label ?? (isWorking ? "Generating…" : "Reasoning trace");

  return (
    <div
      data-no-pan
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[560px] max-w-[calc(100vw-24px)] bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isWorking ? "bg-accent-2 animate-pulse" : "bg-ink-faint"}`} />
        <span className="flex-1 text-[12.5px] text-ink-dim truncate">{displayLabel}</span>
        <button
          onClick={() => dismiss(chatId)}
          title="Dismiss"
          className="w-5 h-5 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors flex-shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="max-h-[140px] overflow-y-auto scroll-thin px-3.5 pb-3 -mt-0.5">
        {text ? (
          <p className="text-[12px] text-ink-faint leading-relaxed whitespace-pre-wrap font-mono">{text}</p>
        ) : isWorking ? (
          /* No reasoning text yet — show animated placeholder */
          <div className="flex flex-col gap-1.5 pt-0.5 pb-0.5">
            <div className="h-2 w-3/4 rounded skeleton-shimmer" />
            <div className="h-2 w-1/2 rounded skeleton-shimmer" />
            <div className="h-2 w-2/3 rounded skeleton-shimmer" />
          </div>
        ) : null}
      </div>

      {!isWorking && text && (
        <button
          onClick={() => reopen(chatId)}
          className="w-full px-3.5 py-2 text-left text-[11px] text-ink-faint hover:text-ink border-t border-border-soft hover:bg-white/4 transition-colors"
        >
          Reopen ↗
        </button>
      )}
    </div>
  );
}
