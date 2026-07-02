/**
 * Floating action bar shown when 2+ nodes are selected: quick actions
 * (merge/compare/contradictions/summarize/plan) plus a free-form instruction
 * input, all routed through multiSelectAction().
 */

import { useState } from "react";

interface Props {
  count: number;
  onAction: (instruction: string) => void;
  onClear: () => void;
}

const QUICK_ACTIONS = [
  "Merge these into one consolidated view",
  "Compare these",
  "Find contradictions between these",
  "Summarize these",
  "Generate a plan using these",
];

export function SelectionActionBar({ count, onAction, onClear }: Props) {
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-no-pan
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2"
    >
      {expanded && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-[440px]">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a}
              onClick={() => onAction(a)}
              className="px-2.5 py-1 rounded-full text-[11.5px] text-ink-dim bg-surface-2 border border-border-soft hover:border-accent/40 hover:text-ink transition-colors"
            >
              {a}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 bg-surface border border-border rounded-full shadow-panel pl-4 pr-1.5 py-1.5">
        <span className="text-[12.5px] text-ink-dim font-medium">{count} selected</span>
        <div className="w-px h-4 bg-border-soft" />
        <input
          value={value}
          onFocus={() => setExpanded(true)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              onAction(value.trim());
              setValue("");
            }
          }}
          placeholder="Merge, compare, summarize…"
          className="bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none w-[200px]"
        />
        <button
          onClick={onClear}
          className="w-6 h-6 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-white/8 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
