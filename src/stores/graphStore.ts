/**
 * The graph store — zustand store wrapping the semantic graph (chats, nodes,
 * edges). This is the single source of truth the canvas renders from.
 *
 * Every mutation here also fires an IndexedDB write (fire-and-forget) so the
 * UI never blocks on persistence.
 */

import { create } from "zustand";
import { nanoid } from "nanoid";
import type { AppState, Chat, GraphEdge, GraphNode, RelationType, Viewport, PromptLogEntry } from "../types/graph";
import type { WidgetNode } from "../types/widget";
import type { WallPayload } from "../lib/export/serialize";
import * as db from "../lib/persistence";
import { PROVIDERS, type ProviderId } from "../lib/providers/registry";

interface GraphState extends AppState {
  hydrated: boolean;
  activeChatId: string | null;

  hydrate: () => Promise<void>;

  createChat: (opts?: { provider?: ProviderId; model?: string }) => string;
  setActiveChat: (chatId: string | null) => void;
  renameChat: (chatId: string, title: string) => void;
  deleteChat: (chatId: string) => void;
  markChatStarted: (chatId: string) => void;
  setChatProviderModel: (chatId: string, provider: ProviderId, model: string) => void;
  setViewport: (chatId: string, viewport: Viewport) => void;

  addBookmark: (chatId: string, label: string) => void;
  removeBookmark: (chatId: string, bookmarkId: string) => void;
  logPrompt: (chatId: string, entry: PromptLogEntry) => void;
  /** Delete all nodes created by prompts after entryIndex, then trim the log to entryIndex+1. */
  revertToPrompt: (chatId: string, entryIndex: number) => void;

  /** Create a node directly (used by the LLM-application layer). */
  createNode: (node: Omit<GraphNode, "id" | "childIds"> & { id?: string }) => string;
  updateNode: (nodeId: string, patch: Partial<GraphNode>) => void;
  updateNodeContent: (nodeId: string, content: GraphNode["content"]) => void;
  /** Flags each node id as stale (context it depended on has changed since
   *  it was generated). No-op for ids that don't exist or are already stale. */
  markNodesStale: (nodeIds: string[]) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  moveNodes: (deltas: Record<string, { dx: number; dy: number }>) => void;
  setNodeSize: (nodeId: string, size: { w: number; h: number }) => void;
  toggleCollapsed: (nodeId: string) => void;
  togglePinned: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  setNodeGenerating: (nodeId: string, generating: boolean) => void;

  createEdge: (edge: Omit<GraphEdge, "id">) => string;
  deleteEdge: (edgeId: string) => void;

  duplicateNode: (nodeId: string) => string | null;

  /** Import a full wall payload received via P2P transfer. Merges into existing store. */
  importWall: (payload: WallPayload) => void;
}

function nowIso() {
  return new Date().toISOString();
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  chats: {},
  nodes: {},
  edges: {},
  chatOrder: [],
  hydrated: false,
  activeChatId: null,

  hydrate: async () => {
    const { chats, nodes, edges } = await db.loadAll();
    const chatsMap: Record<string, Chat> = {};
    const chatOrder: string[] = [];
    for (const c of chats.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))) {
      chatsMap[c.id] = c;
      chatOrder.push(c.id);
    }
    const nodesMap: Record<string, GraphNode> = {};
    for (const n of nodes) nodesMap[n.id] = n;
    const edgesMap: Record<string, GraphEdge> = {};
    for (const e of edges) edgesMap[e.id] = e;

    set({
      chats: chatsMap,
      nodes: nodesMap,
      edges: edgesMap,
      chatOrder,
      hydrated: true,
      activeChatId: chatOrder[0] ?? null,
    });
  },

  createChat: (opts) => {
    const id = nanoid();
    const provider = opts?.provider ?? "openrouter";
    const model = opts?.model ?? PROVIDERS[provider].defaultModel;
    const chat: Chat = {
      id,
      title: "New Wall",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      provider,
      model,
      rootNodeIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      started: false,
    };
    set((s) => ({
      chats: { ...s.chats, [id]: chat },
      chatOrder: [id, ...s.chatOrder],
      activeChatId: id,
    }));
    void db.putChat(chat);
    return id;
  },

  setActiveChat: (chatId) => set({ activeChatId: chatId }),

  renameChat: (chatId, title) => {
    set((s) => {
      const chat = s.chats[chatId];
      if (!chat) return s;
      const updated = { ...chat, title, updatedAt: nowIso() };
      void db.putChat(updated);
      return { chats: { ...s.chats, [chatId]: updated } };
    });
  },

  deleteChat: (chatId) => {
    set((s) => {
      const { [chatId]: _removed, ...restChats } = s.chats;
      const nodeIds = Object.values(s.nodes)
        .filter((n) => n.chatId === chatId)
        .map((n) => n.id);
      const restNodes = { ...s.nodes };
      for (const id of nodeIds) delete restNodes[id];
      const edgeIds = Object.values(s.edges)
        .filter((e) => e.chatId === chatId)
        .map((e) => e.id);
      const restEdges = { ...s.edges };
      for (const id of edgeIds) delete restEdges[id];
      return {
        chats: restChats,
        nodes: restNodes,
        edges: restEdges,
        chatOrder: s.chatOrder.filter((id) => id !== chatId),
        activeChatId: s.activeChatId === chatId ? null : s.activeChatId,
      };
    });
    void db.deleteChat(chatId);
  },

  markChatStarted: (chatId) => {
    set((s) => {
      const chat = s.chats[chatId];
      if (!chat) return s;
      const updated = { ...chat, started: true, updatedAt: nowIso() };
      void db.putChat(updated);
      return { chats: { ...s.chats, [chatId]: updated } };
    });
  },

  setChatProviderModel: (chatId, provider, model) => {
    set((s) => {
      const chat = s.chats[chatId];
      if (!chat) return s;
      const updated = { ...chat, provider, model, updatedAt: nowIso() };
      void db.putChat(updated);
      return { chats: { ...s.chats, [chatId]: updated } };
    });
  },

  setViewport: (chatId, viewport) => {
    set((s) => {
      const chat = s.chats[chatId];
      if (!chat) return s;
      const updated = { ...chat, viewport };
      void db.putChat(updated);
      return { chats: { ...s.chats, [chatId]: updated } };
    });
  },

  addBookmark: (chatId, label) => {
    set((s) => {
      const chat = s.chats[chatId];
      if (!chat) return s;
      const bookmark = { id: nanoid(), label, viewport: chat.viewport };
      const updated = { ...chat, bookmarks: [...(chat.bookmarks ?? []), bookmark] };
      void db.putChat(updated);
      return { chats: { ...s.chats, [chatId]: updated } };
    });
  },

  removeBookmark: (chatId, bookmarkId) => {
    set((s) => {
      const chat = s.chats[chatId];
      if (!chat) return s;
      const updated = { ...chat, bookmarks: (chat.bookmarks ?? []).filter((b) => b.id !== bookmarkId) };
      void db.putChat(updated);
      return { chats: { ...s.chats, [chatId]: updated } };
    });
  },

  logPrompt: (chatId, entry) => {
    set((s) => {
      const chat = s.chats[chatId];
      if (!chat) return s;
      const updated = { ...chat, promptLog: [...(chat.promptLog ?? []), entry] };
      void db.putChat(updated);
      return { chats: { ...s.chats, [chatId]: updated } };
    });
  },

  revertToPrompt: (chatId, entryIndex) => {
    const state = get();
    const chat = state.chats[chatId];
    if (!chat) return;
    const log = chat.promptLog ?? [];
    // Collect all node ids to delete: entries after entryIndex (their outputs + canvas bubbles).
    const toDelete = new Set<string>();
    for (let i = entryIndex + 1; i < log.length; i++) {
      const e = log[i];
      e.outputNodeIds.forEach((id) => toDelete.add(id));
      toDelete.add(e.canvasNodeId);
    }
    // Use deleteNode for each (handles cascade + DB cleanup).
    // Call in a single store action to batch state updates.
    const store = get();
    for (const id of toDelete) {
      if (store.nodes[id]) store.deleteNode(id);
    }
    // Trim the prompt log.
    set((s) => {
      const c = s.chats[chatId];
      if (!c) return s;
      const trimmed = { ...c, promptLog: (c.promptLog ?? []).slice(0, entryIndex + 1) };
      void db.putChat(trimmed);
      return { chats: { ...s.chats, [chatId]: trimmed } };
    });
  },

  createNode: (nodeInput) => {
    const id = nodeInput.id ?? nanoid();
    const node: GraphNode = { ...nodeInput, id, childIds: [] };
    set((s) => {
      const nodes = { ...s.nodes, [id]: node };
      // wire into parent's childIds
      if (node.parentId && nodes[node.parentId]) {
        const parent = nodes[node.parentId];
        nodes[node.parentId] = { ...parent, childIds: [...parent.childIds, id] };
      }
      let chats = s.chats;
      if (!node.parentId) {
        const chat = s.chats[node.chatId];
        if (chat && !chat.rootNodeIds.includes(id)) {
          const updatedChat = { ...chat, rootNodeIds: [...chat.rootNodeIds, id], updatedAt: nowIso() };
          chats = { ...s.chats, [node.chatId]: updatedChat };
          void db.putChat(updatedChat);
        }
      }
      void db.putNode(node);
      if (node.parentId && nodes[node.parentId]) void db.putNode(nodes[node.parentId]);
      return { nodes, chats };
    });
    return id;
  },

  updateNode: (nodeId, patch) => {
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      const updated = { ...node, ...patch, provenance: { ...node.provenance, updatedAt: nowIso() } };
      void db.putNode(updated);
      return { nodes: { ...s.nodes, [nodeId]: updated } };
    });
  },

  updateNodeContent: (nodeId, content) => {
    // Recomputing a node resolves its own staleness even though it may
    // introduce staleness in its dependents (handled by the caller via
    // markNodesStale, since detecting dependents requires the edge graph).
    get().updateNode(nodeId, { content, generating: false, stale: false });
  },

  markNodesStale: (nodeIds) => {
    set((s) => {
      const nodes = { ...s.nodes };
      for (const id of nodeIds) {
        const node = nodes[id];
        if (!node || node.stale) continue;
        nodes[id] = { ...node, stale: true };
        void db.putNode(nodes[id]);
      }
      return { nodes };
    });
  },

  setNodePosition: (nodeId, position) => {
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      const updated = { ...node, position };
      void db.putNode(updated);
      return { nodes: { ...s.nodes, [nodeId]: updated } };
    });
  },

  moveNodes: (deltas) => {
    set((s) => {
      const updated: Record<string, GraphNode> = { ...s.nodes };
      for (const [id, { dx, dy }] of Object.entries(deltas)) {
        const node = updated[id];
        if (!node) continue;
        const moved = { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } };
        updated[id] = moved;
        void db.putNode(moved);
      }
      return { nodes: updated };
    });
  },

  setNodeSize: (nodeId, size) => {
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      const updated = { ...node, size };
      void db.putNode(updated);
      return { nodes: { ...s.nodes, [nodeId]: updated } };
    });
  },

  toggleCollapsed: (nodeId) => {
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      const updated = { ...node, collapsed: !node.collapsed };
      void db.putNode(updated);
      return { nodes: { ...s.nodes, [nodeId]: updated } };
    });
  },

  togglePinned: (nodeId) => {
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      const updated = { ...node, pinned: !node.pinned };
      void db.putNode(updated);
      return { nodes: { ...s.nodes, [nodeId]: updated } };
    });
  },

  deleteNode: (nodeId) => {
    set((s) => {
      // recursively collect descendant ids
      const toDelete = new Set<string>();
      const stack = [nodeId];
      while (stack.length) {
        const id = stack.pop()!;
        if (toDelete.has(id)) continue;
        toDelete.add(id);
        const n = s.nodes[id];
        if (n) stack.push(...n.childIds);
      }
      const nodes = { ...s.nodes };
      const node = nodes[nodeId];
      for (const id of toDelete) {
        delete nodes[id];
        void db.deleteNode(id);
      }
      // remove from parent's childIds
      if (node?.parentId && nodes[node.parentId]) {
        const parent = nodes[node.parentId];
        nodes[node.parentId] = { ...parent, childIds: parent.childIds.filter((c) => c !== nodeId) };
        void db.putNode(nodes[node.parentId]);
      }
      // remove from chat rootNodeIds if it was a root
      let chats = s.chats;
      if (node && !node.parentId) {
        const chat = s.chats[node.chatId];
        if (chat) {
          const updatedChat = { ...chat, rootNodeIds: chat.rootNodeIds.filter((id) => id !== nodeId) };
          chats = { ...s.chats, [node.chatId]: updatedChat };
          void db.putChat(updatedChat);
        }
      }
      // remove edges touching deleted nodes
      const edges = { ...s.edges };
      for (const [eid, e] of Object.entries(edges)) {
        if (toDelete.has(e.from) || toDelete.has(e.to)) {
          delete edges[eid];
          void db.deleteEdge(eid);
        }
      }
      return { nodes, chats, edges };
    });
  },

  setNodeGenerating: (nodeId, generating) => {
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      return { nodes: { ...s.nodes, [nodeId]: { ...node, generating } } };
    });
  },

  createEdge: (edgeInput) => {
    const id = nanoid();
    const edge: GraphEdge = { ...edgeInput, id };
    set((s) => ({ edges: { ...s.edges, [id]: edge } }));
    void db.putEdge(edge);
    return id;
  },

  deleteEdge: (edgeId) => {
    set((s) => {
      const { [edgeId]: _removed, ...rest } = s.edges;
      return { edges: rest };
    });
    void db.deleteEdge(edgeId);
  },

  duplicateNode: (nodeId) => {
    const node = get().nodes[nodeId];
    if (!node) return null;
    const id = nanoid();
    const clone: GraphNode = {
      ...node,
      id,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      childIds: [],
      provenance: { ...node.provenance, createdAt: nowIso(), updatedAt: nowIso(), forkedFrom: node.id },
    };
    set((s) => {
      const nodes = { ...s.nodes, [id]: clone };
      if (clone.parentId && nodes[clone.parentId]) {
        const parent = nodes[clone.parentId];
        nodes[clone.parentId] = { ...parent, childIds: [...parent.childIds, id] };
        void db.putNode(nodes[clone.parentId]);
      }
      let chats = s.chats;
      if (!clone.parentId) {
        const chat = s.chats[clone.chatId];
        if (chat) {
          const updatedChat = { ...chat, rootNodeIds: [...chat.rootNodeIds, id] };
          chats = { ...s.chats, [clone.chatId]: updatedChat };
          void db.putChat(updatedChat);
        }
      }
      void db.putNode(clone);
      return { nodes, chats };
    });
    return id;
  },

  importWall: (payload) => {
    set((s) => {
      const newChats = { ...s.chats };
      const newNodes = { ...s.nodes };
      const newEdges = { ...s.edges };
      let newOrder = [...s.chatOrder];

      // Upsert chat
      newChats[payload.chat.id] = payload.chat;
      if (!newOrder.includes(payload.chat.id)) {
        newOrder = [payload.chat.id, ...newOrder];
      }
      void db.putChat(payload.chat);

      // Upsert nodes
      for (const node of payload.nodes) {
        newNodes[node.id] = node;
        void db.putNode(node);
      }

      // Upsert edges
      for (const edge of payload.edges) {
        newEdges[edge.id] = edge;
        void db.putEdge(edge);
      }

      return {
        chats: newChats,
        nodes: newNodes,
        edges: newEdges,
        chatOrder: newOrder,
        activeChatId: payload.chat.id,
      };
    });
  },
}));

export type { RelationType };
export type { WidgetNode };
