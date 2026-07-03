/**
 * Shared plain-text extraction from a GraphNode's content — used by NodePeek
 * (content preview) and the full-text search index (indexable body text).
 */

import type { GraphNode } from "../../types/graph";
import type { TreeItem, WidgetNode } from "../../types/widget";

function extractWidgetText(w: WidgetNode, depth = 0): string {
  if (depth > 4) return "";
  switch (w.type) {
    case "text": return w.text;
    case "markdown": return w.content;
    case "stack":
    case "row":
      return w.children.map((c) => extractWidgetText(c, depth + 1)).filter(Boolean).join(" · ");
    case "spoiler":
      return `${w.title} ${w.children.map((c) => extractWidgetText(c, depth + 1)).filter(Boolean).join(" · ")}`;
    case "table":
      return w.columns.join(", ") + " " + w.rows.map((r) => r.join(", ")).join(" ");
    case "timeline":
      return w.items.map((i) => `${i.date}: ${i.label} ${i.description ?? ""}`).join(" · ");
    case "kanban":
      return w.columns.map((c) => `${c.title} ${c.items.map((it) => it.title).join(", ")}`).join(" · ");
    case "checklist":
      return w.items.map((i) => i.label).join(" · ");
    case "stat":
      return `${w.label} ${w.value} ${w.delta ?? ""}`;
    case "badge_group":
      return w.items.map((i) => i.label).join(", ");
    case "chart":
      return w.data.map((d) => `${d.label} ${d.value}`).join(", ");
    case "tree":
      return flattenTree(w.root);
    case "progress":
      return `${w.label ?? ""} ${w.value}${w.max ? `/${w.max}` : "%"}`.trim();
    default:
      return "";
  }
}

function flattenTree(item: TreeItem): string {
  const kids = item.children?.map(flattenTree).join(" · ") ?? "";
  return kids ? `${item.label} · ${kids}` : item.label;
}

/** Full plain-text extraction of a node's content, unbounded (for indexing). */
export function extractNodeBodyText(node: GraphNode): string {
  const { content } = node;
  if (content.mode === "markdown" && content.markdown) {
    return content.markdown.replace(/[#*`_[\]]/g, " ");
  }
  if (content.mode === "lua") return "";
  if (content.mode === "nostr-dashboard") return "";
  if (content.widget) return extractWidgetText(content.widget);
  return "";
}

/** Short preview (bounded length) for UI display — NodePeek, search results, etc. */
export function extractNodePreview(node: GraphNode, maxLen = 200): string {
  const { content } = node;
  if (content.mode === "markdown" && content.markdown) {
    return content.markdown.replace(/[#*`_[\]]/g, "").slice(0, maxLen).trim();
  }
  if (content.mode === "lua") return "Interactive widget (tap to view)";
  if (content.mode === "nostr-dashboard") return "Live Nostr dashboard (tap to view)";
  if (content.widget) {
    const text = extractWidgetText(content.widget);
    return text.slice(0, maxLen) || "(no preview)";
  }
  return "";
}
