/**
 * Renders queued toasts in the bottom-right corner.
 */

import { useToastStore } from "../../stores/toastStore";

const VARIANT_STYLE: Record<string, string> = {
  default: "border-border bg-surface-2",
  success: "border-good/30 bg-good/10",
  warning: "border-warn/30 bg-warn/10",
  danger: "border-bad/30 bg-bad/10",
};

const VARIANT_DOT: Record<string, string> = {
  default: "bg-ink-faint",
  success: "bg-good",
  warning: "bg-warn",
  danger: "bg-bad",
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto flex items-center gap-2 px-3.5 py-2.5 rounded-xl border shadow-panel text-[13px] text-ink cursor-pointer animate-fade-in-up max-w-[320px] ${VARIANT_STYLE[t.variant ?? "default"]}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${VARIANT_DOT[t.variant ?? "default"]}`} />
          {t.message}
        </div>
      ))}
    </div>
  );
}
