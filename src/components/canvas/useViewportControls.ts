/**
 * Viewport control helpers (zoom in/out/reset/fit-all).
 * Split out of CanvasViewport.tsx for fast-refresh friendliness and reuse.
 */

import type { GraphNode, Viewport } from "../../types/graph";
import { computeFramingViewport } from "../../lib/graph/viewportFraming";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.25;

export function useViewportControls(viewport: Viewport, onViewportChange: (v: Viewport) => void) {
  const zoomIn  = () => onViewportChange({ ...viewport, zoom: Math.min(MAX_ZOOM, viewport.zoom * ZOOM_STEP) });
  const zoomOut = () => onViewportChange({ ...viewport, zoom: Math.max(MIN_ZOOM, viewport.zoom / ZOOM_STEP) });
  const resetView = () => onViewportChange({ x: 0, y: 0, zoom: 1 });

  const fitAll = (nodes: GraphNode[], containerSize: { width: number; height: number }) => {
    if (nodes.length === 0) { resetView(); return; }
    const framed = computeFramingViewport(nodes, containerSize, { padding: 60, maxZoom: 1.2, minZoom: MIN_ZOOM });
    if (framed) onViewportChange(framed);
  };

  return { zoomIn, zoomOut, resetView, fitAll };
}
