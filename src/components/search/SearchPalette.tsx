/**
 * SearchPalette — global Ctrl/Cmd+K command palette. Full-text search across
 * every node in every wall (see lib/search), with results from the
 * currently-open wall ranked first. Picking a result switches walls (if
 * needed) and jumps the canvas to that node.
 */

import { useEffect, useRef, useState } from "react";
import { useGraphStore } from "../../stores/graphStore";
import { useNavigationStore } from "../../stores/navigationStore";
import { search, type SearchResultItem } from "../../lib/search/searchIndex";
import type { GraphNodeRef } from "../../lib/search/sources/graphNodesSource";

const KIND_COLOR: Record<string, string> = {
  root: "text-accent bg-accent/10",
  topic: "text-accent-2 bg-accent-2/10",
  leaf: "text-ink-faint bg-white/5",
  prompt: "text-warn bg-warn/10",
};

function highlightSnippet(body: string, terms: string[], maxLen = 140): string {
  if (!body) return "";
  const lower = body.toLowerCase();
  let hitIdx = -1;
  for (const t of terms) {
    const idx = lower.indexOf(t.toLowerCase());
    if (idx !== -1) { hitIdx = idx; break; }
  }
  const start = hitIdx === -1 ? 0 : Math.max(0, hitIdx - 40);
  const snippet = body.slice(start, start + maxLen).trim();
  return (start > 0 ? "…" : "") + snippet + (start + maxLen < body.length ? "…" : "");
}

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeChatId = useGraphStore((s) => s.activeChatId);
  const chats = useGraphStore((s) => s.chats);
  const setActiveChat = useGraphStore((s) => s.setActiveChat);
  const requestFocus = useNavigationStore((s) => s.requestFocus);

  // Global Ctrl/Cmd+K toggle.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const items = search(query, { prioritizeChatId: activeChatId ?? undefined, limit: 30 });
    setResults(items);
    setActiveIdx(0);
  }, [query, activeChatId]);

  const handlePick = (item: SearchResultItem) => {
    const ref = item.doc.ref as GraphNodeRef;
    if (ref.chatId !== activeChatId) setActiveChat(ref.chatId);
    requestFocus({ chatId: ref.chatId, nodeId: ref.nodeId });
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(results.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx]) handlePick(results[activeIdx]); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-sm"
      onPointerDown={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-[560px] mx-4 bg-surface border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border-soft">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-ink-faint flex-shrink-0">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all walls…"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-ink placeholder:text-ink-faint"
          />
          <kbd className="text-[10px] text-ink-faint bg-white/5 border border-border-soft rounded px-1.5 py-0.5 flex-shrink-0">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto scroll-thin">
          {query.trim() && results.length === 0 && (
            <p className="px-4 py-6 text-[12.5px] text-ink-faint italic text-center">No matching nodes.</p>
          )}
          {!query.trim() && (
            <p className="px-4 py-6 text-[12.5px] text-ink-faint italic text-center">
              Type to search node titles and content across every wall.
            </p>
          )}
          {results.map((item, i) => {
            const ref = item.doc.ref as GraphNodeRef;
            const chatTitle = chats[ref.chatId]?.title ?? "Unknown wall";
            const isCurrentWall = ref.chatId === activeChatId;
            const snippet = highlightSnippet(item.doc.body, item.terms);
            return (
              <button
                key={item.doc.id}
                onClick={() => handlePick(item)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full text-left px-4 py-2.5 border-b border-border-soft/50 last:border-0 transition-colors ${
                  i === activeIdx ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${KIND_COLOR.topic}`}>
                    {isCurrentWall ? "This wall" : chatTitle}
                  </span>
                </div>
                <p className="text-[13px] text-ink truncate">{item.doc.title}</p>
                {snippet && <p className="text-[11.5px] text-ink-faint leading-snug line-clamp-2 mt-0.5">{snippet}</p>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
