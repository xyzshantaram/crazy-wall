/**
 * ThinkingPanel — floating top-center panel showing the agent's live trace:
 * reasoning chunks, tool calls (name + args), tool results, and status.
 * Each event type gets a distinct visual treatment.
 */

import { useState } from "react";
import { useThinkingStore, type ThinkingEvent } from "../../stores/thinkingStore";
import { renderBlockMd, renderInlineMd } from "../../lib/markdown";

interface Props {
  chatId: string;
  busy: boolean;
}

// Tool name → short friendly label
const TOOL_LABEL: Record<string, string> = {
  ask_user: "Asked you",
  wikipedia_search: "Wikipedia search",
  wikipedia_fetch: "Wikipedia",
  tavily_search: "Web search",
  fetch_nip: "NIP spec",
  search_nips: "NIP search",
};

function toolLabel(name: string) {
  return TOOL_LABEL[name] ?? name;
}

// Icons for each tool
function ToolIcon({ name }: { name: string }) {
  if (name === "ask_user") return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 5.5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (name.startsWith("wikipedia")) return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
  if (name === "tavily_search") return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function ToolCallEvent({ event }: { event: ThinkingEvent }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent flex-shrink-0 text-[11px] font-medium">
        <ToolIcon name={event.toolName ?? ""} />
        {toolLabel(event.toolName ?? "")}
      </span>
      {event.content && (
        <span
          className="text-[11px] text-ink-faint font-mono truncate min-w-0 pt-0.5 [&_code]:bg-white/8 [&_code]:px-1 [&_code]:rounded"
          dangerouslySetInnerHTML={{ __html: renderInlineMd(event.content) }}
        />
      )}
    </div>
  );
}

function ToolResultEvent({ event }: { event: ThinkingEvent }) {
  const [expanded, setExpanded] = useState(false);
  const lines = event.content.split("\n");
  const preview = lines[0] ?? "";
  const hasMore = event.content.length > preview.length || lines.length > 1;

  return (
    <div className="pl-2 border-l border-border-soft py-0.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-ink-faint hover:text-ink-dim transition-colors w-full text-left"
      >
        <svg width="8" height="8" viewBox="0 0 10 10" className={`flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none">
          <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="truncate font-mono">{expanded ? "Result" : preview}</span>
        {hasMore && !expanded && <span className="text-ink-faint/50 flex-shrink-0">…</span>}
      </button>
      {expanded && (
        <div
          className="mt-1 text-[11px] text-ink-faint leading-relaxed max-h-[160px] overflow-y-auto scroll-thin
            [&_p]:mb-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:mb-0.5
            [&_code]:bg-white/8 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10.5px]
            [&_pre]:bg-white/5 [&_pre]:rounded [&_pre]:p-2 [&_pre]:overflow-x-auto [&_pre]:my-1.5
            [&_a]:text-accent-2 [&_a]:underline [&_strong]:text-ink-dim [&_strong]:font-medium
            [&_h1]:text-[12px] [&_h1]:font-semibold [&_h1]:text-ink-dim [&_h1]:mb-1
            [&_h2]:text-[11.5px] [&_h2]:font-semibold [&_h2]:text-ink-dim [&_h2]:mb-1"
          dangerouslySetInnerHTML={{ __html: renderBlockMd(event.content) }}
        />
      )}
    </div>
  );
}

function ReasoningEvent({ event }: { event: ThinkingEvent }) {
  return (
    <div
      className="text-[11.5px] text-ink-faint leading-relaxed py-0.5
        [&_p]:mb-1 [&_code]:bg-white/8 [&_code]:px-1 [&_code]:rounded
        [&_strong]:text-ink-dim [&_strong]:font-medium [&_em]:italic"
      dangerouslySetInnerHTML={{ __html: renderBlockMd(event.content) }}
    />
  );
}

export function ThinkingPanel({ chatId, busy }: Props) {
  const state = useThinkingStore((s) => s.chats[chatId]);
  const dismiss = useThinkingStore((s) => s.dismiss);
  const reopen = useThinkingStore((s) => s.reopen);

  const active = state?.active ?? false;
  const events = state?.events ?? [];
  const label = state?.label ?? null;
  const dismissed = state?.dismissed ?? false;

  const hasAnything = busy || active || events.length > 0;
  if (!hasAnything) return null;
  if (dismissed && !busy) return null;

  const isWorking = busy || active;
  const displayLabel = label ?? (isWorking ? "Generating…" : "Agent trace");

  // Current status: show what's happening right now based on last event
  const lastEvent = events[events.length - 1];
  const statusText = isWorking
    ? lastEvent?.type === "tool_call"
      ? `Using ${toolLabel(lastEvent.toolName ?? "")}…`
      : lastEvent?.type === "tool_result"
        ? "Processing results…"
        : lastEvent?.type === "reasoning"
          ? "Reasoning…"
          : displayLabel
    : null;

  return (
    <div
      data-no-pan
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[560px] max-w-[calc(100vw-24px)] bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-soft/50">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isWorking ? "bg-accent-2 animate-pulse" : "bg-ink-faint"}`} />
        <span className="flex-1 text-[12.5px] text-ink-dim truncate">
          {statusText ?? displayLabel}
        </span>
        <button
          onClick={() => dismiss(chatId)}
          title="Dismiss"
          className="w-5 h-5 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors flex-shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Event stream */}
      <div className="max-h-[200px] overflow-y-auto scroll-thin px-3.5 py-2.5 flex flex-col gap-0.5">
        {events.length === 0 && isWorking && (
          <div className="flex flex-col gap-1.5 py-1">
            <div className="h-2 w-3/4 rounded skeleton-shimmer" />
            <div className="h-2 w-1/2 rounded skeleton-shimmer" />
            <div className="h-2 w-2/3 rounded skeleton-shimmer" />
          </div>
        )}
        {events.map((ev, i) => {
          if (ev.type === "reasoning") return <ReasoningEvent key={i} event={ev} />;
          if (ev.type === "tool_call") return <ToolCallEvent key={i} event={ev} />;
          if (ev.type === "tool_result") return <ToolResultEvent key={i} event={ev} />;
          return null;
        })}
      </div>

      {!isWorking && events.length > 0 && (
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
