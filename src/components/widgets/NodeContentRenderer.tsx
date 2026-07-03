/**
 * NodeContentRenderer — dispatches a GraphNode's content to one of three
 * paths (static widget JSON, sandboxed Lua, or a live Nostr-dashboard Lua
 * tile), all converging on the same WidgetNode rendering.
 */

import { useEffect, useState } from "react";
import { WidgetRenderer, type WidgetActionHandler } from "./WidgetRenderer";
import { renderBlockMd } from "../../lib/markdown";
import { useLuaTile } from "../../lib/lua/useLuaTile";
import { useLiveLuaTile } from "../../lib/lua/useLiveLuaTile";
import { getSandboxRuntime } from "../../lib/lua/runtimeManager";
import { requestConfirmation } from "../../lib/lua/confirmationQueue";
import { DashboardApprovalDialog } from "../dashboard/DashboardApprovalDialog";
import type { NodeContent } from "../../types/graph";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGraphStore } from "../../stores/graphStore";

interface Props {
  nodeId: string;
  content: NodeContent;
  title: string;
  onToast?: (message: string, variant?: string) => void;
}

export function NodeContentRenderer({ nodeId, content, title, onToast }: Props) {
  if (content.mode === "markdown") {
    return <MarkdownContent markdown={content.markdown ?? ""} />;
  }
  if (content.mode === "lua") {
    return <LuaContent nodeId={nodeId} script={content.lua} onToast={onToast} />;
  }
  if (content.mode === "nostr-dashboard") {
    return <DashboardContent nodeId={nodeId} title={title} content={content} onToast={onToast} />;
  }
  if (!content.widget) return null;
  return <WidgetRenderer node={content.widget} onAction={() => {}} keyPrefix={nodeId} />;
}

function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div
      className="prose-node text-[13px] leading-relaxed text-ink-dim
        [&_p]:mb-2 [&_p:last-child]:mb-0
        [&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:text-ink [&_h4]:mt-3 [&_h4]:mb-1
        [&_h5]:text-[12px] [&_h5]:font-semibold [&_h5]:text-ink-dim [&_h5]:mt-2 [&_h5]:mb-1
        [&_ul]:pl-4 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:marker:text-ink-faint
        [&_ol]:pl-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:marker:text-ink-faint
        [&_li]:mb-0.5
        [&_strong]:text-ink [&_strong]:font-semibold
        [&_em]:italic [&_em]:text-ink-dim
        [&_code]:bg-surface-3 [&_code]:text-accent-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:font-mono
        [&_pre]:bg-surface-3 [&_pre]:border [&_pre]:border-border-soft [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:mb-2
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-ink-dim
        [&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 [&_blockquote]:text-ink-faint [&_blockquote]:italic [&_blockquote]:mb-2
        [&_hr]:border-border-soft [&_hr]:my-2
        [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2"
      dangerouslySetInnerHTML={{ __html: renderBlockMd(markdown) }}
    />
  );
}

function LuaContent({ nodeId, script, onToast }: { nodeId: string; script?: string; onToast?: (m: string, v?: string) => void }) {
  const { output, error, deliver } = useLuaTile(nodeId, script);

  useEffect(() => {
    if (!onToast) return;
    const runtime = getSandboxRuntime();
    return runtime.on("notify", (evt) => onToast(evt.message, evt.variant));
  }, [onToast]);

  const handleAction: WidgetActionHandler = (handler, payload) => {
    deliver(handler, payload as Record<string, unknown> | undefined);
  };

  if (error) {
    return <div className="text-[12px] text-bad bg-bad/10 rounded-lg p-2.5">Lua error: {error}</div>;
  }
  if (!output) return <ContentSkeleton />;
  return <WidgetRenderer node={output} onAction={handleAction} keyPrefix={nodeId} />;
}

function DashboardContent({
  nodeId,
  title,
  content,
  onToast,
}: {
  nodeId: string;
  title: string;
  content: NodeContent;
  onToast?: (m: string, v?: string) => void;
}) {
  const relays = useSettingsStore((s) => s.relays);
  const nostrIdentity = useSettingsStore((s) => s.nostr);
  const updateNode = useGraphStore((s) => s.updateNode);
  const [dialogOpen, setDialogOpen] = useState(!content.approval || content.approval.status === "pending");

  const capabilities = (content.declaredCapabilities ?? []).map((d) => d.capability);
  const approved = content.approval?.status === "approved";

  const { output, error, deliver } = useLiveLuaTile({
    nodeId,
    script: content.lua,
    capabilities,
    relays,
    approved,
    onConfirmRequest: requestConfirmation,
  });

  const handleApprove = () => {
    updateNode(nodeId, {
      content: { ...content, approval: { status: "approved", approvedAt: new Date().toISOString(), capabilities } },
    });
  };
  const handleReject = () => {
    updateNode(nodeId, { content: { ...content, approval: { status: "rejected", rejectedAt: new Date().toISOString() } } });
    onToast?.("Dashboard rejected. Ask the AI to regenerate it differently.", "warning");
  };

  if (!nostrIdentity) {
    return (
      <div className="text-[12.5px] text-ink-dim bg-surface-2 border border-border-soft rounded-lg p-3">
        Sign in with a Nostr extension (Settings) to run this dashboard.
      </div>
    );
  }

  if (content.approval?.status === "rejected") {
    return (
      <div className="text-[12.5px] text-ink-faint bg-surface-2 border border-border-soft rounded-lg p-3 italic">
        Dashboard permissions were rejected. This node's content will not run.
      </div>
    );
  }

  return (
    <>
      {dialogOpen && (
        <DashboardApprovalDialog
          nodeTitle={title}
          declarations={content.declaredCapabilities ?? []}
          lua={content.lua ?? ""}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => setDialogOpen(false)}
        />
      )}
      {!approved ? (
        <button
          onClick={() => setDialogOpen(true)}
          className="w-full text-left text-[12.5px] text-warn bg-warn/10 border border-warn/25 rounded-lg p-3 hover:bg-warn/15 transition-colors"
        >
          ⚡ This node wants real Nostr access — click to review permissions
        </button>
      ) : error ? (
        <div className="text-[12px] text-bad bg-bad/10 rounded-lg p-2.5">Dashboard error: {error}</div>
      ) : !output ? (
        <ContentSkeleton />
      ) : (
        <WidgetRenderer node={output} onAction={(h, p) => deliver(h, p as Record<string, unknown> | undefined)} keyPrefix={nodeId} />
      )}
    </>
  );
}

function ContentSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      <div className="h-3 w-2/3 rounded skeleton-shimmer" />
      <div className="h-3 w-1/2 rounded skeleton-shimmer" />
    </div>
  );
}
