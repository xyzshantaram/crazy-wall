/**
 * Helpers for finding nodes that depend on a given node's content — used to
 * mark downstream nodes "stale" after a recompute, since their content may
 * have been generated from context that just changed.
 *
 * Two kinds of dependency link exist in this app's graph:
 *  - tree structure: node.parentId === X (X's direct expansion children)
 *  - prompt-graph: an edge X --references--> promptNode, and promptNode
 *    --causes--> Y, means Y was generated using X as an input.
 */

import type { GraphEdge, GraphNode } from "../../types/graph";

/** The instruction sent to the model when auto-regenerating a node whose
 *  context changed, rather than a user-typed change description. Shared so
 *  the toast-triggered cascade and any manual "regenerate" action use
 *  identical wording (and so the prompt log reads consistently). */
export const STALE_REFRESH_INSTRUCTION =
  "The context this was generated from changed (an ancestor node was recomputed). Update this content to stay consistent with the current state of its inputs.";

/** Direct (one-hop) dependents of `nodeId`: its tree children plus any node
 *  produced by a prompt that had `nodeId` as an input. */
export function getDirectDependents(
  nodeId: string,
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
): string[] {
  const result = new Set<string>();

  for (const n of Object.values(nodes)) {
    if (n.parentId === nodeId) result.add(n.id);
  }

  // prompt-graph: nodeId -> promptNode (references), promptNode -> output (causes)
  const promptIds = edges.filter((e) => e.from === nodeId && e.type === "references").map((e) => e.to);
  for (const promptId of promptIds) {
    for (const e of edges) {
      if (e.from === promptId && e.type === "causes") result.add(e.to);
    }
  }

  result.delete(nodeId);
  return [...result];
}

/** Transitive closure of getDirectDependents — every node downstream of
 *  `nodeId` (children, grandchildren, prompt-chain outputs, etc). Guards
 *  against cycles via the visited set. */
export function getAllDownstreamDependents(
  nodeId: string,
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
): Set<string> {
  const visited = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const dep of getDirectDependents(current, nodes, edges)) {
      if (!visited.has(dep)) {
        visited.add(dep);
        stack.push(dep);
      }
    }
  }
  return visited;
}
