/**
 * Infinite pan/zoom canvas viewport.
 *
 * Input model (via @use-gesture/react):
 *   Mouse/trackpad wheel:   plain scroll = pan, Ctrl+scroll = zoom (Figma/Miro)
 *   Background pointer drag: pan
 *   Touch 1-finger:          pan
 *   Touch 2-finger pinch:    zoom + pan simultaneously
 */

import { useRef } from "react";
import { useGesture } from "@use-gesture/react";
import type { Viewport } from "../../types/graph";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;

interface Props {
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  children: React.ReactNode;
  underlay?: React.ReactNode;
  onBackgroundClick?: () => void;
}

export function CanvasViewport({ viewport, onViewportChange, children, underlay, onBackgroundClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep a ref so gesture callbacks always see the latest viewport without
  // needing it as a dependency (avoids re-binding gestures on every pan/zoom).
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useGesture(
    {
      // ── Background drag → pan ────────────────────────────────────────────
      onDrag: ({ delta: [dx, dy], event, first, target }) => {
        // Only pan on background; node cards and toolbar handle their own events.
        const el = target as HTMLElement;
        if (el.closest("[data-node-card]") || el.closest("[data-no-pan]")) return;
        if (first) onBackgroundClick?.();
        const cur = viewportRef.current;
        onViewportChange({ ...cur, x: cur.x + dx, y: cur.y + dy });
        event.stopPropagation();
      },

      // ── Wheel → pan (plain) or zoom (Ctrl/pinch) ────────────────────────
      onWheel: ({ delta: [dx, dy], event }) => {
        event.preventDefault();
        const cur = viewportRef.current;

        if (event.ctrlKey || event.metaKey) {
          // Ctrl+scroll OR trackpad pinch (browser reports ctrlKey=true for pinch).
          const container = containerRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const cursorX = event.clientX - rect.left;
          const cursorY = event.clientY - rect.top;
          // dy here is already the raw deltaY; exponent keeps zoom feeling smooth.
          const zoomFactor = Math.exp(-dy * 0.0011);
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.zoom * zoomFactor));
          const worldX = (cursorX - cur.x) / cur.zoom;
          const worldY = (cursorY - cur.y) / cur.zoom;
          onViewportChange({ x: cursorX - worldX * newZoom, y: cursorY - worldY * newZoom, zoom: newZoom });
          return;
        }
        // Plain scroll → pan.
        onViewportChange({ ...cur, x: cur.x - dx, y: cur.y - dy });
      },

      // ── Pinch (touch two-finger) → zoom + pan ───────────────────────────
      onPinch: ({ origin: [ox, oy], delta: [dScale], offset: [scale], first, memo }) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const cur = viewportRef.current;

        // On first event, capture the world-space point under the pinch origin
        // so we can keep it stationary as zoom changes.
        const pivotX = ox - rect.left;
        const pivotY = oy - rect.top;
        const m = first
          ? { worldX: (pivotX - cur.x) / cur.zoom, worldY: (pivotY - cur.y) / cur.zoom }
          : (memo as { worldX: number; worldY: number });

        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.zoom * (1 + dScale)));
        onViewportChange({
          x: pivotX - m.worldX * newZoom,
          y: pivotY - m.worldY * newZoom,
          zoom: newZoom,
        });
        void scale;
        return m;
      },
    },
    {
      drag: {
        // Prevent text selection and browser scroll during canvas drag.
        filterTaps: true,
        pointer: { capture: true },
      },
      wheel: {
        // Must be non-passive to call preventDefault().
        eventOptions: { passive: false },
      },
      pinch: {
        eventOptions: { passive: false },
        // Prevent iOS/Safari from zooming the page during pinch.
        preventDefault: true,
      },
      target: containerRef,
    },
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing canvas-grid"
      style={{
        backgroundSize: `${28 * viewport.zoom}px ${28 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        // Disable browser native touch gestures so use-gesture owns them fully.
        touchAction: "none",
      }}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {underlay}
        {children}
      </div>
    </div>
  );
}
