/**
 * Small viewport control helpers (zoom in/out/reset), split out of
 * CanvasViewport.tsx so that file only exports the component (fast-refresh
 * friendliness) and this hook can be reused (e.g. from keyboard shortcuts).
 */

import type { Viewport } from "../../types/graph";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;

export function useViewportControls(viewport: Viewport, onViewportChange: (v: Viewport) => void) {
  const zoomIn = () => onViewportChange({ ...viewport, zoom: Math.min(MAX_ZOOM, viewport.zoom * 1.2) });
  const zoomOut = () => onViewportChange({ ...viewport, zoom: Math.max(MIN_ZOOM, viewport.zoom / 1.2) });
  const resetView = () => onViewportChange({ x: 0, y: 0, zoom: 1 });
  return { zoomIn, zoomOut, resetView };
}
