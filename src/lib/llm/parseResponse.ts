/**
 * Defensive parsing of the LLM's JSON response into a validated
 * LlmGraphResponse. Models occasionally wrap JSON in code fences or add stray
 * prose despite instructions -- recover from that where possible.
 */

import type { LlmGraphResponse, LlmNodeSpec, LlmEdgeSpec, LlmCapabilityDeclaration } from "./contract";
import type { NostrCapability } from "../../types/graph";

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

export function parseLlmGraphResponse(text: string): LlmGraphResponse {
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

    const spec: LlmNodeSpec = {
      tempId,
      parentTempId,
      title,
      kind,
      summary,
      narrativeRole: isValidNarrativeRole(n.narrativeRole) ? n.narrativeRole : undefined,
      render,
      widget: render === "static" ? (n.widget as LlmNodeSpec["widget"]) : undefined,
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
        .filter((c) => c.url);
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
