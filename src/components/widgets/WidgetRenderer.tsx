/**
 * WidgetRenderer — turns a WidgetNode tree into React elements.
 *
 * This is the single rendering surface for BOTH static widget JSON (returned
 * directly by the LLM) and the TileOutput trees produced by Lua tiles running
 * in the nostr-canvas sandbox (see lib/lua/luaRuntime.ts) -- the two are
 * structurally compatible by design (see types/widget.ts).
 */

import { useState } from "react";
import type { WidgetNode, WidgetActionPayload } from "../../types/widget";
import { Chart } from "./Chart";
import { Matrix } from "./Matrix";
import { TreeView } from "./TreeView";

export type WidgetActionHandler = (handler: string, payload: WidgetActionPayload) => void;

interface RendererProps {
  node: WidgetNode;
  onAction: WidgetActionHandler;
  /** depth used only for default key fallback, not layout */
  keyPrefix?: string;
}

const GAP_CLASS: Record<string, string> = { sm: "gap-1.5", md: "gap-3", lg: "gap-5" };
const ALIGN_CLASS: Record<string, string> = { start: "items-start", center: "items-center", end: "items-end" };
const JUSTIFY_CLASS: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};
const VARIANT_TEXT: Record<string, string> = {
  accent: "text-accent",
  muted: "text-ink-faint",
  success: "text-good",
  warning: "text-warn",
  danger: "text-bad",
};
const VARIANT_BG: Record<string, string> = {
  accent: "bg-accent/15 text-accent",
  muted: "bg-white/5 text-ink-dim",
  success: "bg-good/15 text-good",
  warning: "bg-warn/15 text-warn",
  danger: "bg-bad/15 text-bad",
};

function VariantDot({ variant }: { variant?: string }) {
  const cls =
    variant === "success"
      ? "bg-good"
      : variant === "warning"
        ? "bg-warn"
        : variant === "danger"
          ? "bg-bad"
          : variant === "accent"
            ? "bg-accent"
            : "bg-ink-faint";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} />;
}

export function WidgetRenderer({ node, onAction, keyPrefix = "w" }: RendererProps) {
  switch (node.type) {
    case "stack":
    case "row": {
      const isRow = node.type === "row";
      const children = node.children.map((child, i) => (
        <WidgetRenderer key={child.id ?? `${keyPrefix}-${i}`} node={child} onAction={onAction} keyPrefix={`${keyPrefix}-${i}`} />
      ));
      return (
        <div
          className={[
            "flex",
            isRow ? "flex-row" : "flex-col",
            "wrap" in node && node.wrap ? "flex-wrap" : "",
            GAP_CLASS[node.gap ?? "md"],
            node.align ? ALIGN_CLASS[node.align] : isRow ? "items-center" : "items-stretch",
            node.justify ? JUSTIFY_CLASS[node.justify] : "",
            node.surface ? "bg-surface-2/70 border border-border-soft rounded-xl p-3" : "",
            node.scroll ? "overflow-auto scroll-thin" : "",
            node.grow ? "flex-1" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      );
    }

    case "spoiler":
      return <SpoilerWidget node={node} onAction={onAction} keyPrefix={keyPrefix} />;

    case "text": {
      const sizeCls = node.text_size === 3 ? "text-lg" : node.text_size === 2 ? "text-[15px]" : "text-[13px]";
      const weightCls = node.style === "bold" ? "font-semibold" : node.style === "italic" ? "italic" : "";
      const colorCls = node.variant ? VARIANT_TEXT[node.variant] : "text-ink";
      if (node.badge) {
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
              node.variant ? VARIANT_BG[node.variant] : "bg-white/8 text-ink-dim"
            }`}
            title={node.title}
          >
            {node.text}
          </span>
        );
      }
      return (
        <span
          title={node.title}
          className={[sizeCls, weightCls, colorCls, node.truncate ? "truncate block" : ""].filter(Boolean).join(" ")}
          dangerouslySetInnerHTML={node.md ? { __html: renderInlineMd(node.text) } : undefined}
        >
          {node.md ? undefined : node.text}
        </span>
      );
    }

    case "markdown":
      return (
        <div
          className="text-[13px] leading-relaxed text-ink-dim [&_strong]:text-ink [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent-2 [&_a]:text-accent [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: renderBlockMd(node.content) }}
        />
      );

    case "image":
      return (
        <img
          src={node.url}
          style={{ maxWidth: node.max_width, maxHeight: node.max_height }}
          className={node.avatar ? "rounded-full object-cover aspect-square" : "rounded-lg object-cover max-w-full"}
        />
      );

    case "button": {
      const variantCls =
        node.variant === "primary"
          ? "bg-accent text-white hover:bg-accent/90"
          : node.variant === "danger"
            ? "bg-bad/15 text-bad hover:bg-bad/25"
            : "bg-white/6 text-ink-dim hover:bg-white/10 hover:text-ink";
      return (
        <button
          title={node.title}
          onClick={() => onAction(node.onclick, node.payload as WidgetActionPayload)}
          className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${variantCls}`}
        >
          {node.text}
        </button>
      );
    }

    case "divider":
      return <div className="h-px bg-border-soft w-full" />;

    case "color":
      return <div className="w-full h-8 rounded-lg border border-white/10" style={{ background: node.hex }} />;

    case "form":
      return (
        <FormWidget node={node} onAction={onAction} keyPrefix={keyPrefix} />
      );

    case "input":
      return null; // rendered inside FormWidget's field map for standalone safety; forms handle their own inputs

    case "dropdown":
      return null;

    case "checkbox":
      return null;

    case "table":
      return <TableWidget node={node} />;

    case "timeline":
      return <TimelineWidget node={node} />;

    case "kanban":
      return <KanbanWidget node={node} />;

    case "chart":
      return <Chart node={node} />;

    case "checklist":
      return <ChecklistWidget node={node} onAction={onAction} />;

    case "matrix":
      return <Matrix node={node} />;

    case "tree":
      return <TreeView root={node.root} />;

    case "stat":
      return <StatWidget node={node} />;

    case "slider":
      return <SliderWidget node={node} onAction={onAction} />;

    case "progress":
      return <ProgressWidget node={node} />;

    case "badge_group":
      return (
        <div className="flex flex-wrap gap-1.5">
          {node.items.map((it, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                it.variant ? VARIANT_BG[it.variant] : "bg-white/8 text-ink-dim"
              }`}
            >
              {it.label}
            </span>
          ))}
        </div>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

function SpoilerWidget({
  node,
  onAction,
  keyPrefix,
}: {
  node: Extract<WidgetNode, { type: "spoiler" }>;
  onAction: WidgetActionHandler;
  keyPrefix: string;
}) {
  const [open, setOpen] = useState(node.open ?? false);
  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-ink-dim hover:text-ink transition-colors w-full"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
        >
          <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {node.title}
      </button>
      {open && (
        <div className="mt-2 pl-3 border-l border-border-soft">
          <div className="flex flex-col gap-2">
            {node.children.map((child, i) => (
              <WidgetRenderer key={child.id ?? i} node={child} onAction={onAction} keyPrefix={`${keyPrefix}-s${i}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatWidget({ node }: { node: Extract<WidgetNode, { type: "stat" }> }) {
  const color = node.variant ? VARIANT_TEXT[node.variant] : "text-ink";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-faint font-medium">{node.label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-semibold ${color}`}>{node.value}</span>
        {node.delta && <span className="text-[12px] text-ink-faint">{node.delta}</span>}
      </div>
    </div>
  );
}

function ProgressWidget({ node }: { node: Extract<WidgetNode, { type: "progress" }> }) {
  const max = node.max ?? 100;
  const pct = Math.max(0, Math.min(100, (node.value / max) * 100));
  const barColor =
    node.variant === "success" ? "bg-good" : node.variant === "warning" ? "bg-warn" : node.variant === "danger" ? "bg-bad" : "bg-accent";
  return (
    <div className="flex flex-col gap-1 w-full">
      {node.label && (
        <div className="flex justify-between text-[12px] text-ink-dim">
          <span>{node.label}</span>
          <span className="text-ink-faint">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden w-full">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TableWidget({ node }: { node: Extract<WidgetNode, { type: "table" }> }) {
  return (
    <div className="w-full overflow-auto scroll-thin">
      {node.caption && <div className="text-[11px] text-ink-faint mb-1.5">{node.caption}</div>}
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr>
            {node.columns.map((c, i) => (
              <th key={i} className="text-left font-medium text-ink-faint uppercase tracking-wide text-[10.5px] px-2.5 py-1.5 border-b border-border-soft">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {node.rows.map((row, ri) => (
            <tr key={ri} className={ri === node.highlight_row ? "bg-accent/8" : ri % 2 === 1 ? "bg-white/[0.02]" : ""}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2.5 py-1.5 text-ink-dim border-b border-border-soft/50">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineWidget({ node }: { node: Extract<WidgetNode, { type: "timeline" }> }) {
  return (
    <div className="flex flex-col gap-0 w-full">
      {node.items.map((item, i) => (
        <div key={i} className="flex gap-3 relative">
          <div className="flex flex-col items-center pt-1">
            <VariantDot variant={item.variant} />
            {i < node.items.length - 1 && <div className="w-px flex-1 bg-border-soft mt-1" />}
          </div>
          <div className="pb-4 min-w-0">
            <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-medium">{item.date}</div>
            <div className="text-[13px] text-ink font-medium">{item.label}</div>
            {item.description && <div className="text-[12px] text-ink-dim mt-0.5">{item.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function KanbanWidget({ node }: { node: Extract<WidgetNode, { type: "kanban" }> }) {
  return (
    <div className="flex gap-3 w-full overflow-auto scroll-thin">
      {node.columns.map((col, ci) => (
        <div key={ci} className="flex-1 min-w-[140px] flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium px-1">
            {col.title} <span className="text-ink-faint/60">({col.items.length})</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {col.items.map((it, ii) => (
              <div key={ii} className="bg-surface-3 border border-border-soft rounded-lg px-2.5 py-2 text-[12.5px] text-ink-dim">
                <div className="text-ink">{it.title}</div>
                {it.tag && (
                  <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] ${it.variant ? VARIANT_BG[it.variant] : "bg-white/6 text-ink-faint"}`}>
                    {it.tag}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChecklistWidget({
  node,
  onAction,
}: {
  node: Extract<WidgetNode, { type: "checklist" }>;
  onAction: WidgetActionHandler;
}) {
  const [items, setItems] = useState(node.items);
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {items.map((item, i) => (
        <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => {
              const next = items.map((it, ii) => (ii === i ? { ...it, done: !it.done } : it));
              setItems(next);
              if (node.onchange) onAction(node.onchange, { id: item.id, done: !item.done });
            }}
            className="w-3.5 h-3.5 rounded accent-[#7c6cff] bg-surface-3"
          />
          <span className={`text-[13px] ${item.done ? "text-ink-faint line-through" : "text-ink-dim group-hover:text-ink"}`}>
            {item.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function SliderWidget({
  node,
  onAction,
}: {
  node: Extract<WidgetNode, { type: "slider" }>;
  onAction: WidgetActionHandler;
}) {
  const [value, setValue] = useState(node.value);
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {node.label && (
        <div className="flex justify-between text-[12px] text-ink-dim">
          <span>{node.label}</span>
          <span className="text-ink font-medium">
            {node.unit === "$" ? "$" : ""}
            {value.toLocaleString()}
            {node.unit && node.unit !== "$" ? node.unit : ""}
          </span>
        </div>
      )}
      <input
        type="range"
        min={node.min}
        max={node.max}
        step={node.step ?? 1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={() => {
          if (node.onchange) onAction(node.onchange, { name: node.name, value });
        }}
        className="w-full h-1.5 accent-[#7c6cff] cursor-pointer"
      />
    </div>
  );
}

function FormWidget({
  node,
  onAction,
  keyPrefix,
}: {
  node: Extract<WidgetNode, { type: "form" }>;
  onAction: WidgetActionHandler;
  keyPrefix: string;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const child of node.children) {
      if (child.type === "input") initial[child.name] = child.default_value ?? "";
      if (child.type === "dropdown") initial[child.name] = child.default_value ?? child.options[0]?.value ?? "";
      if (child.type === "checkbox") initial[child.name] = child.default_value ?? false;
    }
    return initial;
  });

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {node.children.map((child, i) => {
        if (child.type === "input") {
          return (
            <label key={i} className="flex flex-col gap-1">
              {child.label && <span className="text-[12px] text-ink-faint">{child.label}</span>}
              <input
                type={child.hidden ? "password" : "text"}
                placeholder={child.placeholder}
                value={(values[child.name] as string) ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [child.name]: e.target.value }))}
                className="bg-surface-3 border border-border-soft rounded-lg px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-accent/50"
              />
            </label>
          );
        }
        if (child.type === "dropdown") {
          return (
            <label key={i} className="flex flex-col gap-1">
              {child.label && <span className="text-[12px] text-ink-faint">{child.label}</span>}
              <select
                value={(values[child.name] as string) ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [child.name]: e.target.value }))}
                className="bg-surface-3 border border-border-soft rounded-lg px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-accent/50"
              >
                {child.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (child.type === "checkbox") {
          return (
            <label key={i} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(values[child.name] as boolean) ?? false}
                onChange={(e) => setValues((v) => ({ ...v, [child.name]: e.target.checked }))}
                className="w-3.5 h-3.5 rounded accent-[#7c6cff]"
              />
              <span className="text-[13px] text-ink-dim">{child.label}</span>
            </label>
          );
        }
        if (child.type === "button") {
          return (
            <div key={i}>
              <WidgetRenderer
                node={child}
                onAction={(handler, payload) => {
                  if (child.submit_form) {
                    onAction(handler, { ...values, ...(payload as object) });
                  } else {
                    onAction(handler, payload);
                  }
                }}
                keyPrefix={`${keyPrefix}-btn${i}`}
              />
            </div>
          );
        }
        return <WidgetRenderer key={i} node={child} onAction={onAction} keyPrefix={`${keyPrefix}-f${i}`} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal markdown (inline + block) -- intentionally tiny, sanitized subset.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInlineMd(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function renderBlockMd(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMd(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#+/)![0].length;
      html.push(`<h${level + 2}>${renderInlineMd(trimmed.replace(/^#+\s+/, ""))}</h${level + 2}>`);
    } else if (trimmed) {
      html.push(`<p>${renderInlineMd(trimmed)}</p>`);
    }
  }
  if (inList) html.push("</ul>");
  return html.join("");
}
