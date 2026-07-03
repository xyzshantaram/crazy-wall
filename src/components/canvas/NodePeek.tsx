/**
 * NodePeek — a fixed overlay that appears when the user long-presses a node
 * on the canvas. Shows the title, kind badge, summary, and a plain-text
 * preview of the content so they can read it without needing to zoom in.
 *
 * Rendered at fixed position (bottom of screen) so it's always legible
 * regardless of canvas zoom level.
 */

import type { GraphNode } from "../../types/graph";
import { extractNodePreview } from "../../lib/graph/nodeText";

interface Props {
  node: GraphNode;
  onDismiss: () => void;
}

const KIND_LABEL: Record<string, string> = {
  root: "Root",
  topic: "Topic",
  leaf: "Detail",
  prompt: "Prompt",
};

const KIND_COLOR: Record<string, string> = {
  root: "text-accent bg-accent/10",
  topic: "text-accent-2 bg-accent-2/10",
  leaf: "text-ink-faint bg-white/5",
  prompt: "text-warn bg-warn/10",
};

export function NodePeek({ node, onDismiss }: Props) {
  const preview = extractNodePreview(node, 200);

  return (
    // Full-screen scrim — dismiss on tap outside the card
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center pb-[env(safe-area-inset-bottom,0px)]"
      onPointerDown={onDismiss}
    >
      <div
        className="w-full max-w-[480px] mx-4 mb-4 bg-surface border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-8 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-1 pb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${KIND_COLOR[node.kind] ?? KIND_COLOR.topic}`}>
                {KIND_LABEL[node.kind] ?? node.kind}
              </span>
              {node.citations?.length ? (
                <span className="text-[10.5px] text-ink-faint">
                  {node.citations.length} source{node.citations.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            <h3 className="text-[16px] font-semibold text-ink leading-snug">{node.title}</h3>
          </div>
          <button
            onPointerDown={onDismiss}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-white/8 transition-colors mt-0.5"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Summary */}
        {node.summary && (
          <div className="px-4 pb-2">
            <p className="text-[13px] text-ink-dim leading-relaxed">{node.summary}</p>
          </div>
        )}

        {/* Content preview */}
        {preview && (
          <div className="px-4 pb-4">
            <div className="bg-surface-2 border border-border-soft rounded-xl px-3.5 py-3">
              <p className="text-[12px] text-ink-faint leading-relaxed line-clamp-4">{preview}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
