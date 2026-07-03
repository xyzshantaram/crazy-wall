/**
 * ContextRingButton — small circular "context window usage" indicator for
 * the canvas toolbar. Filling ring (SVG stroke-dasharray) shows the last
 * turn's prompt_tokens as a % of the model's context window; color shifts
 * green → amber → red as it fills. Falls back to a plain outlined ring (no
 * fill) when the context length is unknown for the current model, since a
 * fill percentage would otherwise be fabricated from nothing.
 *
 * Always clickable regardless of whether a % is known — the modal itself
 * still has useful token/cost info even without a context-length figure.
 */

import { ToolbarButton } from "./CanvasToolbar";

interface Props {
  /** 0-100, or null when unknown (no completed turn yet, or context length
   *  unknown for this model). */
  percent: number | null;
  onClick: () => void;
}

const SIZE = 15;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ContextRingButton({ percent, onClick }: Props) {
  const pct = percent ?? 0;
  const dash = (pct / 100) * CIRCUMFERENCE;
  const color = percent === null ? "text-ink-faint" : percent > 90 ? "text-bad" : percent > 70 ? "text-warn" : "text-accent-2";

  return (
    <ToolbarButton onClick={onClick} title={percent === null ? "Context & usage" : `Context window: ${percent.toFixed(0)}% used (last turn)`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className={color}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={STROKE}
        />
        {percent !== null && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
      </svg>
    </ToolbarButton>
  );
}
