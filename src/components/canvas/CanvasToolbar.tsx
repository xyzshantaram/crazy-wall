/**
 * Floating toolbar, bottom-right of the canvas.
 * Zoom controls + Thinking trace toggle + Prompt history toggle.
 */

import type { Viewport } from "../../types/graph";
import { useViewportControls } from "./useViewportControls";

interface Props {
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  thinkingAvailable: boolean;
  thinkingActive: boolean;
  onToggleThinking: () => void;
  promptCount: number;
  promptsOpen: boolean;
  onTogglePrompts: () => void;
}

export function CanvasToolbar({
  viewport, onViewportChange,
  thinkingAvailable, thinkingActive, onToggleThinking,
  promptCount, promptsOpen, onTogglePrompts,
}: Props) {
  const { zoomIn, zoomOut, resetView } = useViewportControls(viewport, onViewportChange);

  return (
    <div
      data-no-pan
      className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] right-4 sm:bottom-5 sm:right-5 flex items-center gap-0.5 bg-surface border border-border rounded-xl shadow-panel px-1 py-1 z-20"
    >
      {/* Thinking trace */}
      {thinkingAvailable && (
        <>
          <ToolbarButton onClick={onToggleThinking} title="Reasoning trace" active={thinkingActive}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolbarButton>
          <div className="w-px h-4 bg-border-soft mx-0.5" />
        </>
      )}

      {/* Prompt history */}
      <ToolbarButton onClick={onTogglePrompts} title="Prompt history" active={promptsOpen}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {promptCount > 0 && !promptsOpen && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-accent text-white text-[8px] flex items-center justify-center font-medium leading-none">
            {promptCount > 9 ? "9+" : promptCount}
          </span>
        )}
      </ToolbarButton>

      <div className="w-px h-4 bg-border-soft mx-0.5" />

      {/* Zoom */}
      <ToolbarButton onClick={zoomOut} title="Zoom out">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </ToolbarButton>
      <button
        onClick={resetView}
        className="px-2 text-[11.5px] text-ink-faint hover:text-ink transition-colors font-mono tabular-nums min-w-[44px] text-center"
      >
        {Math.round(viewport.zoom * 100)}%
      </button>
      <ToolbarButton onClick={zoomIn} title="Zoom in">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </ToolbarButton>
      <div className="w-px h-4 bg-border-soft mx-0.5" />
      <ToolbarButton onClick={resetView} title="Reset view">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

export function ToolbarButton({
  children, onClick, title, active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
        active ? "text-accent bg-accent/10" : "text-ink-dim hover:text-ink hover:bg-white/6"
      }`}
    >
      {children}
    </button>
  );
}
