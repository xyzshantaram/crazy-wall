/**
 * Decision matrix widget: a 2x2 (or general scatter) plot with quadrant
 * gridlines. Used for tradeoff/decision visualizations (e.g. impact vs effort).
 */

import type { WidgetNode } from "../../types/widget";

type MatrixNode = Extract<WidgetNode, { type: "matrix" }>;

const VARIANT_COLOR: Record<string, string> = {
  accent: "#7c6cff",
  success: "#3ddc97",
  warning: "#f5b95a",
  danger: "#ff6b6b",
  muted: "#5b6178",
};

export function Matrix({ node }: { node: MatrixNode }) {
  const size = 200;
  const pad = 16;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="relative" style={{ width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size} className="absolute inset-0">
          {/* quadrant gridlines */}
          <line x1={pad} y1={size / 2} x2={size - pad} y2={size / 2} stroke="var(--color-border)" strokeWidth="1" />
          <line x1={size / 2} y1={pad} x2={size / 2} y2={size - pad} stroke="var(--color-border)" strokeWidth="1" />
          <rect x={pad} y={pad} width={size - pad * 2} height={size - pad * 2} fill="none" stroke="var(--color-border)" strokeWidth="1" rx="6" />
          {node.items.map((item, i) => {
            const x = pad + item.x * (size - pad * 2);
            const y = size - pad - item.y * (size - pad * 2);
            const color = item.variant ? VARIANT_COLOR[item.variant] : "#7c6cff";
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="5" fill={color} opacity={0.9} />
                <circle cx={x} cy={y} r="9" fill={color} opacity={0.15} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex justify-center text-[10px] text-ink-faint px-1 gap-1">
        <span className="text-ink-faint/70">y: {node.y_label}</span>
        <span>·</span>
        <span className="text-ink-faint/70">x: {node.x_label}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {node.items.map((item, i) => (
          <span key={i} className="flex items-center gap-1 text-[11px] text-ink-dim">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: item.variant ? VARIANT_COLOR[item.variant] : "#7c6cff" }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
