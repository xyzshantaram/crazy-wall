/**
 * Sidebar — list of chats (each chat is its own canvas). Slides away once a
 * chat is opened/started, per the requested UX; reachable again via a small
 * edge-hover affordance or the top-left toggle.
 *
 * Mobile (<640px): renders as a fixed overlay drawer with a scrim.
 * Desktop: slides in/out of the left edge of the layout.
 */

import { useState, useRef, useEffect } from "react";
import { useGraphStore } from "../../stores/graphStore";
import { PROVIDERS } from "../../lib/providers/registry";

interface Props {
  collapsed: boolean;
  onExpand: () => void;
  onOpenSettings: () => void;
  onShare: (chatId: string) => void;
  onReceive: () => void;
}

export function Sidebar({ collapsed, onExpand, onOpenSettings, onShare, onReceive }: Props) {
  const chatOrder = useGraphStore((s) => s.chatOrder);
  const chats = useGraphStore((s) => s.chats);
  const activeChatId = useGraphStore((s) => s.activeChatId);
  const createChat = useGraphStore((s) => s.createChat);
  const setActiveChat = useGraphStore((s) => s.setActiveChat);
  const deleteChat = useGraphStore((s) => s.deleteChat);
  const renameChat = useGraphStore((s) => s.renameChat);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside.
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpenId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  const inner = (
    <div className="w-[260px] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent to-accent-2 flex-shrink-0 shadow-[0_0_12px_var(--color-accent-glow)]" />
          <span className="text-[13px] font-semibold text-ink tracking-tight">Crazy Wall</span>
        </div>
        <button
          onClick={onExpand}
          title="Collapse sidebar"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-white/6 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M4 3v10M9 6l3 2-3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* New wall button */}
      <div className="px-3 pb-1">
        <button
          onClick={() => createChat()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-ink-dim hover:text-ink bg-white/[0.03] hover:bg-white/[0.07] border border-border-soft hover:border-border transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          New wall
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto scroll-thin px-2 mt-2 flex flex-col gap-0.5 pb-2">
        {chatOrder.map((id) => {
          const chat = chats[id];
          if (!chat) return null;
          const isActive = id === activeChatId;
          const isMenuOpen = menuOpenId === id;
          return (
            <div
              key={id}
              onClick={() => { if (!isMenuOpen) setActiveChat(id); }}
              className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                isActive
                  ? "bg-white/[0.08] text-ink"
                  : "text-ink-dim hover:bg-white/[0.04] hover:text-ink"
              }`}
            >
              {/* Active indicator dot */}
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
                  chat.started
                    ? isActive ? "bg-accent-2" : "bg-accent-2/50"
                    : "bg-ink-faint/30"
                }`}
              />

              {editingId === id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    if (editValue.trim()) renameChat(id, editValue.trim());
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editValue.trim()) renameChat(id, editValue.trim());
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-transparent border-none outline-none text-[13px] text-ink min-w-0"
                />
              ) : (
                <span
                  className="flex-1 text-[13px] truncate min-w-0 leading-snug"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(id);
                    setEditValue(chat.title);
                  }}
                >
                  {chat.title}
                </span>
              )}

              {/* Provider label — hidden when menu open */}
              {!isMenuOpen && (
                <span className="text-[10px] text-ink-faint flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {PROVIDERS[chat.provider as keyof typeof PROVIDERS]?.label ?? chat.provider}
                </span>
              )}

              {/* Three-dot menu */}
              <div className="relative flex-shrink-0" ref={isMenuOpen ? menuRef : undefined}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(isMenuOpen ? null : id);
                  }}
                  className={`w-6 h-6 flex items-center justify-center rounded-md transition-all
                    ${isMenuOpen
                      ? "text-ink bg-white/10 opacity-100"
                      : "text-ink-faint opacity-0 group-hover:opacity-100 hover:text-ink hover:bg-white/6"}`}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="3" r="1.4" fill="currentColor"/>
                    <circle cx="8" cy="8" r="1.4" fill="currentColor"/>
                    <circle cx="8" cy="13" r="1.4" fill="currentColor"/>
                  </svg>
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-xl shadow-panel z-50 py-1 overflow-hidden">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(null);
                        onShare(id);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-ink-dim hover:text-ink hover:bg-white/5 transition-colors text-left"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <circle cx="13" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/>
                        <circle cx="3" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
                        <circle cx="13" cy="12" r="2" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M5 7l6-2M5 9l6 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      Share / Sync
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(null);
                        setEditingId(id);
                        setEditValue(chat.title);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-ink-dim hover:text-ink hover:bg-white/5 transition-colors text-left"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                      </svg>
                      Rename
                    </button>
                    <div className="my-1 border-t border-border-soft" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(null);
                        deleteChat(id);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-bad/80 hover:text-bad hover:bg-bad/5 transition-colors text-left"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Delete wall
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {chatOrder.length === 0 && (
          <div className="px-2.5 py-6 text-center text-[12px] text-ink-faint">No walls yet</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-border-soft flex flex-col gap-1">
        {/* Receive a wall */}
        <button
          onClick={onReceive}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-ink-faint hover:text-accent-2 hover:bg-accent-2/5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="13" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="3" cy="12" r="2" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="13" cy="12" r="2" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M5 11l6 0M11 7l-6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M8 3v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M5.5 6.5L8 9l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Receive a wall
        </button>
        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-ink-faint hover:text-ink hover:bg-white/[0.04] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile scrim — only shown when sidebar is open on small screens */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden"
          onClick={onExpand}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={[
          // Desktop: slide in/out from left edge (part of the flex layout)
          "h-full flex flex-col border-r border-border-soft bg-abyss",
          "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden",
          // Mobile: fixed overlay drawer, z-50
          "max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:z-50",
          collapsed ? "w-0" : "w-[260px]",
        ].join(" ")}
      >
        {inner}
      </div>
    </>
  );
}
