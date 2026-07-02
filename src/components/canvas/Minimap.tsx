/**
 * Minimap — small overview of the entire canvas, showing all node positions
 * as dots and the current viewport as a highlighted rect.
 *
 * Tapping/clicking a point on the minimap pans the canvas so that point is
 * centered in the viewport.
 *
 * Collapsible: tap the minimap header to hide/show.
 */

import { useState, useCallback } from "react";
import type { GraphNode, Viewport } from "../../types/graph";
import { CARD_WIDTH, CARD_HEIGHT_ESTIMATE } from "../../lib/graph/layoutConstants";

const MAP_W = 148;
const MAP_H = 100;
const PADDING = 16; // world-space padding around all nodes

interface Props {
  nodes: GraphNode[];
  viewport: Viewport;
  containerSize: { width: number; height: number };
  onViewportChange: (v: Viewport) => void;
}

function getWorldBounds(nodes: GraphNode[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const minX = Math.min(...nodes.map((n) => n.position.x)) - PADDING;
  const minY = Math.min(...nodes.map((n) => n.position.y)) - PADDING;
  const maxX = Math.max(...nodes.map((n) => n.position.x + (n.size?.w ?? CARD_WIDTH))) + PADDING;
  const maxY = Math.max(...nodes.map((n) => n.position.y + (n.size?.h ?? CARD_HEIGHT_ESTIMATE))) + PADDING;
  return { minX, minY, maxX, maxY };
}

export function Minimap({ nodes, viewport, containerSize, onViewportChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const visibleNodes = nodes.filter((n) => n.kind !== "prompt");
  const bounds = getWorldBounds(visibleNodes.length > 0 ? visibleNodes : nodes);
  const worldW = Math.max(1, bounds.maxX - bounds.minX);
  const worldH = Math.max(1, bounds.maxY - bounds.minY);

  // Scale world → minimap
  const scaleX = MAP_W / worldW;
  const scaleY = MAP_H / worldH;
  const scale = Math.min(scaleX, scaleY);
  // Actual rendered map size (may be smaller than MAP_W×MAP_H if aspect differs)
  const mapW = worldW * scale;
  const mapH = worldH * scale;
  // Offset to center within the MAP_W×MAP_H box
  const offsetX = (MAP_W - mapW) / 2;
  const offsetY = (MAP_H - mapH) / 2;

  const worldToMap = (wx: number, wy: number) => ({
    x: offsetX + (wx - bounds.minX) * scale,
    y: offsetY + (wy - bounds.minY) * scale,
  });

  // Current viewport rect in world space, then map to minimap
  const vpMinX = -viewport.x / viewport.zoom;
  const vpMinY = -viewport.y / viewport.zoom;
  const vpMaxX = vpMinX + containerSize.width / viewport.zoom;
  const vpMaxY = vpMinY + containerSize.height / viewport.zoom;
  const vpTopLeft = worldToMap(vpMinX, vpMinY);
  const vpBottomRight = worldToMap(vpMaxX, vpMaxY);
  const vpRectW = Math.max(4, vpBottomRight.x - vpTopLeft.x);
  const vpRectH = Math.max(4, vpBottomRight.y - vpTopLeft.y);

  // Click/tap on minimap → pan canvas so that world point is centered
  const handleMapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Map coords → world coords
    const wx = (mx - offsetX) / scale + bounds.minX;
    const wy = (my - offsetY) / scale + bounds.minY;
    // Pan so (wx, wy) is centered in the viewport
    onViewportChange({
      ...viewport,
      x: containerSize.width / 2 - wx * viewport.zoom,
      y: containerSize.height / 2 - wy * viewport.zoom,
    });
  }, [bounds, scale, offsetX, offsetY, viewport, containerSize, onViewportChange]);

  if (nodes.length === 0) return null;

  return (
    <div
      data-no-pan
      className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] left-4 sm:bottom-5 sm:left-5 z-20 bg-surface/90 border border-border rounded-xl shadow-panel overflow-hidden backdrop-blur-sm"
      style={{ width: MAP_W + 2 }}
    >
      {/* Header / collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] text-ink-faint hover:text-ink transition-colors"
      >
        <span className="font-medium uppercase tracking-wide">Overview</span>
        <svg
          width="8" height="8" viewBox="0 0 10 10" fill="none"
          className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {!collapsed && (
        <svg
          width={MAP_W}
          height={MAP_H}
          onClick={handleMapClick}
          className="block cursor-crosshair"
          style={{ display: "block" }}
        >
          {/* Background */}
          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="transparent" />

          {/* Node dots */}
          {nodes.map((node) => {
            const pos = worldToMap(node.position.x, node.position.y);
            const w = Math.max(3, (node.size?.w ?? CARD_WIDTH) * scale);
            const h = Math.max(2, (node.size?.h ?? CARD_HEIGHT_ESTIMATE) * scale * 0.5);
            const color = node.kind === "prompt"
              ? "rgba(245,185,90,0.5)"
              : node.kind === "root"
                ? "rgba(124,108,255,0.7)"
                : "rgba(78,225,214,0.5)";
            return (
              <rect
                key={node.id}
                x={pos.x}
                y={pos.y}
                width={w}
                height={h}
                rx={1}
                fill={color}
              />
            );
          })}

          {/* Viewport rect */}
          <rect
            x={Math.max(0, vpTopLeft.x)}
            y={Math.max(0, vpTopLeft.y)}
            width={Math.min(vpRectW, MAP_W - Math.max(0, vpTopLeft.x))}
            height={Math.min(vpRectH, MAP_H - Math.max(0, vpTopLeft.y))}
            fill="rgba(124,108,255,0.08)"
            stroke="rgba(124,108,255,0.5)"
            strokeWidth={1}
            rx={2}
          />
        </svg>
      )}
    </div>
  );
}
