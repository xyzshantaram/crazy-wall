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
import { getAllDownstreamDependents, getDirectDependents, STALE_REFRESH_INSTRUCTION } from "../lib/graph/dependents";
import { extractNodeBodyText, extractNodePreview } from "../lib/graph/nodeText";
import { useGraphStore } from "../stores/graphStore";
import { useSettingsStore } from "../stores/settingsStore";
import { toast } from "../stores/toastStore";
import { CARD_HEIGHT_ESTIMATE, V_GAP } from "../lib/graph/layoutConstants";
import type { ProviderId } from "../lib/providers/registry";
import type { NodeContent, RelationType, PromptLogEntry } from "../types/graph";

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
    // Include the node's actual rendered content (table rows, chart data,
    // checklist items, etc.), not just its one-line summary — the summary
    // is a narrator's caption, not a substitute for the real data, and an
    // action that builds on/merges/expands this node needs the real data to
    // avoid hallucinating or blandly restating the summary. Uncapped by
    // design (per explicit product decision) since these are nodes the
    // user deliberately selected as input — truncating exactly the content
    // they chose to hand over would defeat the point.
    const body = extractNodeBodyText(node);
    if (body) lines.push(`  content: ${body}`);
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
    // A one-line summary alone is often too thin for the model to reason
    // about what's already on the wall (e.g. "a table" vs. "a table of
    // exactly these 5 competitors with these prices") — add a short,
    // capped content preview beneath it. Deliberately much shorter than
    // buildContextNote's uncapped full-body inclusion: this runs for EVERY
    // node on the whole wall on every follow-up prompt, so an uncapped dump
    // here would scale badly with wall size in a way a few explicitly
    // selected nodes never would.
    const preview = extractNodePreview(node, 180);
    if (preview && preview !== "(no preview)") lines.push(`${indent}  ↳ ${preview}`);
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

/**
 * Creates a small "portal" node in `chatId` linking to `target` (a node in
 * another wall), positioned near `nearPosition`, and logs it in that chat's
 * prompt history (mode "fork", no user-facing prompt text) so it participates
 * in revertToPrompt's cleanup like every other generated node — otherwise a
 * portal would never be deletable by reverting past the point it was created,
 * unlike everything else on the wall.
 */
function placePortalNode({
  chatId,
  title,
  nearPosition,
  target,
}: {
  chatId: string;
  title: string;
  nearPosition: { x: number; y: number };
  target: { chatId: string; nodeId: string };
}): string {
  const store = useGraphStore.getState();
  const now = new Date().toISOString();
  const portalId = store.createNode({
    chatId,
    parentId: null,
    kind: "portal",
    title,
    content: { mode: "static", widget: { type: "text", text: title } },
    provenance: { createdAt: now, updatedAt: now },
    position: { x: nearPosition.x, y: nearPosition.y - CARD_HEIGHT_ESTIMATE - V_GAP },
    portalTarget: target,
  });
  store.logPrompt(chatId, {
    id: nanoid(),
    createdAt: now,
    mode: "fork",
    prompt: title,
    canvasNodeId: portalId,
    inputNodeIds: [],
    outputNodeIds: [portalId],
  });
  return portalId;
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
        // inputNodeIds is intentionally [] here: nodeId lives in the OLD
        // chat, and edges/PromptLogEntry.inputNodeIds only make sense within
        // a single chat's node set. The actual visible/navigable link
        // between the two walls is the portal pair below.
        placePromptNode({ chatId: newChatId, prompt: forkPrompt, mode: "fork", anchorPosition: forkAnchor, inputNodeIds: [], outputNodeIds: forkNodeIds });

        // Bidirectional portal nodes so the fork relationship is visible and
        // navigable from both walls, rather than a same-canvas edge pointing
        // at coordinates that mean nothing in the other chat.
        const newRootId = forkNodeIds[0];
        const derivedTitle = deriveChatTitle(response);
        if (newRootId) {
          const newRoot = useGraphStore.getState().nodes[newRootId];
          placePortalNode({
            chatId: node.chatId,
            title: `Forked → ${derivedTitle ?? newRoot?.title ?? node.title}`,
            nearPosition: node.position,
            target: { chatId: newChatId, nodeId: newRootId },
          });
          if (newRoot) {
            placePortalNode({
              chatId: newChatId,
              title: `Forked from → ${node.title}`,
              nearPosition: newRoot.position,
              target: { chatId: node.chatId, nodeId: node.id },
            });
          }
        }

        onNodesCreated?.(newChatId, forkNodeIds);
        if (derivedTitle) useGraphStore.getState().renameChat(newChatId, derivedTitle);
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

  // regenerateStaleChildren (defined below) needs to be called from inside
  // recomputeNode's toast action, but also itself calls recomputeNode —
  // a genuine mutual reference. A ref breaks the cycle without forcing
  // recomputeNode to depend on regenerateStaleChildren's identity (which
  // would either be a TDZ error at declaration time, since regenerateStaleChildren
  // isn't declared yet at that point, or force both callbacks to be
  // recreated on every render).
  const regenerateStaleChildrenRef = useRef<(nodeId: string) => Promise<void>>(async () => {});

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
                : spec.render === "markdown"
                  ? { mode: "markdown", markdown: spec.markdown }
                  : { mode: "lua", lua: spec.lua };
          useGraphStore.getState().updateNodeContent(nodeId, content);
          if (spec.summary) useGraphStore.getState().updateNode(nodeId, { summary: spec.summary });
        }

        // Recompute mutates the existing node in place — it does NOT create
        // a new node, so unlike every other action, its "output" is empty.
        // Critically, outputNodeIds must NOT include nodeId itself:
        // revertToPrompt deletes every id in outputNodeIds (plus the prompt
        // bubble) for every entry after the revert target, so listing the
        // recomputed node as its own "output" would make reverting to an
        // earlier prompt delete this node (and its whole subtree) rather
        // than just leaving its content as-is. inputNodeIds still records
        // nodeId for history/highlighting purposes — that side is read-only.
        placePromptNode({
          chatId: node.chatId,
          prompt: changeDescription,
          mode: "recompute",
          anchorPosition: node.position,
          inputNodeIds: [nodeId],
          outputNodeIds: [],
        });

        // Anything downstream of this node (tree children and prompt-graph
        // outputs, transitively) was generated from context that just
        // changed underneath it — flag the whole downstream chain so the
        // user can see what may now be inconsistent, and offer to refresh
        // just the immediate children.
        const { nodes: allNodes, edges: allEdgesRec } = useGraphStore.getState();
        const edgesInChat = Object.values(allEdgesRec).filter((e) => e.chatId === node.chatId);
        const downstream = getAllDownstreamDependents(nodeId, allNodes, edgesInChat);
        if (downstream.size > 0) {
          useGraphStore.getState().markNodesStale([...downstream]);
          const directChildren = getDirectDependents(nodeId, allNodes, edgesInChat);
          toast.push(
            `${downstream.size} downstream node${downstream.size > 1 ? "s" : ""} may be out of date.`,
            "warning",
            directChildren.length > 0
              ? {
                  label: "Regenerate affected",
                  onClick: () => void regenerateStaleChildrenRef.current(nodeId),
                }
              : undefined,
          );
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

  /** Re-runs recomputeNode on every direct dependent of `nodeId` (its tree
   *  children plus any node a prompt produced using it as input), using a
   *  standard "context changed" instruction rather than a user-typed one.
   *  Does not cascade further — grandchildren are left stale until the user
   *  acts on their own parent in turn, to avoid an unbounded chain of LLM
   *  calls firing from a single recompute. */
  const regenerateStaleChildren = useCallback(
    async (nodeId: string) => {
      const { nodes: allNodes, edges: allEdgesReg } = useGraphStore.getState();
      const node = allNodes[nodeId];
      if (!node) return;
      const edgesInChat = Object.values(allEdgesReg).filter((e) => e.chatId === node.chatId);
      const directChildren = getDirectDependents(nodeId, allNodes, edgesInChat);
      for (const childId of directChildren) {
        await recomputeNode(childId, STALE_REFRESH_INSTRUCTION);
      }
    },
    [recomputeNode],
  );
  regenerateStaleChildrenRef.current = regenerateStaleChildren;

  return {
    busyNodeIds,
    busyChat,
    createRoot,
    expandNode,
    forkNode,
    multiSelectAction,
    recomputeNode,
    regenerateStaleChildren,
    cancelGeneration,
  };
}

export type { RelationType };
