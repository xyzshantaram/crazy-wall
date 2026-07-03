/**
 * SVG layer drawing relationship edges between node cards, in the same world
 * coordinate space as the cards themselves (rendered inside the same
 * transformed container, so no manual zoom/pan math needed here).
 */

import type { GraphEdge, GraphNode } from "../../types/graph";
import { CARD_WIDTH, CARD_HEIGHT_ESTIMATE } from "../../lib/graph/layoutConstants";

const TYPE_COLOR: Record<string, string> = {
  depends_on: "#f5b95a",
  supports: "#3ddc97",
  contradicts: "#ff6b6b",
  causes: "#7c6cff",
  inspired_by: "#c084fc",
  references: "#60a5fa",
  alternative: "#4ee1d6",
  supersedes: "#9aa1b5",
  related: "#5b6178",
};

interface Props {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  parentChildPairs: { from: string; to: string }[];
}

function anchorPoints(a: GraphNode, b: GraphNode) {
  const aw = a.size?.w ?? CARD_WIDTH;
  const ah = a.size?.h ?? CARD_HEIGHT_ESTIMATE;
  const bw = b.size?.w ?? CARD_WIDTH;
  const bh = b.size?.h ?? CARD_HEIGHT_ESTIMATE;
  const aCenter = { x: a.position.x + aw / 2, y: a.position.y + ah / 2 };
  const bCenter = { x: b.position.x + bw / 2, y: b.position.y + bh / 2 };

  // simple: connect bottom-center of a to top-center of b if b is mostly below,
  // otherwise connect nearest edge midpoints.
  if (Math.abs(aCenter.y - bCenter.y) > Math.abs(aCenter.x - bCenter.x)) {
    if (bCenter.y > aCenter.y) {
      return { x1: aCenter.x, y1: a.position.y + ah, x2: bCenter.x, y2: b.position.y };
    }
    return { x1: aCenter.x, y1: a.position.y, x2: bCenter.x, y2: b.position.y + bh };
  }
  if (bCenter.x > aCenter.x) {
    return { x1: a.position.x + aw, y1: aCenter.y, x2: b.position.x, y2: bCenter.y };
  }
  return { x1: a.position.x, y1: aCenter.y, x2: b.position.x + bw, y2: bCenter.y };
}

function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dy) > Math.abs(dx)) {
    const midY = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  }
  const midX = (x1 + x2) / 2;
  return `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
}

export function EdgesLayer({ nodes, edges, parentChildPairs }: Props) {
  return (
    <svg
      className="absolute top-0 left-0 overflow-visible pointer-events-none"
      style={{ width: 1, height: 1 }}
    >
      <defs>
        <marker id="arrow-related" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <path d="M0,0 L6,3.5 L0,7 Z" fill="var(--color-border)" />
        </marker>
      </defs>

      {/* implicit parent-child tree lines */}
      {parentChildPairs.map((pair, i) => {
        const a = nodes[pair.from];
        const b = nodes[pair.to];
        if (!a || !b) return null;
        const pts = anchorPoints(a, b);
        return (
          <path
            key={`pc-${i}`}
            d={curvePath(pts.x1, pts.y1, pts.x2, pts.y2)}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="1.5"
          />
        );
      })}

      {/* explicit typed relationships */}
      {edges.map((edge) => {
        const a = nodes[edge.from];
        const b = nodes[edge.to];
        if (!a || !b) return null;
        const pts = anchorPoints(a, b);
        const color = TYPE_COLOR[edge.type] ?? TYPE_COLOR.related;
        const midX = (pts.x1 + pts.x2) / 2;
        const midY = (pts.y1 + pts.y2) / 2;
        return (
          <g key={edge.id}>
            <path
              d={curvePath(pts.x1, pts.y1, pts.x2, pts.y2)}
              fill="none"
              stroke={color}
              strokeWidth={edge.implicit ? 1.25 : 1.75}
              strokeDasharray={edge.implicit ? "3,4" : undefined}
              opacity={edge.implicit ? 0.45 : 0.85}
            />
            <g transform={`translate(${midX}, ${midY})`}>
              <rect x={-38} y={-9} width={76} height={18} rx={9} fill="var(--color-surface-2)" stroke={color} strokeOpacity={0.4} />
              <text x={0} y={4} textAnchor="middle" fontSize="9.5" fill={color} fontFamily="var(--font-mono)">
                {edge.label ?? edge.type.replace("_", " ")}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
