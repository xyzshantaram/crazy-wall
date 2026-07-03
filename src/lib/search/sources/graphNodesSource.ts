/**
 * "graph-nodes" search source — indexes every node across every wall in the
 * local graph store. Registered once at app startup (see App.tsx).
 *
 * `ref` carries { chatId, nodeId } so the palette can navigate straight to
 * the node (switch wall if needed, frame the node in viewport, select it).
 */

import { useGraphStore } from "../../../stores/graphStore";
import { extractNodeBodyText } from "../../graph/nodeText";
import type { SearchDocument, SearchSource } from "../types";

export interface GraphNodeRef {
  chatId: string;
  nodeId: string;
}

export const graphNodesSearchSource: SearchSource = {
  id: "graph-nodes",
  label: "Nodes",
  getDocuments(): SearchDocument[] {
    const { nodes } = useGraphStore.getState();
    return Object.values(nodes).map((node) => ({
      id: `node:${node.id}`,
      sourceId: "graph-nodes",
      title: node.title,
      body: [node.summary ?? "", extractNodeBodyText(node)].filter(Boolean).join(" "),
      chatId: node.chatId,
      ref: { chatId: node.chatId, nodeId: node.id } as GraphNodeRef,
    }));
  },
};
