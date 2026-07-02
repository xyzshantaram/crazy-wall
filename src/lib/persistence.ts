/**
 * IndexedDB persistence for the semantic graph.
 *
 * We persist chats, nodes, and edges. We deliberately do NOT persist Lua
 * source beyond a "last generated script" cache on the node itself (already
 * part of NodeContent) -- there's no separate Lua table. Regeneration on load
 * re-runs the cached script rather than re-calling the LLM, unless the user
 * asks to regenerate.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Chat, GraphEdge, GraphNode } from "../types/graph";

const DB_NAME = "canvas-app";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("chats")) {
          db.createObjectStore("chats", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("nodes")) {
          const store = db.createObjectStore("nodes", { keyPath: "id" });
          store.createIndex("chatId", "chatId");
        }
        if (!db.objectStoreNames.contains("edges")) {
          const store = db.createObjectStore("edges", { keyPath: "id" });
          store.createIndex("chatId", "chatId");
        }
      },
    });
  }
  return dbPromise;
}

export async function loadAll(): Promise<{ chats: Chat[]; nodes: GraphNode[]; edges: GraphEdge[] }> {
  const db = await getDb();
  const [chats, nodes, edges] = await Promise.all([
    db.getAll("chats"),
    db.getAll("nodes"),
    db.getAll("edges"),
  ]);
  return { chats, nodes, edges };
}

export async function putChat(chat: Chat): Promise<void> {
  const db = await getDb();
  await db.put("chats", chat);
}

export async function deleteChat(chatId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["chats", "nodes", "edges"], "readwrite");
  await tx.objectStore("chats").delete(chatId);
  const nodeIdx = tx.objectStore("nodes").index("chatId");
  for await (const cursor of nodeIdx.iterate(chatId)) {
    cursor.delete();
  }
  const edgeIdx = tx.objectStore("edges").index("chatId");
  for await (const cursor of edgeIdx.iterate(chatId)) {
    cursor.delete();
  }
  await tx.done;
}

export async function putNode(node: GraphNode): Promise<void> {
  const db = await getDb();
  await db.put("nodes", node);
}

export async function putNodes(nodes: GraphNode[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("nodes", "readwrite");
  for (const n of nodes) tx.store.put(n);
  await tx.done;
}

export async function deleteNode(nodeId: string): Promise<void> {
  const db = await getDb();
  await db.delete("nodes", nodeId);
}

export async function putEdge(edge: GraphEdge): Promise<void> {
  const db = await getDb();
  await db.put("edges", edge);
}

export async function putEdges(edges: GraphEdge[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("edges", "readwrite");
  for (const e of edges) tx.store.put(e);
  await tx.done;
}

export async function deleteEdge(edgeId: string): Promise<void> {
  const db = await getDb();
  await db.delete("edges", edgeId);
}
