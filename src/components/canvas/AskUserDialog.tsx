/**
 * AskUserDialog — modal that surfaces the LLM's ask_user tool call to the
 * user. Shows the question, optional predefined choice pills, and optionally
 * a freeform text input. Resolves the pending promise in askUserQueue when
 * the user submits.
 *
 * Modelled on OpenCode's question UI: choices are first-class, freeform is
 * available below, pressing Enter on freeform or clicking a choice submits.
 */

import { useEffect, useRef, useState } from "react";
import { setAskUserQueueSetter, type QueuedAskUser } from "../../lib/llm/tools/askUserQueue";

export function AskUserHost() {
  const [pending, setPending] = useState<QueuedAskUser | null>(null);

  useEffect(() => {
    setAskUserQueueSetter(setPending);
    return () => setAskUserQueueSetter(null);
  }, []);

  if (!pending) return null;

  const resolve = (answer: string) => {
    pending.resolve(answer);
    setPending(null);
  };

  return <AskUserDialog req={pending} onResolve={resolve} />;
}

function AskUserDialog({
  req,
  onResolve,
}: {
  req: QueuedAskUser;
  onResolve: (answer: string) => void;
}) {
  const [freeform, setFreeform] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the freeform input if shown; otherwise the first choice button.
  useEffect(() => {
    if (req.allowFreeform) {
      inputRef.current?.focus();
    }
  }, [req.allowFreeform]);

  const submitFreeform = () => {
    const trimmed = freeform.trim();
    if (!trimmed) return;
    onResolve(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div
        data-no-pan
        className="w-[440px] max-w-[calc(100vw-32px)] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          {/* "AI is asking" label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse flex-shrink-0" />
            <span className="text-[10.5px] uppercase tracking-wide text-accent-2 font-medium">Clarifying question</span>
          </div>
          <p className="text-[15px] font-medium text-ink leading-snug">{req.question}</p>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-3">
          {/* Predefined choices */}
          {req.choices.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {req.choices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => onResolve(choice)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl border border-border-soft bg-surface-2 hover:border-accent/50 hover:bg-accent/5 text-[13px] text-ink-dim hover:text-ink transition-all flex items-center gap-2.5 group"
                >
                  <span className="w-5 h-5 rounded-md border border-border-soft bg-surface-3 group-hover:border-accent/40 flex items-center justify-center text-[10px] text-ink-faint flex-shrink-0 font-mono">
                    {i + 1}
                  </span>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {/* Freeform input */}
          {req.allowFreeform && (
            <div className="flex flex-col gap-1.5">
              {req.choices.length > 0 && (
                <span className="text-[11px] text-ink-faint">Or type your own answer:</span>
              )}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={freeform}
                  onChange={(e) => setFreeform(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitFreeform();
                    if (e.key === "Escape") {
                      /* let them pick a choice instead — don't close the modal */
                      setFreeform("");
                    }
                  }}
                  placeholder={req.choices.length > 0 ? "Type a custom answer…" : "Your answer…"}
                  className="flex-1 min-w-0 bg-surface-2 border border-border-soft rounded-xl px-3.5 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition-colors"
                />
                <button
                  onClick={submitFreeform}
                  disabled={!freeform.trim()}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Submit (Enter)"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Skip */}
          <button
            onClick={() => onResolve("(skipped)")}
            className="text-[11.5px] text-ink-faint hover:text-ink-dim transition-colors self-start"
          >
            Skip this question →
          </button>
        </div>
      </div>
    </div>
  );
}
