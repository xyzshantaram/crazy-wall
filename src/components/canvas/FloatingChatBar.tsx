/**
 * FloatingChatBar — always-visible bottom-center prompt bar on the canvas.
 *
 * Behaviour:
 *  - When nothing is selected: sends a free follow-up to the current chat.
 *  - When nodes are selected: pre-fills context label, sends a targeted instruction.
 *  - While busy: shows a Cancel button instead of Submit.
 *  - On submit: clears the input and fires the appropriate action.
 */

import { useRef, useState } from "react";
import { useGraphStore } from "../../stores/graphStore";
import { PROVIDERS } from "../../lib/providers/registry";
import { ToolsDropdown } from "./ToolsDropdown";

interface Props {
  chatId: string;
  selectedNodeIds: Set<string>;
  busy: boolean;
  onSubmit: (prompt: string, selectedIds: string[]) => void;
  onCancel: () => void;
}

export function FloatingChatBar({ chatId, selectedNodeIds, busy, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chat = useGraphStore((s) => s.chats[chatId]);
  const providerLabel = PROVIDERS[chat?.provider as keyof typeof PROVIDERS]?.label ?? chat?.provider ?? "";

  const selectedCount = selectedNodeIds.size;
  const placeholder = selectedCount > 0
    ? `What should I do with ${selectedCount} selected node${selectedCount > 1 ? "s" : ""}?`
    : "Add something, go deeper, ask a follow-up…";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setValue("");
      textareaRef.current?.blur();
    }
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed, Array.from(selectedNodeIds));
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "22px";
    }
  };

  // Auto-resize textarea up to 4 rows.
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  return (
    <div
      data-no-pan
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 w-[624px] max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-32px)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* No overflow-hidden — it creates a stacking context that traps the ToolsDropdown fixed popover on WebKit */}
      <div className={`
        flex flex-col bg-surface/95 backdrop-blur-md border rounded-2xl shadow-panel
        transition-colors duration-150
        ${busy ? "border-accent/40" : "border-border-soft hover:border-border focus-within:border-accent/50"}
      `}>
        {/* Context label when nodes are selected */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-0">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-accent-2 flex-shrink-0">
              <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] text-accent-2 font-medium">
              {selectedCount} node{selectedCount > 1 ? "s" : ""} selected
            </span>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2 px-3.5 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={busy}
            className="flex-1 min-w-0 resize-none bg-transparent text-[13.5px] text-ink placeholder:text-ink-faint focus:outline-none leading-relaxed min-h-[22px] max-h-[96px] overflow-y-auto scroll-thin disabled:opacity-50"
            style={{ height: "22px" }}
          />

          {busy ? (
            <button
              onClick={onCancel}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium text-ink-dim border border-border-soft hover:border-border hover:text-ink transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
              Cancel
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Send (Enter)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Footer: tools · model · generating */}
        <div className="px-3.5 pt-1.5 pb-2.5 flex items-center gap-2 border-t border-border-soft/40">
          <div className="flex-shrink-0">
            <ToolsDropdown />
          </div>
          <div className="w-px h-3 bg-border-soft flex-shrink-0" />
          <span className="text-[10.5px] text-ink-faint truncate flex-1 min-w-0">
            {providerLabel}{chat?.model ? ` · ${chat.model.split("/").pop()}` : ""}
          </span>
          {busy && (
            <span className="text-[10.5px] text-accent-2 flex items-center gap-1 flex-shrink-0 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" />
              Generating…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
