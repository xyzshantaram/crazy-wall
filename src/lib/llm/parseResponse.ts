/**
 * Defensive parsing of the LLM's JSON response into a validated
 * LlmGraphResponse. Models occasionally wrap JSON in code fences or add stray
 * prose despite instructions -- recover from that where possible.
 */

import type { LlmGraphResponse, LlmNodeSpec, LlmEdgeSpec, LlmCapabilityDeclaration } from "./contract";
import type { NostrCapability } from "../../types/graph";
import type { CitationPool } from "./tools/toolRuntime";
import { validateWidgetNode } from "../../types/widgetSchema";
import type { WidgetNode } from "../../types/widget";

export class LlmResponseError extends Error {
  raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "LlmResponseError";
    this.raw = raw;
  }
}

function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // If there's leading/trailing prose, grab the outermost {...}.
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function isValidRender(v: unknown): v is "static" | "lua" | "nostr-dashboard" | "markdown" {
  return v === "static" || v === "lua" || v === "nostr-dashboard" || v === "markdown";
}

function isValidKind(v: unknown): v is "root" | "topic" | "leaf" {
  return v === "root" || v === "topic" || v === "leaf";
}

function isValidNarrativeRole(v: unknown): v is "lede" | "detail" | "conclusion" {
  return v === "lede" || v === "detail" || v === "conclusion";
}

const NOSTR_CAPABILITIES = new Set<NostrCapability>([
  "get-pubkey",
  "publish-event",
  "nip44-encrypt",
  "nip44-decrypt",
  "fetch",
  "navigate",
]);

const RELATION_TYPES = new Set([
  "depends_on",
  "supports",
  "contradicts",
  "causes",
  "inspired_by",
  "references",
  "alternative",
  "supersedes",
  "related",
]);

/** A minimal, always-valid widget substituted for a node whose LLM-emitted
 *  widget tree failed schema validation — keeps the rest of the response
 *  intact instead of discarding the whole graph over one bad node. */
function invalidWidgetFallback(reason: string): WidgetNode {
  return {
    type: "text",
    text: `This node's content could not be rendered (invalid widget data: ${reason}).`,
    variant: "danger",
  };
}

export function parseLlmGraphResponse(text: string, citationPool?: CitationPool): LlmGraphResponse {
  const jsonStr = extractJsonBlock(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new LlmResponseError(
      `Model response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      text,
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new LlmResponseError("Model response JSON was not an object.", text);
  }
  const obj = parsed as Record<string, unknown>;

  const summary = typeof obj.summary === "string" ? obj.summary : "";

  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) {
    throw new LlmResponseError("Model response had no `nodes` array.", text);
  }

  const seenTempIds = new Set<string>();
  const nodes: LlmNodeSpec[] = obj.nodes.map((raw, idx) => {
    if (typeof raw !== "object" || raw === null) {
      throw new LlmResponseError(`nodes[${idx}] is not an object.`, text);
    }
    const n = raw as Record<string, unknown>;
    const tempId = typeof n.tempId === "string" && n.tempId ? n.tempId : `n${idx}`;
    if (seenTempIds.has(tempId)) {
      throw new LlmResponseError(`Duplicate tempId "${tempId}" in nodes array.`, text);
    }
    seenTempIds.add(tempId);

    const title = typeof n.title === "string" && n.title.trim() ? n.title.trim() : "Untitled";
    const kind = isValidKind(n.kind) ? n.kind : "topic";
    const render = isValidRender(n.render) ? n.render : n.lua ? "lua" : n.markdown ? "markdown" : "static";
    const summary = typeof n.summary === "string" && n.summary.trim() ? n.summary.trim() : "";

    if (render === "static" && (typeof n.widget !== "object" || n.widget === null)) {
      throw new LlmResponseError(`nodes[${idx}] ("${tempId}") has render=static but no widget object.`, text);
    }
    if ((render === "lua" || render === "nostr-dashboard") && typeof n.lua !== "string") {
      throw new LlmResponseError(`nodes[${idx}] ("${tempId}") has render=${render} but no lua string.`, text);
    }
    if (render === "markdown" && typeof n.markdown !== "string") {
      throw new LlmResponseError(`nodes[${idx}] ("${tempId}") has render=markdown but no markdown string.`, text);
    }

    const parentTempId =
      typeof n.parentTempId === "string" && n.parentTempId.trim() ? n.parentTempId.trim() : null;

    // Validate the widget tree shape before it ever reaches WidgetRenderer —
    // WidgetRenderer has no defensive checks of its own (e.g. TableWidget
    // calls .map() on `columns`/`rows` unconditionally), and with no error
    // boundary in the app, a malformed tree crashes the whole canvas rather
    // than just failing to render this one node. Substitute a fallback
    // widget instead of throwing, so one bad node doesn't sink the response.
    let widget: WidgetNode | undefined;
    if (render === "static") {
      const validation = validateWidgetNode(n.widget);
      widget = validation.valid ? (n.widget as WidgetNode) : invalidWidgetFallback(validation.error ?? "unknown");
    }

    const spec: LlmNodeSpec = {
      tempId,
      parentTempId,
      title,
      kind,
      summary,
      narrativeRole: isValidNarrativeRole(n.narrativeRole) ? n.narrativeRole : undefined,
      render,
      widget,
      lua: render === "lua" || render === "nostr-dashboard" ? (n.lua as string) : undefined,
    };

    if (render === "nostr-dashboard" && Array.isArray(n.declaredCapabilities)) {
      spec.declaredCapabilities = n.declaredCapabilities
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map((c) => ({
          capability: String(c.capability) as NostrCapability,
          justification: typeof c.justification === "string" ? c.justification : "No justification provided.",
        }))
        .filter((c): c is LlmCapabilityDeclaration => NOSTR_CAPABILITIES.has(c.capability));
    }

    if (n.properties && typeof n.properties === "object") {
      spec.properties = n.properties as LlmNodeSpec["properties"];
    }
    if (typeof n.confidence === "number") spec.confidence = Math.max(0, Math.min(1, n.confidence));
    if (n.reasoning && typeof n.reasoning === "object") {
      spec.reasoning = n.reasoning as LlmNodeSpec["reasoning"];
    }
    if (Array.isArray(n.citations)) {
      spec.citations = n.citations
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map((c) => ({
          title: typeof c.title === "string" ? c.title : "Source",
          url: typeof c.url === "string" ? c.url : "",
          note: typeof c.note === "string" ? c.note : undefined,
        }))
        .filter((c) => c.url)
        // Cross-check against the ground-truth citation pool (URLs actually
        // fetched by a tool this turn) rather than trusting the model's
        // "copy verbatim" self-report. A citation whose URL was never
        // actually fetched is dropped outright — it's either a hallucinated
        // URL or a typo, and surfacing it as a real source would be worse
        // than omitting it. When the URL IS in the pool, its title is
        // corrected to match the fetched source exactly (the model
        // sometimes paraphrases titles when copying).
        .filter((c) => {
          if (!citationPool) return true;
          if (!citationPool.has(c.url)) return false;
          const groundTruthTitle = citationPool.titleFor(c.url);
          if (groundTruthTitle) c.title = groundTruthTitle;
          return true;
        });
    }

    return spec;
  });

  let edges: LlmEdgeSpec[] | undefined;
  if (Array.isArray(obj.edges)) {
    edges = obj.edges
      .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
      .map((e) => ({
        fromTempId: String(e.fromTempId ?? ""),
        toTempId: String(e.toTempId ?? ""),
        type: RELATION_TYPES.has(String(e.type)) ? (e.type as LlmEdgeSpec["type"]) : "related",
        label: typeof e.label === "string" ? e.label : undefined,
      }))
      .filter((e) => e.fromTempId && e.toTempId && seenTempIds.has(e.fromTempId) && seenTempIds.has(e.toTempId));
  }

  return { summary, nodes, edges };
}
