/**
 * NodeCard — the visual representation of a single GraphNode on the canvas.
 * Draggable, selectable, with a compact header (title, kind indicator,
 * action menu) and the rendered content body underneath.
 */

import { useRef, useState, useEffect } from "react";
import { useDrag } from "@use-gesture/react";
import type { GraphNode } from "../../types/graph";
import { NodeContentRenderer } from "../widgets/NodeContentRenderer";
import { useGraphStore } from "../../stores/graphStore";
import { toast } from "../../stores/toastStore";
import { CitationsPanel } from "./CitationsPanel";

const CARD_WIDTH = 300;
const PROMPT_CARD_WIDTH = 420;

interface Props {
  node: GraphNode;
  selected: boolean;
  highlighted?: boolean;
  zoom: number;
  selectedIds: Set<string>;
  onSelect: (nodeId: string, additive: boolean) => void;
  onExpand: (nodeId: string) => void;
  onFork: (nodeId: string) => void;
  onExplain: (nodeId: string) => void;
  onUpdate: (nodeId: string) => void;
  generating?: boolean;
}

export function NodeCard({ node, selected, highlighted, zoom, selectedIds, onSelect, onExpand, onFork, onExplain, onUpdate, generating }: Props) {
  const setNodePosition = useGraphStore((s) => s.setNodePosition);
  const moveNodes = useGraphStore((s) => s.moveNodes);
  const toggleCollapsed = useGraphStore((s) => s.toggleCollapsed);
  const togglePinned = useGraphStore((s) => s.togglePinned);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const duplicateNode = useGraphStore((s) => s.duplicateNode);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [promptTruncated, setPromptTruncated] = useState(false);
  const promptTextRef = useRef<HTMLParagraphElement>(null);

  // Detect whether the collapsed prompt text overflows its container.
  // Uses ResizeObserver so it re-checks if the card is resized/zoomed.
  useEffect(() => {
    const el = promptTextRef.current;
    if (!el) return;
    const check = () => setPromptTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track drag state in a ref to avoid re-renders on every drag frame.
  const didDrag = useRef(false);

  const bindDrag = useDrag(
    ({ delta: [dx, dy], first, last, movement: [mx, my], event }) => {
      const el = event?.target as HTMLElement | undefined;
      if (el?.closest("[data-no-drag]")) return;
      if (!first) didDrag.current = Math.hypot(mx, my) > 4;
      if (last) setTimeout(() => { didDrag.current = false; }, 0);
      if (first) return;
      const cdx = dx / zoom;
      const cdy = dy / zoom;
      // If this node is part of a multi-selection, move all selected nodes together.
      if (selected && selectedIds.size > 1) {
        const deltas: Record<string, { dx: number; dy: number }> = {};
        selectedIds.forEach((id) => { deltas[id] = { dx: cdx, dy: cdy }; });
        moveNodes(deltas);
      } else {
        setNodePosition(node.id, {
          x: node.position.x + cdx,
          y: node.position.y + cdy,
        });
      }
    },
    { threshold: 4, pointer: { capture: true } },
  );

  const handleCardClick = (e: React.MouseEvent) => {
    if (didDrag.current) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    onSelect(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
  };

  const kindColor = node.kind === "root" ? "bg-accent" : node.kind === "leaf" ? "bg-ink-faint" : node.kind === "prompt" ? "bg-warn" : "bg-accent-2";
  const kindRing = node.kind === "root" ? "border-accent" : node.kind === "leaf" ? "border-ink-faint" : node.kind === "prompt" ? "border-warn" : "border-accent-2";

  // Prompt-bubble nodes get a completely different, minimal appearance.
  if (node.kind === "prompt") {
    const handlePromptClick = (_e: React.MouseEvent) => {
      if (didDrag.current) return;
      if (promptTruncated) setPromptExpanded((v) => !v);
    };
    return (
      <>
        <div
          data-node-card
          {...bindDrag()}
          onClick={handlePromptClick}
          style={{ left: node.position.x, top: node.position.y, width: node.size?.w ?? PROMPT_CARD_WIDTH }}
          className={`absolute z-10 select-none rounded-xl border transition-all duration-150
            ${promptTruncated ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}
            ${selected ? "border-warn/70 shadow-[0_0_0_1px_var(--color-warn),0_8px_24px_-6px_rgba(245,185,90,0.3)]" : "border-warn/20 bg-warn/5 shadow-none hover:border-warn/40"}
            ${highlighted ? "ring-2 ring-warn/50 ring-offset-1 ring-offset-void" : ""}`}
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-warn/70 flex-shrink-0 shrink-0">
              <path d="M8 2C4.69 2 2 4.36 2 7.25c0 1.7.85 3.2 2.18 4.17L3.5 14l2.7-1.25C6.74 12.9 7.36 13 8 13c3.31 0 6-2.36 6-5.75S11.31 2 8 2z" fill="currentColor" fillOpacity="0.8"/>
            </svg>
            {promptExpanded ? (
              <p className="text-[15px] text-ink-dim leading-snug flex-1 min-w-0 break-words whitespace-pre-wrap">{node.summary ?? node.title}</p>
            ) : (
              <p ref={promptTextRef} className="text-[15px] font-semibold text-ink-dim leading-none flex-1 min-w-0 truncate">
                {node.summary ?? node.title}
              </p>
            )}
          </div>
        </div>
        {showCitations && <CitationsPanel node={node} onClose={() => setShowCitations(false)} />}
      </>
    );
  }

  return (
    <>
      <div
        data-node-card
        {...bindDrag()}
        onClick={handleCardClick}
        style={{ left: node.position.x, top: node.position.y, width: node.size?.w ?? CARD_WIDTH }}
        className={`absolute select-none rounded-2xl border transition-shadow duration-150 ${
          selected
            ? "border-accent shadow-[var(--shadow-node-selected)]"
            : highlighted
            ? "border-warn/60 shadow-[0_0_0_2px_rgba(245,185,90,0.25),var(--shadow-node)]"
            : "border-border shadow-[var(--shadow-node)]"
        } bg-surface backdrop-blur-sm cursor-grab active:cursor-grabbing`}
      >
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-soft">
        {/* Selection checkbox — shows as kind-dot when unchecked, fills on select */}
        <button
          data-no-drag
          onClick={(e) => { e.stopPropagation(); onSelect(node.id, true); }}
          className={`group/cb flex-shrink-0 w-3.5 h-3.5 rounded-full border transition-all duration-100 flex items-center justify-center
            ${selected
              ? `${kindColor} border-transparent`
              : `bg-transparent ${kindRing} opacity-60 hover:opacity-100`
            }`}
          title={selected ? "Deselect" : "Select"}
        >
          {selected && (
            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <span className="flex-1 text-[13px] font-medium text-ink truncate">{node.title}</span>
        {node.pinned && (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="text-accent flex-shrink-0">
            <path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5L8 2z" fill="currentColor" />
          </svg>
        )}
        <div className="relative" data-no-drag>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-5 h-5 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3.5" r="1.1" fill="currentColor" />
              <circle cx="8" cy="8" r="1.1" fill="currentColor" />
              <circle cx="8" cy="12.5" r="1.1" fill="currentColor" />
            </svg>
          </button>
          {menuOpen && (
            <NodeMenu
              onClose={() => setMenuOpen(false)}
              items={[
                { label: "Expand", action: () => onExpand(node.id) },
                { label: "Fork into new canvas", action: () => onFork(node.id) },
                { label: "Regenerate…", action: () => onUpdate(node.id) },
                { label: node.pinned ? "Unpin" : "Pin", action: () => togglePinned(node.id) },
                { label: node.collapsed ? "Expand card" : "Collapse card", action: () => toggleCollapsed(node.id) },
                { label: "Explain", action: () => onExplain(node.id) },
                {
                  label: `Sources${node.citations?.length ? ` (${node.citations.length})` : ""}`,
                  action: () => setShowCitations(true),
                },
                { label: "Duplicate", action: () => duplicateNode(node.id) },
                {
                  label: "Delete",
                  danger: true,
                  action: () => {
                    deleteNode(node.id);
                    toast.push("Node deleted", "default");
                  },
                },
              ]}
            />
          )}
        </div>
      </div>

      {!node.collapsed && (
        <div className="px-3.5 py-3">
          {node.summary && <p className="text-[12px] text-ink-dim leading-snug mb-2.5">{node.summary}</p>}
          {generating ? (
            <div className="flex flex-col gap-2 animate-pulse">
              <div className="h-3 w-3/4 rounded skeleton-shimmer" />
              <div className="h-3 w-1/2 rounded skeleton-shimmer" />
              <div className="h-3 w-2/3 rounded skeleton-shimmer" />
            </div>
          ) : (
            <NodeContentRenderer
              nodeId={node.id}
              content={node.content}
              title={node.title}
              onToast={(m, v) => toast.push(m, v as never)}
            />
          )}
        </div>
      )}
    </div>
    {showCitations && <CitationsPanel node={node} onClose={() => setShowCitations(false)} />}
    </>
  );
}

function NodeMenu({
  items,
  onClose,
}: {
  items: { label: string; action: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-6 z-50 w-44 bg-surface-2 border border-border rounded-xl shadow-panel py-1 overflow-hidden">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => {
              item.action();
              onClose();
            }}
            className={`w-full text-left px-3 py-1.5 text-[12.5px] transition-colors ${
              item.danger ? "text-bad hover:bg-bad/10" : "text-ink-dim hover:bg-white/6 hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
