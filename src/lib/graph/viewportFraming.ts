import type { GraphNode, Viewport } from "../../types/graph";
import { CARD_WIDTH, CARD_HEIGHT_ESTIMATE } from "./layoutConstants";

/**
 * Computes a viewport (x, y, zoom) that frames the given nodes' bounding box
 * within a viewport of the given pixel size, with some padding. Used to
 * auto-pan the canvas to newly-generated content instead of leaving it
 * off-screen or overlapping the current view.
 */
export function computeFramingViewport(
  nodes: GraphNode[],
  viewportSize: { width: number; height: number },
  opts?: { padding?: number; maxZoom?: number; minZoom?: number },
): Viewport | null {
  if (nodes.length === 0) return null;
  const padding = opts?.padding ?? 80;
  const maxZoom = opts?.maxZoom ?? 1;
  const minZoom = opts?.minZoom ?? 0.25;

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const maxX = Math.max(...nodes.map((n) => n.position.x + (n.size?.w ?? CARD_WIDTH)));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxY = Math.max(...nodes.map((n) => n.position.y + (n.size?.h ?? CARD_HEIGHT_ESTIMATE)));

  const boxW = Math.max(1, maxX - minX);
  const boxH = Math.max(1, maxY - minY);

  const zoomX = (viewportSize.width - padding * 2) / boxW;
  const zoomY = (viewportSize.height - padding * 2) / boxH;
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(zoomX, zoomY)));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    zoom,
    x: viewportSize.width / 2 - centerX * zoom,
    y: viewportSize.height / 2 - centerY * zoom,
  };
}
