/**
 * Minimal, dependency-free SVG charts: bar / line / pie / donut.
 * Not a general-purpose charting library -- just enough to render the
 * `chart` widget node cleanly for small datasets typical of a canvas card.
 */

import type { WidgetNode } from "../../types/widget";

type ChartNode = Extract<WidgetNode, { type: "chart" }>;

const PALETTE = ["#7c6cff", "#4ee1d6", "#f5b95a", "#ff6b6b", "#3ddc97", "#9aa1b5", "#c084fc", "#60a5fa"];

export function Chart({ node }: { node: ChartNode }) {
  const { chart_type, data, caption, unit } = node;
  if (data.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 w-full">
      {chart_type === "bar" && <BarChart data={data} unit={unit} />}
      {chart_type === "line" && <LineChart data={data} unit={unit} />}
      {(chart_type === "pie" || chart_type === "donut") && <PieChart data={data} donut={chart_type === "donut"} unit={unit} />}
      {caption && <div className="text-[11px] text-ink-faint text-center">{caption}</div>}
    </div>
  );
}

function BarChart({ data, unit }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-28 w-full px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0">
          <span className="text-[10.5px] text-ink-dim font-medium truncate w-full text-center">
            {d.value}
            {unit && unit !== "$" ? unit : ""}
          </span>
          <div
            className="w-full rounded-md transition-all"
            style={{
              height: `${Math.max(4, (d.value / max) * 100)}%`,
              background: PALETTE[i % PALETTE.length],
              opacity: 0.85,
            }}
          />
          <span className="text-[10px] text-ink-faint truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, unit }: { data: { label: string; value: number }[]; unit?: string }) {
  const w = 280;
  const h = 100;
  const pad = 8;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const step = (w - pad * 2) / Math.max(1, data.length - 1);

  const points = data.map((d, i) => {
    const x = pad + i * step;
    const y = h - pad - ((d.value - min) / range) * (h - pad * 2);
    return { x, y, ...d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD = `${pathD} L${points[points.length - 1].x},${h - pad} L${points[0].x},${h - pad} Z`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c6cff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7c6cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#lineFill)" />
        <path d={pathD} fill="none" stroke="#7c6cff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#7c6cff" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-ink-faint px-1 -mt-1">
        {data.map((d, i) => (
          <span key={i} className="truncate">
            {d.label}
          </span>
        ))}
      </div>
      {unit && <div className="text-[10px] text-ink-faint text-right pr-1">unit: {unit}</div>}
    </div>
  );
}

function PieChart({
  data,
  donut,
  unit,
}: {
  data: { label: string; value: number }[];
  donut: boolean;
  unit?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 42;
  const cx = 50;
  const cy = 50;
  let angleStart = -90;

  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 360;
    const angleEnd = angleStart + angle;
    const largeArc = angle > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos((angleStart * Math.PI) / 180);
    const y1 = cy + r * Math.sin((angleStart * Math.PI) / 180);
    const x2 = cx + r * Math.cos((angleEnd * Math.PI) / 180);
    const y2 = cy + r * Math.sin((angleEnd * Math.PI) / 180);
    const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
    angleStart = angleEnd;
    return { path, color: PALETTE[i % PALETTE.length], ...d };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 flex-shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} opacity={0.88} />
        ))}
        {donut && <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--color-surface-2)" />}
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11.5px] min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-ink-dim truncate">{d.label}</span>
            <span className="text-ink-faint flex-shrink-0">
              {unit === "$" ? "$" : ""}
              {d.value}
              {unit && unit !== "$" ? unit : ""} ({Math.round((d.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
