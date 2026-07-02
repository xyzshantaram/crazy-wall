/**
 * useGraphActions — thin orchestration layer wiring UI intents (new root,
 * expand, fork, multi-select, recompute) to generateGraph() + applyGraphResponse(),
 * with loading state, error toasts, and generating-flag bookkeeping so cards
 * can show a skeleton while the LLM call is in flight.
 *
 * Every action that creates new nodes computes a non-overlapping anchor
 * position via computeBelowAnchor() (new content is placed below existing
 * content in the same chat, never on top of it) and reports the new node ids
 * back via onNodesCreated so the caller can auto-pan the viewport to them.
 */

import { useCallback, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { generateGraph } from "../lib/llm/generateGraph";
import { applyGraphResponse } from "../lib/graph/applyGraphResponse";
import { computeBelowAnchor } from "../lib/graph/anchorLayout";
import { useGraphStore } from "../stores/graphStore";
import { useSettingsStore } from "../stores/settingsStore";
import { toast } from "../stores/toastStore";
import { CARD_HEIGHT_ESTIMATE, V_GAP } from "../lib/graph/layoutConstants";
import type { ProviderId } from "../lib/providers/registry";
import type { RelationType, PromptLogEntry } from "../types/graph";

function deriveChatTitle(response: { nodes: { tempId: string; parentTempId: string | null; title: string }[] }): string | null {
  const rootSpec = response.nodes.find((n) => n.parentTempId === null) ?? response.nodes[0];
  const title = rootSpec?.title?.trim();
  return title ? title : null;
}

function buildContextNote(nodeIds: string[], includeAncestors = false): string {
  const state = useGraphStore.getState();
  const lines: string[] = [];
  for (const id of nodeIds) {
    const node = state.nodes[id];
    if (!node) continue;
    lines.push(`- "${node.title}" (${node.kind})${node.summary ? `: ${node.summary}` : ""}`);
    if (includeAncestors && node.parentId) {
      const parent = state.nodes[node.parentId];
      if (parent) lines.push(`  parent: "${parent.title}"${parent.summary ? ` — ${parent.summary}` : ""}`);
    }
    // Include direct children so the model understands what's already been explored
    const children = Object.values(state.nodes).filter((n) => n.parentId === id);
    if (children.length > 0) {
      lines.push(`  children: ${children.map((c) => `"${c.title}"`).join(", ")}`);
    }
  }
  return lines.join("\n");
}

/**
 * Builds a full-wall context note for the no-selection follow-up case.
 * Renders the tree in a readable outline, root → children → grandchildren,
 * so the model knows the entire current state of the wall and can extend
 * or modify it coherently rather than starting from scratch.
 */
function buildWallContext(chatId: string): string {
  const state = useGraphStore.getState();
  const all = Object.values(state.nodes).filter((n) => n.chatId === chatId);
  if (all.length === 0) return "";

  const byParent = new Map<string | null, typeof all>();
  for (const n of all) {
    const key = n.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  }

  const lines: string[] = ["Current wall state (tree outline):"];

  function renderNode(nodeId: string, depth: number) {
    const node = state.nodes[nodeId];
    if (!node) return;
    const indent = "  ".repeat(depth);
    const kindLabel = node.kind === "root" ? "[root]" : node.kind === "leaf" ? "[leaf]" : "[topic]";
    lines.push(`${indent}${kindLabel} "${node.title}"${node.summary ? `: ${node.summary}` : ""}`);
    const children = byParent.get(nodeId) ?? [];
    for (const child of children) renderNode(child.id, depth + 1);
  }

  const roots = byParent.get(null) ?? [];
  for (const root of roots) renderNode(root.id, 0);

  return lines.join("\n");
}

/**
 * Creates a prompt-bubble node on the canvas just above where new content
 * will land, and logs the entry in the chat's prompt history.
 */
function placePromptNode({
  chatId,
  prompt,
  mode,
  anchorPosition,
  inputNodeIds,
  outputNodeIds,
}: {
  chatId: string;
  prompt: string;
  mode: PromptLogEntry["mode"];
  anchorPosition: { x: number; y: number };
  inputNodeIds: string[];
  outputNodeIds: string[];
}): string {
  const store = useGraphStore.getState();
  const now = new Date().toISOString();

  // Compute the prompt bubble position: centred over the new output nodes,
  // just above the topmost one. Fall back to the anchor if nodes aren't in
  // the store yet (shouldn't happen but safe).
  const outputNodes = outputNodeIds
    .map((id) => store.nodes[id])
    .filter(Boolean);

  let bubbleX = anchorPosition.x;
  let bubbleY = anchorPosition.y - CARD_HEIGHT_ESTIMATE - V_GAP;

  if (outputNodes.length > 0) {
    const avgX = outputNodes.reduce((s, n) => s + n.position.x, 0) / outputNodes.length;
    const minY = Math.min(...outputNodes.map((n) => n.position.y));
    bubbleX = avgX;
    bubbleY = minY - CARD_HEIGHT_ESTIMATE * 0.75 - V_GAP;
  }

  const canvasNodeId = store.createNode({
    chatId,
    parentId: null,
    kind: "prompt",
    title: prompt.length > 60 ? prompt.slice(0, 57) + "…" : prompt,
    summary: prompt,
    content: { mode: "static", widget: { type: "text", text: prompt } },
    provenance: { createdAt: now, updatedAt: now },
    position: { x: bubbleX, y: bubbleY },
  });

  // Wire edges: input nodes → prompt, prompt → output nodes
  for (const inputId of inputNodeIds) {
    store.createEdge({ chatId, from: inputId, to: canvasNodeId, type: "references" });
  }
  for (const outputId of outputNodeIds) {
    store.createEdge({ chatId, from: canvasNodeId, to: outputId, type: "causes" });
  }

  const entry: PromptLogEntry = {
    id: nanoid(),
    createdAt: now,
    mode,
    prompt,
    canvasNodeId,
    inputNodeIds,
    outputNodeIds,
  };
  store.logPrompt(chatId, entry);
  return canvasNodeId;
}

export interface UseGraphActionsOptions {
  /** Called with the ids of newly created nodes after any generation completes,
   *  so the caller (ChatCanvas) can pan/frame the viewport to them. */
  onNodesCreated?: (chatId: string, nodeIds: string[]) => void;
}

export function useGraphActions(opts: UseGraphActionsOptions = {}) {
  const [busyNodeIds, setBusyNodeIds] = useState<Set<string>>(new Set());
  const [busyChat, setBusyChat] = useState(false);
  const onNodesCreated = opts.onNodesCreated;
  // Single AbortController per concurrent operation; cancel replaces it.
  const abortRef = useRef<AbortController | null>(null);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyChat(false);
    setBusyNodeIds(new Set());
  }, []);

  const newAbort = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    return ac.signal;
  }, []);

  const withProviderConfig = useCallback(() => {
    const s = useSettingsStore.getState();
    const providerId: ProviderId = s.activeProvider;
    const apiKey = s.apiKeys[providerId];
    const model = s.models[providerId];
    if (!apiKey?.trim()) {
      toast.push(`Add an API key for ${providerId} in Settings first.`, "warning");
      return null;
    }
    return { providerId, apiKey, model };
  }, []);

  const nodesInChat = useCallback(
    (chatId: string) => Object.values(useGraphStore.getState().nodes).filter((n) => n.chatId === chatId),
    [],
  );

  const createRoot = useCallback(
    async (chatId: string, prompt: string) => {
      const cfg = withProviderConfig();
      if (!cfg) return;
      setBusyChat(true);
      try {
        const computedAnchor = computeBelowAnchor(nodesInChat(chatId));
        const response = await generateGraph({
          mode: "new_root",
          providerId: cfg.providerId,
          apiKey: cfg.apiKey,
          model: cfg.model,
          chatId,
          userPrompt: prompt,
          signal: newAbort(),
        });
        const { newNodeIds, anchorPosition } = applyGraphResponse(response, {
          chatId,
          anchorParentId: null,
          anchorPosition: computedAnchor,
          provider: cfg.providerId,
          model: cfg.model,
        });
        placePromptNode({ chatId, prompt, mode: "new_root", anchorPosition, inputNodeIds: [], outputNodeIds: newNodeIds });
        onNodesCreated?.(chatId, newNodeIds);
        const currentTitle = useGraphStore.getState().chats[chatId]?.title;
        if (!currentTitle || currentTitle === "New Wall") {
          const derived = deriveChatTitle(response);
          if (derived) useGraphStore.getState().renameChat(chatId, derived);
        }
        if (response.summary) toast.push(response.summary, "default");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.push(err instanceof Error ? err.message : String(err), "danger");
      } finally {
        setBusyChat(false);
      }
    },
    [withProviderConfig, nodesInChat, onNodesCreated, newAbort],
  );

  const expandNode = useCallback(
    async (chatId: string, nodeId: string) => {
      const cfg = withProviderConfig();
      if (!cfg) return;
      const node = useGraphStore.getState().nodes[nodeId];
      if (!node) return;
      setBusyNodeIds((s) => new Set(s).add(nodeId));
      try {
        const computedAnchorExpand = computeBelowAnchor(nodesInChat(chatId), {
          centerOn: { x: node.position.x, y: node.position.y },
        });
        const expandPrompt = `Elaborate on "${node.title}". Context: ${node.summary ?? "(no summary yet)"}`;
        const response = await generateGraph({
          mode: "expand",
          providerId: cfg.providerId,
          apiKey: cfg.apiKey,
          model: cfg.model,
          chatId,
          userPrompt: expandPrompt,
          contextNote: buildContextNote([nodeId], true),
          signal: newAbort(),
        });
        const { newNodeIds, anchorPosition: expandAnchor } = applyGraphResponse(response, {
          chatId,
          anchorParentId: nodeId,
          anchorPosition: computedAnchorExpand,
          provider: cfg.providerId,
          model: cfg.model,
        });
        placePromptNode({ chatId, prompt: expandPrompt, mode: "expand", anchorPosition: expandAnchor, inputNodeIds: [nodeId], outputNodeIds: newNodeIds });
        onNodesCreated?.(chatId, newNodeIds);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.push(err instanceof Error ? err.message : String(err), "danger");
      } finally {
        setBusyNodeIds((s) => {
          const next = new Set(s);
          next.delete(nodeId);
          return next;
        });
      }
    },
    [withProviderConfig, nodesInChat, onNodesCreated, newAbort],
  );

  const forkNode = useCallback(
    async (nodeId: string, newChatId: string) => {
      const cfg = withProviderConfig();
      if (!cfg) return;
      const node = useGraphStore.getState().nodes[nodeId];
      if (!node) return;
      setBusyChat(true);
      try {
        const response = await generateGraph({
          mode: "fork",
          providerId: cfg.providerId,
          apiKey: cfg.apiKey,
          model: cfg.model,
          chatId: newChatId,
          userPrompt: `Continue and deepen this topic in a new context: "${node.title}"`,
          contextNote: buildContextNote([nodeId]),
          signal: newAbort(),
        });
        const { newNodeIds: forkNodeIds, anchorPosition: forkAnchor } = applyGraphResponse(response, {
          chatId: newChatId,
          anchorParentId: null,
          anchorPosition: { x: 0, y: 0 },
          provider: cfg.providerId,
          model: cfg.model,
        });
        const forkPrompt = `Continue and deepen this topic in a new context: "${node.title}"`;
        placePromptNode({ chatId: newChatId, prompt: forkPrompt, mode: "fork", anchorPosition: forkAnchor, inputNodeIds: [nodeId], outputNodeIds: forkNodeIds });
        onNodesCreated?.(newChatId, forkNodeIds);
        const derived = deriveChatTitle(response);
        if (derived) useGraphStore.getState().renameChat(newChatId, derived);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.push(err instanceof Error ? err.message : String(err), "danger");
      } finally {
        setBusyChat(false);
      }
    },
    [withProviderConfig, onNodesCreated, newAbort],
  );

  const multiSelectAction = useCallback(
    async (chatId: string, nodeIds: string[], instruction: string) => {
      const cfg = withProviderConfig();
      if (!cfg) return;
      setBusyChat(true);
      try {
        const selected = nodeIds.map((id) => useGraphStore.getState().nodes[id]).filter((n): n is NonNullable<typeof n> => Boolean(n));
        const avgX = selected.length ? selected.reduce((s, n) => s + n.position.x, 0) / selected.length : 0;
        const computedAnchorMulti = computeBelowAnchor(nodesInChat(chatId), { centerOn: { x: avgX, y: 0 } });
        const multiMode = nodeIds.length > 0 ? "multi_select" : "follow_up";
        const wallOverview = buildWallContext(chatId);
        const contextNote = nodeIds.length > 0
          ? `${wallOverview}\n\nSelected nodes (act on these per the instruction):\n${buildContextNote(nodeIds, true)}`
          : wallOverview;
        const response = await generateGraph({
          mode: multiMode,
          providerId: cfg.providerId,
          apiKey: cfg.apiKey,
          model: cfg.model,
          chatId,
          userPrompt: instruction,
          contextNote,
          signal: newAbort(),
        });
        const { newNodeIds: multiNodeIds, anchorPosition: multiAnchor } = applyGraphResponse(response, {
          chatId,
          anchorParentId: null,
          anchorPosition: computedAnchorMulti,
          provider: cfg.providerId,
          model: cfg.model,
        });
        placePromptNode({ chatId, prompt: instruction, mode: multiMode, anchorPosition: multiAnchor, inputNodeIds: nodeIds, outputNodeIds: multiNodeIds });
        onNodesCreated?.(chatId, multiNodeIds);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.push(err instanceof Error ? err.message : String(err), "danger");
      } finally {
        setBusyChat(false);
      }
    },
    [withProviderConfig, nodesInChat, onNodesCreated, newAbort],
  );

  const recomputeNode = useCallback(
    async (nodeId: string, changeDescription: string) => {
      const cfg = withProviderConfig();
      if (!cfg) return;
      const node = useGraphStore.getState().nodes[nodeId];
      if (!node) return;
      setBusyNodeIds((s) => new Set(s).add(nodeId));
      useGraphStore.getState().setNodeGenerating(nodeId, true);
      try {
        const response = await generateGraph({
          mode: "recompute",
          providerId: cfg.providerId,
          apiKey: cfg.apiKey,
          model: cfg.model,
          chatId: node.chatId,
          userPrompt: changeDescription,
          contextNote: buildContextNote([nodeId]),
          signal: newAbort(),
        });
        const spec = response.nodes[0];
        if (spec) {
          const content =
            spec.render === "static"
              ? { mode: "static" as const, widget: spec.widget }
              : { mode: "lua" as const, lua: spec.lua };
          useGraphStore.getState().updateNodeContent(nodeId, content);
          if (spec.summary) useGraphStore.getState().updateNode(nodeId, { summary: spec.summary });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.push(err instanceof Error ? err.message : String(err), "danger");
        useGraphStore.getState().setNodeGenerating(nodeId, false);
      } finally {
        setBusyNodeIds((s) => {
          const next = new Set(s);
          next.delete(nodeId);
          return next;
        });
      }
    },
    [withProviderConfig, newAbort],
  );

  return {
    busyNodeIds,
    busyChat,
    createRoot,
    expandNode,
    forkNode,
    multiSelectAction,
    recomputeNode,
    cancelGeneration,
  };
}

export type { RelationType };
