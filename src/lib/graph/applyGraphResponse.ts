/**
 * Applies a parsed LlmGraphResponse to the graph store: allocates real node
 * ids for each tempId, wires parent/child relationships, positions new nodes
 * on the canvas (simple tree layout relative to an anchor point), and
 * creates any declared edges.
 *
 * This is the single place that turns "LLM said X" into "the graph now
 * contains X" -- used by every UI action (new root, expand, fork,
 * multi-select, recompute).
 */

import { nanoid } from "nanoid";
import type { LlmGraphResponse, LlmNodeSpec } from "../llm/contract";
import type { GraphNode, NodeContent } from "../../types/graph";
import { useGraphStore } from "../../stores/graphStore";
import { CARD_WIDTH, CARD_HEIGHT_ESTIMATE, H_GAP, V_GAP, MAX_COLS } from "./layoutConstants";

export interface ApplyGraphOptions {
  chatId: string;
  /** parentId in the REAL graph that every top-level (parentTempId=null) LLM node should attach under.
   *  null means "these are new chat roots" (e.g. the very first prompt). */
  anchorParentId: string | null;
  /** Canvas position to center the new subtree around. */
  anchorPosition: { x: number; y: number };
  provider: string;
  model: string;
}

/**
 * Compact column-aware tree layout.
 *
 * Each node's children are placed in a grid of at most MAX_COLS columns.
 * When there are more children than MAX_COLS, they wrap into multiple rows
 * within the same subtree — this prevents the extreme horizontal sprawl of the
 * pure-left-to-right approach while still showing all nodes.
 *
 * The bounding box (width × height) of each subtree is computed bottom-up,
 * then positions are assigned top-down so nothing overlaps.
 */
function layoutPositions(
  nodes: LlmNodeSpec[],
  anchor: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  const byParent = new Map<string | null, LlmNodeSpec[]>();
  for (const n of nodes) {
    const key = n.parentTempId;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  }

  const positions = new Map<string, { x: number; y: number }>();

  // Bounding box of each subtree rooted at tempId (does NOT include the node
  // itself — just the space needed for all descendants, anchored at 0,0).
  const bbox = new Map<string, { w: number; h: number }>();

  function computeBbox(tempId: string): { w: number; h: number } {
    const children = byParent.get(tempId) ?? [];
    if (children.length === 0) {
      const b = { w: CARD_WIDTH, h: CARD_HEIGHT_ESTIMATE };
      bbox.set(tempId, b);
      return b;
    }

    // Children packed into rows of at most MAX_COLS.
    const cols = Math.min(children.length, MAX_COLS);
    const rows = Math.ceil(children.length / cols);

    // Each column width = widest child bbox in that column.
    const colWidths: number[] = Array(cols).fill(0);
    // Each row height = tallest child full-height (node + descendants) in that row.
    const rowHeights: number[] = Array(rows).fill(0);

    children.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cb = computeBbox(c.tempId);
      const childFullH = CARD_HEIGHT_ESTIMATE + (cb.h > 0 ? V_GAP + cb.h : 0);
      colWidths[col] = Math.max(colWidths[col], cb.w);
      rowHeights[row] = Math.max(rowHeights[row], childFullH);
    });

    const totalW = colWidths.reduce((s, w) => s + w, 0) + H_GAP * (cols - 1);
    const totalH = rowHeights.reduce((s, h) => s + h, 0) + V_GAP * (rows - 1);

    const b = { w: Math.max(CARD_WIDTH, totalW), h: totalH };
    bbox.set(tempId, b);
    return b;
  }

  const roots = byParent.get(null) ?? [];
  roots.forEach((r) => computeBbox(r.tempId));

  // Pre-order placement: parentX/parentY is the top-left of the parent card's
  // own bounding box when we recurse into it.
  function place(tempId: string, cardX: number, cardY: number) {
    positions.set(tempId, { x: cardX, y: cardY });

    const children = byParent.get(tempId) ?? [];
    if (children.length === 0) return;

    const cols = Math.min(children.length, MAX_COLS);
    const colWidths: number[] = Array(cols).fill(0);
    const rowHeights: number[] = Array(Math.ceil(children.length / cols)).fill(0);

    children.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cb = bbox.get(c.tempId) ?? { w: CARD_WIDTH, h: 0 };
      const childFullH = CARD_HEIGHT_ESTIMATE + (cb.h > 0 ? V_GAP + cb.h : 0);
      colWidths[col] = Math.max(colWidths[col], cb.w);
      rowHeights[row] = Math.max(rowHeights[row], childFullH);
    });

    const totalChildrenW = colWidths.reduce((s, w) => s + w, 0) + H_GAP * (cols - 1);
    // Center children grid under the parent card.
    const gridLeft = cardX + CARD_WIDTH / 2 - totalChildrenW / 2;
    const gridTop = cardY + CARD_HEIGHT_ESTIMATE + V_GAP;

    // Column x-origins.
    const colX: number[] = [];
    let cx = gridLeft;
    for (let c = 0; c < cols; c++) {
      colX.push(cx);
      cx += colWidths[c] + H_GAP;
    }

    // Row y-origins.
    const rowY: number[] = [];
    let ry = gridTop;
    for (let r = 0; r < rowHeights.length; r++) {
      rowY.push(ry);
      ry += rowHeights[r] + V_GAP;
    }

    children.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cb = bbox.get(c.tempId) ?? { w: CARD_WIDTH, h: 0 };
      // Center each card horizontally within its column slot.
      const childX = colX[col] + colWidths[col] / 2 - CARD_WIDTH / 2;
      // Align child card to the top of its row.
      const childY = rowY[row];
      place(c.tempId, childX, childY);
      void cb;
    });
  }

  // Lay out multiple roots side-by-side (uncommon but handled).
  const rootBboxes = roots.map((r) => bbox.get(r.tempId) ?? { w: CARD_WIDTH, h: 0 });
  const totalRootsW = rootBboxes.reduce((s, b) => s + b.w, 0) + H_GAP * (roots.length - 1);
  let rx = anchor.x - totalRootsW / 2;
  for (let i = 0; i < roots.length; i++) {
    const rw = rootBboxes[i].w;
    // Center each root card within its bbox slice.
    place(roots[i].tempId, rx + rw / 2 - CARD_WIDTH / 2, anchor.y);
    rx += rw + H_GAP;
  }

  return positions;
}

export function applyGraphResponse(response: LlmGraphResponse, opts: ApplyGraphOptions): { newNodeIds: string[]; anchorPosition: { x: number; y: number } } {
  const store = useGraphStore.getState();
  const tempIdToRealId = new Map<string, string>();
  for (const n of response.nodes) tempIdToRealId.set(n.tempId, nanoid());

  const positions = layoutPositions(response.nodes, opts.anchorPosition);
  const newNodeIds: string[] = [];

  // Create nodes in an order where parents exist before children lookups matter
  // (createNode itself doesn't require the parent to exist yet in the map since
  // we resolve parentId below, but we still create in response order which is
  // typically parent-first).
  for (const spec of response.nodes) {
    const id = tempIdToRealId.get(spec.tempId)!;
    const parentId = spec.parentTempId ? tempIdToRealId.get(spec.parentTempId) ?? opts.anchorParentId : opts.anchorParentId;
    const pos = positions.get(spec.tempId) ?? opts.anchorPosition;

    const content: NodeContent =
      spec.render === "static"
        ? { mode: "static", widget: spec.widget }
        : spec.render === "nostr-dashboard"
          ? {
              mode: "nostr-dashboard",
              lua: spec.lua,
              declaredCapabilities: spec.declaredCapabilities,
              approval: { status: "pending" },
            }
          : { mode: "lua", lua: spec.lua };

    const node: Omit<GraphNode, "id" | "childIds"> & { id: string } = {
      id,
      chatId: opts.chatId,
      parentId,
      kind: spec.kind,
      title: spec.title,
      summary: spec.summary || undefined,
      narrativeRole: spec.narrativeRole,
      content,
      properties: spec.properties,
      confidence: spec.confidence,
      reasoning: spec.reasoning,
      citations: spec.citations,
      provenance: {
        provider: opts.provider,
        model: opts.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      position: pos,
    };
    store.createNode(node);
    newNodeIds.push(id);
  }

  if (response.edges) {
    for (const e of response.edges) {
      const from = tempIdToRealId.get(e.fromTempId);
      const to = tempIdToRealId.get(e.toTempId);
      if (!from || !to) continue;
      store.createEdge({ chatId: opts.chatId, from, to, type: e.type, label: e.label });
    }
  }

  return { newNodeIds, anchorPosition: opts.anchorPosition };
}
