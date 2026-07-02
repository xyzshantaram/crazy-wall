/**
 * Sidebar — list of chats (each chat is its own canvas). Slides away once a
 * chat is opened/started, per the requested UX; reachable again via a small
 * edge-hover affordance or the top-left toggle.
 */

import { useState } from "react";
import { useGraphStore } from "../../stores/graphStore";
import { PROVIDERS } from "../../lib/providers/registry";

interface Props {
  collapsed: boolean;
  onExpand: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ collapsed, onExpand, onOpenSettings }: Props) {
  const chatOrder = useGraphStore((s) => s.chatOrder);
  const chats = useGraphStore((s) => s.chats);
  const activeChatId = useGraphStore((s) => s.activeChatId);
  const createChat = useGraphStore((s) => s.createChat);
  const setActiveChat = useGraphStore((s) => s.setActiveChat);
  const deleteChat = useGraphStore((s) => s.deleteChat);
  const renameChat = useGraphStore((s) => s.renameChat);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  return (
    <div
      className={`h-full flex flex-col border-r border-border-soft bg-abyss transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
        collapsed ? "w-0" : "w-[260px]"
      }`}
    >
      <div className="w-[260px] h-full flex flex-col">
        <div className="flex items-center justify-between px-3.5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-accent to-accent-2 flex-shrink-0" />
            <span className="text-[13px] font-semibold text-ink tracking-tight">Crazy Wall</span>
          </div>
          <button
            onClick={onExpand}
            title="Collapse sidebar"
            className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/6 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M4 3v10M9 6l3 2-3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="px-3">
          <button
            onClick={() => createChat()}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] font-medium text-ink-dim hover:text-ink bg-white/[0.03] hover:bg-white/[0.06] border border-border-soft transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            New wall
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin px-2 mt-3 flex flex-col gap-0.5">
          {chatOrder.map((id) => {
            const chat = chats[id];
            if (!chat) return null;
            const isActive = id === activeChatId;
            return (
              <div
                key={id}
                onClick={() => setActiveChat(id)}
                className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                  isActive ? "bg-white/[0.07] text-ink" : "text-ink-dim hover:bg-white/[0.04] hover:text-ink"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    chat.started ? "bg-accent-2/70" : "bg-ink-faint/40"
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
                    className="flex-1 bg-transparent border-none outline-none text-[13px] text-ink min-w-0"
                  />
                ) : (
                  <span
                    className="flex-1 text-[13px] truncate min-w-0"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingId(id);
                      setEditValue(chat.title);
                    }}
                  >
                    {chat.title}
                  </span>
                )}
                <span className="text-[10px] text-ink-faint flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {PROVIDERS[chat.provider as keyof typeof PROVIDERS]?.label ?? chat.provider}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(id);
                  }}
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-ink-faint opacity-0 group-hover:opacity-100 hover:text-bad hover:bg-bad/10 transition-all"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}
          {chatOrder.length === 0 && (
            <div className="px-2.5 py-6 text-center text-[12px] text-ink-faint">No walls yet</div>
          )}
        </div>

        <div className="px-3 py-3 border-t border-border-soft">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-ink-faint hover:text-ink hover:bg-white/[0.04] transition-colors"
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
    </div>
  );
}
