/**
 * BookmarksPanel — floating panel listing saved viewport bookmarks for this
 * wall. Lets you save the current view under a label, jump back to a saved
 * view, or remove one.
 */

import { useState } from "react";
import { useGraphStore } from "../../stores/graphStore";
import type { Viewport } from "../../types/graph";

interface Props {
  chatId: string;
  viewport: Viewport;
  onClose: () => void;
  onJump: (viewport: Viewport) => void;
}

export function BookmarksPanel({ chatId, viewport, onClose, onJump }: Props) {
  const chat = useGraphStore((s) => s.chats[chatId]);
  const addBookmark = useGraphStore((s) => s.addBookmark);
  const removeBookmark = useGraphStore((s) => s.removeBookmark);
  const bookmarks = chat?.bookmarks ?? [];

  const [label, setLabel] = useState("");

  const handleAdd = () => {
    const trimmed = label.trim();
    addBookmark(chatId, trimmed || `View ${bookmarks.length + 1}`);
    setLabel("");
  };

  return (
    <div
      data-no-pan
      className="absolute bottom-16 right-5 z-30 w-[300px] max-w-[calc(100vw-32px)] bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border-soft">
        <span className="text-[12px] font-medium text-ink">Bookmarks</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-3 flex gap-2 border-b border-border-soft">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Save current view as…"
          className="flex-1 min-w-0 bg-void/60 border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={handleAdd}
          className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors flex-shrink-0"
        >
          Save
        </button>
      </div>

      <div className="max-h-[50vh] overflow-y-auto scroll-thin">
        {bookmarks.length === 0 ? (
          <p className="px-4 py-5 text-[12px] text-ink-faint italic text-center">
            No bookmarks yet. Save the current view to jump back later.
          </p>
        ) : (
          bookmarks.map((b) => {
            const isCurrent = Math.abs(b.viewport.x - viewport.x) < 1
              && Math.abs(b.viewport.y - viewport.y) < 1
              && Math.abs(b.viewport.zoom - viewport.zoom) < 0.01;
            return (
              <div
                key={b.id}
                className="group flex items-center gap-2 px-4 py-2.5 border-b border-border-soft/50 last:border-0 hover:bg-white/4 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className={isCurrent ? "text-accent flex-shrink-0" : "text-ink-faint flex-shrink-0"}>
                  <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" fill={isCurrent ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
                <button
                  onClick={() => { onJump(b.viewport); onClose(); }}
                  className="flex-1 min-w-0 text-left text-[12.5px] text-ink-dim truncate group-hover:text-ink transition-colors"
                >
                  {b.label}
                </button>
                <button
                  onClick={() => removeBookmark(chatId, b.id)}
                  className="w-5 h-5 flex items-center justify-center rounded-md text-ink-faint hover:text-bad hover:bg-bad/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                  title="Remove bookmark"
                >
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
