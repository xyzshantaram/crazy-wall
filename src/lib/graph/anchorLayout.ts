/**
 * Computes where a new subtree of nodes should be anchored on the canvas so
 * it never overlaps existing content: below the lowest (max y + height)
 * existing node in the same chat, horizontally centered on either the whole
 * existing layout or a specific anchor node (e.g. the node being expanded).
 */

import type { GraphNode } from "../../types/graph";
import { CARD_HEIGHT_ESTIMATE, V_GAP } from "./layoutConstants";

export function computeBelowAnchor(
  existingNodes: GraphNode[],
  opts?: { centerOn?: { x: number; y: number } },
): { x: number; y: number } {
  if (existingNodes.length === 0) {
    return opts?.centerOn ?? { x: 0, y: 0 };
  }
  const maxBottom = Math.max(
    ...existingNodes.map((n) => n.position.y + (n.size?.h ?? CARD_HEIGHT_ESTIMATE)),
  );
  const centerX =
    opts?.centerOn?.x ??
    existingNodes.reduce((sum, n) => sum + n.position.x, 0) / existingNodes.length;
  return { x: centerX, y: maxBottom + V_GAP * 1.5 };
}
