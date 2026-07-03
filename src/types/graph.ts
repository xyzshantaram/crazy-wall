/**
 * The semantic graph — the application's persistent source of truth.
 *
 * Everything rendered on the canvas (Lua tiles, static widget JSON, card
 * positions) is disposable/regenerable from this graph. The graph is what
 * gets saved to IndexedDB.
 */

import type { WidgetNode } from "./widget";

export type NodeKind =
  | "root"   // first node from a chat prompt
  | "topic"  // a generic branch/topic node
  | "leaf"   // a terminal elaboration node
  | "prompt" // user prompt bubble pinned on the wall
  | "portal"; // links to a node in a different wall (created by fork)

export type RelationType =
  | "depends_on"
  | "supports"
  | "contradicts"
  | "causes"
  | "inspired_by"
  | "references"
  | "alternative"
  | "supersedes"
  | "related"; // implicit / spatial-proximity inferred relation

export interface Provenance {
  /** Which provider/model produced this node's content. */
  model?: string;
  provider?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp of last edit (AI or user). */
  updatedAt: string;
  /** id of the node this one was forked from, if any. */
  forkedFrom?: string;
}

export type RenderMode = "static" | "lua" | "nostr-dashboard" | "markdown";

export type NostrCapability = "get-pubkey" | "publish-event" | "nip44-encrypt" | "nip44-decrypt" | "fetch" | "navigate";

export interface CapabilityDeclaration {
  capability: NostrCapability;
  /** The AI's plain-language justification for needing this capability, shown to the user in the approval dialog. */
  justification: string;
}

export type DashboardApproval =
  | { status: "pending" }
  | { status: "approved"; approvedAt: string; capabilities: NostrCapability[] }
  | { status: "rejected"; rejectedAt: string };

export interface NodeContent {
  mode: RenderMode;
  /** Present when mode === "static": the widget tree directly. */
  widget?: WidgetNode;
  /** Present when mode === "lua" or "nostr-dashboard": ephemeral Lua source. */
  lua?: string;
  /** Present when mode === "markdown": raw markdown string. */
  markdown?: string;
  /** Present when mode === "nostr-dashboard": capabilities the AI declared it needs, with justifications,
   *  plus the user's approve/reject decision for this exact script. */
  declaredCapabilities?: CapabilityDeclaration[];
  approval?: DashboardApproval;
}

export interface GraphNode {
  id: string;
  chatId: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  /** Short (1-2 sentence) plain-language description of what this node is/shows and why it
   *  exists. Always populated by the LLM; shown above the widget and in the Explain panel. */
  summary?: string;
  /** This node's role in the overall narrative flow the response was composed as. */
  narrativeRole?: "lede" | "detail" | "conclusion";
  /** The rendered content — either a static widget tree or a Lua program. */
  content: NodeContent;
  /** Free-form structured properties the AI attaches (key-value facts). */
  properties?: Record<string, string | number | boolean>;
  /** Editable fields a user directly edits (feeds back into context). */
  editableFields?: Record<string, string | number | boolean>;
  childIds: string[];
  /** Confidence 0-1 the AI assigns to this node's content. */
  confidence?: number;
  /** Free-text reasoning the AI can expose via "explain". */
  reasoning?: {
    why?: string;
    assumptions?: string[];
    evidence?: string[];
  };
  /** Sources cited by the AI when producing this node (from search tools). */
  citations?: { title: string; url: string; note?: string }[];
  provenance: Provenance;
  /** Canvas placement. */
  position: { x: number; y: number };
  size?: { w: number; h: number };
  pinned?: boolean;
  collapsed?: boolean;
  /** True while this node's content is being (re)generated. */
  generating?: boolean;
  /** True when an ancestor/input node this one depended on has since been
   *  recomputed, meaning this node's content may no longer reflect current
   *  context. Cleared when this node itself is recomputed. */
  stale?: boolean;
  /** Present when kind === "portal": the wall/node this portal jumps to. */
  portalTarget?: { chatId: string; nodeId: string };
}

export interface GraphEdge {
  id: string;
  chatId: string;
  from: string;
  to: string;
  type: RelationType;
  /** True when inferred from spatial proximity rather than explicitly created. */
  implicit?: boolean;
  label?: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PromptLogEntry {
  id: string;
  createdAt: string;
  mode: "new_root" | "expand" | "fork" | "follow_up" | "multi_select" | "recompute";
  prompt: string;
  /** The prompt-bubble node id placed on the canvas for this entry. */
  canvasNodeId: string;
  /** Node ids that were selected as inputs to this prompt (for highlighting). */
  inputNodeIds: string[];
  /** Node ids that were created by this prompt (output nodes). */
  outputNodeIds: string[];
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  rootNodeIds: string[];
  viewport: Viewport;
  bookmarks?: { id: string; label: string; viewport: Viewport }[];
  started: boolean;
  /** Ordered history of every prompt sent to this wall. */
  promptLog?: PromptLogEntry[];
  /** Running total of token usage/cost across every generateGraph() call
   *  ever made for this wall, persisted so it survives reload. Shape
   *  mirrors stores/usageStore.ts's UsageTotals (duplicated here rather than
   *  imported, since this is the persisted domain type and shouldn't
   *  depend on a store module). */
  cumulativeUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    costUsd: number;
    hasRealCost: boolean;
  };
}

export interface AppState {
  chats: Record<string, Chat>;
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  chatOrder: string[];
}
