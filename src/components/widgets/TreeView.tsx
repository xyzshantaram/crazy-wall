/**
 * Generic hierarchy tree display (e.g. a file tree, org chart, taxonomy).
 * NOT the conversation/canvas graph itself -- this is a widget for showing
 * hierarchical data _inside_ a single node's content.
 */

import { useState } from "react";
import type { TreeItem } from "../../types/widget";

const VARIANT_COLOR: Record<string, string> = {
  accent: "text-accent",
  success: "text-good",
  warning: "text-warn",
  danger: "text-bad",
  muted: "text-ink-faint",
};

function TreeNode({ item, depth }: { item: TreeItem; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = Boolean(item.children && item.children.length > 0);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 cursor-default select-none"
        style={{ paddingLeft: depth * 14 }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren ? (
          <svg
            width="8"
            height="8"
            viewBox="0 0 10 10"
            className={`transition-transform text-ink-faint cursor-pointer flex-shrink-0 ${open ? "rotate-90" : ""}`}
            fill="none"
          >
            <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="w-2 flex-shrink-0" />
        )}
        {item.icon && <span className="text-[12px] flex-shrink-0">{item.icon}</span>}
        <span className={`text-[12.5px] truncate ${item.variant ? VARIANT_COLOR[item.variant] : "text-ink-dim"}`}>
          {item.label}
        </span>
      </div>
      {open && hasChildren && (
        <div>
          {item.children!.map((child, i) => (
            <TreeNode key={i} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({ root }: { root: TreeItem }) {
  return (
    <div className="w-full font-mono">
      <TreeNode item={root} depth={0} />
    </div>
  );
}
