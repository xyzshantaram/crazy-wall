/**
 * The strict JSON contract the LLM must return for every graph-mutating
 * operation (new root, expand node, fork, multi-select action, live-edit
 * recompute). One shape covers all of them — only how it's *applied* differs.
 */

import type { WidgetNode } from "../../types/widget";
import type { RelationType, NostrCapability } from "../../types/graph";

export interface LlmCapabilityDeclaration {
  capability: NostrCapability;
  justification: string;
}

export interface LlmCitation {
  /** Short label shown in the citation list, e.g. "Wikipedia: Large Hadron Collider" */
  title: string;
  /** Full URL of the source, e.g. https://en.wikipedia.org/wiki/Large_Hadron_Collider */
  url: string;
  /** Optional 1-sentence note on what this source contributed to the node */
  note?: string;
}

export interface LlmNodeSpec {
  /** A short stable string the LLM invents for this node (e.g. "market", "risks-1").
   *  Used only to wire parentId/edges within THIS response; the app assigns real ids. */
  tempId: string;
  /** tempId of the parent within this response, or null to attach directly
   *  under the node being expanded / the chat root. */
  parentTempId: string | null;
  title: string;
  kind: "root" | "topic" | "leaf";
  /** 1-2 sentence plain-language description of what this specific node is/shows and why it
   *  exists in the flow. Shown above the widget in the card, and in the "Explain" panel.
   *  Always required -- this is what lets a user orient themselves before reading the widget. */
  summary: string;
  /** This node's role in the overall narrative flow, used to order/frame nodes so the whole
   *  response reads as a guided sequence rather than disconnected facts:
   *  "lede" = sets up the frame/context (usually the root), "detail" = a supporting point,
   *  "conclusion" = ties it together / the takeaway. Most non-root nodes are "detail". */
  narrativeRole?: "lede" | "detail" | "conclusion";
  /** "static": widget is ready-made JSON, rendered immediately, no sandbox.
   *  "lua": lua is a nostr-canvas-compatible Lua program executed in the sandbox.
   *  "nostr-dashboard": like "lua" but may call real Nostr capabilities.
   *  "markdown": raw Markdown string — use ONLY for genuinely prose-heavy content
   *  (e.g. a detailed written explanation, narrative text, a long how-to) where
   *  widget primitives would be a worse fit. For most nodes prefer "static". */
  render: "static" | "lua" | "nostr-dashboard" | "markdown";
  widget?: WidgetNode;
  lua?: string;
  /** Present when render === "markdown": the full Markdown string to render. */
  markdown?: string;
  declaredCapabilities?: LlmCapabilityDeclaration[];
  properties?: Record<string, string | number | boolean>;
  confidence?: number;
  reasoning?: {
    why?: string;
    assumptions?: string[];
    evidence?: string[];
  };
  /** Sources used to produce this node's content (populated when search tools were called). */
  citations?: LlmCitation[];
}

export interface LlmEdgeSpec {
  fromTempId: string;
  toTempId: string;
  type: RelationType;
  label?: string;
}

export interface LlmGraphResponse {
  /** 1-3 sentence plain-language summary of what was produced. Always present. */
  summary: string;
  nodes: LlmNodeSpec[];
  edges?: LlmEdgeSpec[];
}
