/**
 * serialize.ts — compress/decompress a full wall (Chat + its nodes + edges)
 * into a single gzipped JSON blob for P2P transfer or file export.
 */

import type { Chat, GraphNode, GraphEdge } from "../../types/graph";

export interface WallPayload {
  version: 1;
  chat: Chat;
  nodes: GraphNode[];
  edges: GraphEdge[];
  exportedAt: string;
}

export async function serializeWall(
  chat: Chat,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<Uint8Array> {
  const payload: WallPayload = {
    version: 1,
    chat,
    nodes,
    edges,
    exportedAt: new Date().toISOString(),
  };
  const json = JSON.stringify(payload);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer() as ArrayBuffer;
  return new Uint8Array(buf);
}

export async function deserializeWall(data: Uint8Array): Promise<WallPayload> {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text) as WallPayload;
}
