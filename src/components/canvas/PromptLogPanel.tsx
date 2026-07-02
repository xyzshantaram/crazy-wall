/**
 * PromptLogPanel — floating panel listing every prompt sent to this wall.
 * Jump to where output landed, highlight input nodes, or revert the wall
 * to how it was right after a given prompt.
 */

import { useState } from "react";
import type { PromptLogEntry } from "../../types/graph";
import { useGraphStore } from "../../stores/graphStore";
import { computeFramingViewport } from "../../lib/graph/viewportFraming";
import type { Viewport } from "../../types/graph";

const MODE_LABEL: Record<PromptLogEntry["mode"], string> = {
  new_root: "New wall",
  expand: "Expand",
  fork: "Fork",
  follow_up: "Follow-up",
  multi_select: "Selection",
  recompute: "Recompute",
};

const MODE_COLOR: Record<PromptLogEntry["mode"], string> = {
  new_root: "text-accent bg-accent/10",
  expand: "text-accent-2 bg-accent-2/10",
  fork: "text-good bg-good/10",
  follow_up: "text-ink-dim bg-white/6",
  multi_select: "text-warn bg-warn/10",
  recompute: "text-ink-faint bg-white/4",
};

interface Props {
  chatId: string;
  onClose: () => void;
  onJump: (viewport: Viewport) => void;
  onHighlight: (nodeIds: string[]) => void;
  containerSize: { width: number; height: number };
}

export function PromptLogPanel({ chatId, onClose, onJump, onHighlight, containerSize }: Props) {
  const chat = useGraphStore((s) => s.chats[chatId]);
  const nodes = useGraphStore((s) => s.nodes);
  const revertToPrompt = useGraphStore((s) => s.revertToPrompt);
  const entries = chat?.promptLog ?? [];

  const [confirmRevertIdx, setConfirmRevertIdx] = useState<number | null>(null);

  const handleJump = (entry: PromptLogEntry) => {
    const relevantIds = [entry.canvasNodeId, ...entry.outputNodeIds];
    const relevantNodes = relevantIds.map((id) => nodes[id]).filter((n): n is NonNullable<typeof n> => Boolean(n));
    if (relevantNodes.length > 0) {
      const framed = computeFramingViewport(relevantNodes, containerSize, { padding: 80 });
      if (framed) onJump(framed);
    }
    onHighlight(entry.inputNodeIds);
    onClose();
  };

  const handleRevert = (realIndex: number) => {
    // Jump to the target prompt's output first, then revert.
    const entry = entries[realIndex];
    if (entry) {
      const relevantIds = [entry.canvasNodeId, ...entry.outputNodeIds];
      const relevantNodes = relevantIds.map((id) => nodes[id]).filter((n): n is NonNullable<typeof n> => Boolean(n));
      if (relevantNodes.length > 0) {
        const framed = computeFramingViewport(relevantNodes, containerSize, { padding: 80 });
        if (framed) onJump(framed);
      }
    }
    revertToPrompt(chatId, realIndex);
    setConfirmRevertIdx(null);
    onClose();
  };

  // Entries are shown newest-first, so we need the real (ascending) index.
  const reversedEntries = [...entries].map((e, i) => ({ entry: e, realIndex: i })).reverse();
  const isLast = (realIndex: number) => realIndex === entries.length - 1;

  return (
    <div
      data-no-pan
      className="absolute bottom-16 right-5 z-30 w-[340px] max-w-[calc(100vw-32px)] bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border-soft">
        <span className="text-[12px] font-medium text-ink">Prompt history</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto scroll-thin">
        {entries.length === 0 ? (
          <p className="px-4 py-5 text-[12px] text-ink-faint italic text-center">No prompts yet.</p>
        ) : (
          reversedEntries.map(({ entry, realIndex }) => (
            <div
              key={entry.id}
              className="border-b border-border-soft/50 last:border-0"
            >
              {/* Confirm revert dialog inline */}
              {confirmRevertIdx === realIndex ? (
                <div className="px-4 py-3 bg-bad/5 border-l-2 border-bad/40">
                  <p className="text-[12px] text-ink mb-2">
                    Revert to here? Everything added <span className="text-bad font-medium">after</span> this prompt will be deleted.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRevert(realIndex)}
                      className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-bad/80 text-white hover:bg-bad transition-colors"
                    >
                      Yes, revert
                    </button>
                    <button
                      onClick={() => setConfirmRevertIdx(null)}
                      className="px-2.5 py-1 rounded-lg text-[11.5px] text-ink-dim hover:bg-white/6 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group px-4 py-3 hover:bg-white/4 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${MODE_COLOR[entry.mode]}`}>
                      {MODE_LABEL[entry.mode]}
                    </span>
                    <span className="text-[10.5px] text-ink-faint ml-auto flex-shrink-0">
                      {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <button
                    onClick={() => handleJump(entry)}
                    className="w-full text-left"
                  >
                    <p className="text-[12.5px] text-ink-dim leading-snug line-clamp-2 group-hover:text-ink transition-colors">
                      {entry.prompt}
                    </p>
                    {entry.inputNodeIds.length > 0 && (
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        {entry.inputNodeIds.length} input node{entry.inputNodeIds.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </button>
                  {/* Revert button — hidden for the latest prompt (nothing to revert) */}
                  {!isLast(realIndex) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmRevertIdx(realIndex); }}
                      className="mt-1.5 text-[11px] text-ink-faint hover:text-bad transition-colors opacity-0 group-hover:opacity-100"
                    >
                      ↩ Revert to here
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
