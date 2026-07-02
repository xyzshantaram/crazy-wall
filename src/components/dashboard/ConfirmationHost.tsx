/**
 * Per-call confirmation dialog. Even after a dashboard's capabilities are
 * approved up-front, every individual publish/fetch/encrypt/decrypt/navigate
 * call still pops this dialog showing exactly what's about to happen, before
 * the LiveNostrAdapter fulfils it.
 */

import { useEffect, useState } from "react";
import type { ConfirmRequest } from "../../lib/lua/adapter";
import { setConfirmationQueueSetter, type QueuedConfirm } from "../../lib/lua/confirmationQueue";

const KIND_LABEL: Record<ConfirmRequest["kind"], string> = {
  publish: "Publish to Nostr",
  fetch: "Outbound network request",
  navigate: "Navigate",
  encrypt: "Encrypt message",
  decrypt: "Decrypt message",
};

export function ConfirmationHost() {
  const [pending, setPending] = useState<QueuedConfirm | null>(null);

  useEffect(() => {
    setConfirmationQueueSetter(setPending);
    return () => setConfirmationQueueSetter(null);
  }, []);

  if (!pending) return null;

  const resolve = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[380px] max-w-[90vw] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up">
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-accent font-medium mb-1.5">{KIND_LABEL[pending.kind]}</div>
          <p className="text-[13px] text-ink leading-relaxed">{pending.detail}</p>
        </div>
        <div className="px-5 py-3.5 border-t border-border-soft flex items-center gap-2 justify-end">
          <button
            onClick={() => resolve(false)}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-ink-dim hover:bg-white/6 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => resolve(true)}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
