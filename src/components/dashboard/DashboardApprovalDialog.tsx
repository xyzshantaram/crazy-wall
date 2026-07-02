/**
 * Unified approve/reject dialog for a Nostr-dashboard node's declared
 * capabilities. Shown once per generated script (a regenerated script after
 * rejection gets its own fresh approval prompt).
 */

import { useMemo } from "react";
import type { CapabilityDeclaration, NostrCapability } from "../../types/graph";
import { auditCapabilities } from "../../lib/lua/capabilityAudit";

const CAPABILITY_LABEL: Record<NostrCapability, string> = {
  "get-pubkey": "Read your public identity",
  "publish-event": "Publish signed events on your behalf",
  "fetch": "Make outbound network requests",
  "nip44-encrypt": "Encrypt a message to someone",
  "nip44-decrypt": "Decrypt a message sent to you",
  "navigate": "Navigate you to another tile or Nostr entity",
};

interface Props {
  nodeTitle: string;
  declarations: CapabilityDeclaration[];
  lua: string;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

export function DashboardApprovalDialog({ nodeTitle, declarations, lua, onApprove, onReject, onClose }: Props) {
  const audit = useMemo(
    () => auditCapabilities(lua, declarations.map((d) => d.capability)),
    [lua, declarations],
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className="w-[440px] max-w-[92vw] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-border-soft">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-warn" />
            <span className="text-[11px] uppercase tracking-wide text-warn font-medium">Nostr dashboard permissions</span>
          </div>
          <h3 className="text-[15px] font-semibold text-ink">"{nodeTitle}" wants real Nostr access</h3>
          <p className="text-[12.5px] text-ink-dim mt-1">
            This node's Lua program will run with your logged-in identity and a real relay connection.
            Review what it says it needs before allowing it to run.
          </p>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 max-h-[40vh] overflow-auto scroll-thin">
          {declarations.length === 0 ? (
            <div className="text-[12.5px] text-ink-faint italic">No capabilities declared.</div>
          ) : (
            declarations.map((d, i) => (
              <div key={i} className="flex flex-col gap-1 bg-surface-2 border border-border-soft rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink">{CAPABILITY_LABEL[d.capability]}</span>
                  <code className="text-[10px] text-ink-faint bg-surface-3 px-1.5 py-0.5 rounded">{d.capability}</code>
                </div>
                <p className="text-[12px] text-ink-dim">{d.justification}</p>
              </div>
            ))
          )}

          {audit.underDeclared.length > 0 && (
            <div className="flex flex-col gap-1 bg-bad/10 border border-bad/25 rounded-xl p-3">
              <span className="text-[12.5px] font-medium text-bad">⚠ Undeclared capability use detected</span>
              <p className="text-[12px] text-ink-dim">
                The script appears to call {audit.underDeclared.join(", ")} without declaring{" "}
                {audit.underDeclared.length === 1 ? "it" : "them"} above. These calls will be blocked if you approve
                only the list shown.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border-soft flex items-center gap-2 justify-end">
          <button
            onClick={() => {
              onReject();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-ink-dim hover:bg-white/6 transition-colors"
          >
            Reject &amp; regenerate
          </button>
          <button
            onClick={() => {
              onApprove();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
