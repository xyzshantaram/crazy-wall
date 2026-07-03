/**
 * FloatingChatBar — bottom prompt bar on the canvas.
 *
 * Desktop: floating card centered above the bottom edge.
 * Mobile: full-width flush bar at the very bottom, with toolbar controls
 *         (zoom, fit-all, thinking, prompts) embedded in the footer row
 *         so there's no separate floating toolbar eating canvas space.
 */

import { useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGraphStore } from "../../stores/graphStore";
import { PROVIDERS } from "../../lib/providers/registry";
import type { ProviderId } from "../../lib/providers/registry";
import { ToolsDropdown } from "./ToolsDropdown";
import { ModelPicker } from "../settings/ModelPicker";
import { useViewportControls } from "./useViewportControls";
import type { GraphNode, Viewport } from "../../types/graph";

interface Props {
  chatId: string;
  selectedNodeIds: Set<string>;
  busy: boolean;
  onSubmit: (prompt: string, selectedIds: string[]) => void;
  onCancel: () => void;
  onClearSelection: () => void;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  nodes: GraphNode[];
  containerSize: { width: number; height: number };
  thinkingAvailable: boolean;
  thinkingActive: boolean;
  onToggleThinking: () => void;
  promptCount: number;
  promptsOpen: boolean;
  onTogglePrompts: () => void;
  bookmarksOpen: boolean;
  onToggleBookmarks: () => void;
}

export function FloatingChatBar({
  chatId,
  selectedNodeIds, busy, onSubmit, onCancel, onClearSelection,
  viewport, onViewportChange, nodes, containerSize,
  thinkingAvailable, thinkingActive, onToggleThinking,
  promptCount, promptsOpen, onTogglePrompts,
  bookmarksOpen, onToggleBookmarks,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Chat's committed provider — fixed, can't be changed mid-chat
  const chat = useGraphStore((s) => s.chats[chatId]);
  const setChatProviderModel = useGraphStore((s) => s.setChatProviderModel);
  const chatProvider = (chat?.provider ?? "openrouter") as ProviderId;
  const chatModel = chat?.model ?? "";
  const providerLabel = PROVIDERS[chatProvider]?.label ?? chatProvider;

  // Keep settingsStore in sync so useGraphActions picks up the model
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setModel = useSettingsStore((s) => s.setModel);

  const handleModelChange = (newModel: string) => {
    setChatProviderModel(chatId, chatProvider, newModel);
    setModel(chatProvider, newModel);
  };

  const { zoomIn, zoomOut, resetView, fitAll } = useViewportControls(viewport, onViewportChange);

  const selectedCount = selectedNodeIds.size;
  const placeholder = selectedCount > 0
    ? `What should I do with ${selectedCount} selected node${selectedCount > 1 ? "s" : ""}?`
    : "Add something, go deeper…";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === "Escape") { setValue(""); textareaRef.current?.blur(); }
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed, Array.from(selectedNodeIds));
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "22px";
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  const ghostSelect = "bg-transparent border-none outline-none text-[10.5px] text-ink-faint hover:text-ink-dim cursor-pointer transition-colors min-w-0";

  // Compact icon button used inside footer on mobile
  const footerIconBtn = (onClick: () => void, title: string, active: boolean, children: React.ReactNode) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors flex-shrink-0 ${
        active ? "text-accent bg-accent/10" : "text-ink-faint hover:text-ink hover:bg-white/6"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div
      data-no-pan
      className={[
        // Mobile: full-width flush to bottom
        "absolute bottom-0 left-0 right-0 z-20",
        // Desktop: floating centered card
        "sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[624px] sm:max-w-[calc(100vw-32px)]",
      ].join(" ")}
    >
      {/* No overflow-hidden — traps ToolsDropdown fixed popover on WebKit */}
      <div className={[
        "flex flex-col bg-surface/97 backdrop-blur-md border-t border-border-soft",
        "sm:border sm:rounded-2xl sm:shadow-panel",
        "transition-colors duration-150",
        busy ? "border-accent/40" : "focus-within:border-accent/50",
      ].join(" ")}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Context label when nodes are selected */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 pt-2 pb-0 sm:px-3.5 sm:pt-2.5">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-accent-2 flex-shrink-0">
              <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] text-accent-2 font-medium flex-1">
              {selectedCount} node{selectedCount > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={onClearSelection}
              title="Clear selection"
              className="w-4 h-4 flex items-center justify-center rounded text-accent-2/60 hover:text-accent-2 transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2 px-3 pt-2.5 pb-2 sm:px-3.5 sm:pt-3">
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

        {/* Footer: tools + model on left, zoom controls on right (mobile inline) */}
        <div className="px-3 pb-2 flex items-center gap-1.5 border-t border-border-soft/40 pt-1.5 sm:px-3.5 sm:pb-2.5 sm:gap-2 min-w-0">
          {/* Left: tools + model picker */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0 sm:gap-2" data-no-drag>
            <div className="flex-shrink-0">
              <ToolsDropdown />
            </div>
            <div className="w-px h-3 bg-border-soft flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <ModelPicker
                providerId={chatProvider}
                apiKey={apiKeys[chatProvider]}
                value={chatModel}
                onChange={handleModelChange}
                className={`w-full ${ghostSelect} max-w-none`}
                providerLabel={providerLabel}
              />
            </div>
          </div>

          {busy && (
            <span className="text-[10.5px] text-accent-2 flex items-center gap-1 flex-shrink-0 ml-1 sm:ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" />
              <span className="hidden sm:inline">Generating…</span>
            </span>
          )}

          {/* Right: zoom + canvas controls — only shown on mobile (desktop has standalone toolbar) */}
          <div className="flex items-center gap-0 flex-shrink-0 sm:hidden ml-auto">
            <div className="w-px h-3 bg-border-soft mr-1.5" />

            {/* Thinking trace */}
            {thinkingAvailable && footerIconBtn(onToggleThinking, "Reasoning", thinkingActive,
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}

            {/* Prompt history */}
            {footerIconBtn(onTogglePrompts, "History", promptsOpen,
              <span className="relative">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {promptCount > 0 && !promptsOpen && (
                  <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-accent text-white text-[7px] flex items-center justify-center font-bold leading-none">
                    {promptCount > 9 ? "9+" : promptCount}
                  </span>
                )}
              </span>
            )}

            <div className="w-px h-3 bg-border-soft mx-1" />

            {/* Zoom out */}
            {footerIconBtn(zoomOut, "Zoom out", false,
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            )}

            {/* Zoom % / reset */}
            <button
              onClick={resetView}
              className="px-1 text-[10px] text-ink-faint hover:text-ink font-mono tabular-nums min-w-[32px] text-center"
            >
              {Math.round(viewport.zoom * 100)}%
            </button>

            {/* Zoom in */}
            {footerIconBtn(zoomIn, "Zoom in", false,
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            )}

            <div className="w-px h-3 bg-border-soft mx-1" />

            {/* Bookmarks */}
            {footerIconBtn(onToggleBookmarks, "Bookmarks", bookmarksOpen,
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
            )}

            <div className="w-px h-3 bg-border-soft mx-1" />

            {/* Fit all */}
            {footerIconBtn(() => fitAll(nodes, containerSize), "Fit all", false,
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 5V3h2M12 3h2v2M14 11v2h-2M4 13H2v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="5" y="5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
