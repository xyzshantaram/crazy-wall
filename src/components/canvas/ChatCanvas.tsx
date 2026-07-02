/**
 * ChatCanvas — the per-chat view. Shows IntroScreen until the chat has
 * started; once the first prompt is submitted, animates the input into the
 * root node position and reveals the infinite canvas underneath.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGraphStore } from "../../stores/graphStore";
import { useGraphActions } from "../../hooks/useGraphActions";
import { useThinkingStore } from "../../stores/thinkingStore";
import { IntroScreen } from "../intro/IntroScreen";
import { CanvasViewport } from "./CanvasViewport";
import { NodeCard } from "./NodeCard";
import { EdgesLayer } from "./EdgesLayer";
import { CanvasToolbar } from "./CanvasToolbar";
import { ExplainPanel } from "./ExplainPanel";
import { ThinkingPanel } from "./ThinkingPanel";
import { FloatingChatBar } from "./FloatingChatBar";
import { PromptLogPanel } from "./PromptLogPanel";
import { AskUserHost } from "./AskUserDialog";
import { CitationsPanel } from "./CitationsPanel";
import { NodePeek } from "./NodePeek";
import { computeFramingViewport } from "../../lib/graph/viewportFraming";
import type { Viewport } from "../../types/graph";

interface Props {
  chatId: string;
}

export function ChatCanvas({ chatId }: Props) {
  const chat = useGraphStore((s) => s.chats[chatId]);
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const markChatStarted = useGraphStore((s) => s.markChatStarted);
  const setViewport = useGraphStore((s) => s.setViewport);
  const createChat = useGraphStore((s) => s.createChat);
  const revertToPrompt = useGraphStore((s) => s.revertToPrompt);

  const thinkingState = useThinkingStore((s) => s.chats[chatId]);
  const reopenThinking = useThinkingStore((s) => s.reopen);

  const containerRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [explainNodeId, setExplainNodeId] = useState<string | null>(null);
  const [updateNodeId, setUpdateNodeId] = useState<string | null>(null);
  const [citationsNodeId, setCitationsNodeId] = useState<string | null>(null);
  const [peekNodeId, setPeekNodeId] = useState<string | null>(null);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [revertConfirmEntryIndex, setRevertConfirmEntryIndex] = useState<number | null>(null);

  const handleNodesCreated = useCallback(
    (targetChatId: string, nodeIds: string[]) => {
      if (nodeIds.length === 0 || targetChatId !== chatId) return;
      const container = containerRef.current;
      if (!container) return;
      const created = nodeIds.map((id) => useGraphStore.getState().nodes[id]).filter((n): n is NonNullable<typeof n> => Boolean(n));
      const rect = container.getBoundingClientRect();
      const framed = computeFramingViewport(created, { width: rect.width, height: rect.height });
      if (framed) setViewport(chatId, framed);
    },
    [chatId, setViewport],
  );

  const { busyNodeIds, busyChat, createRoot, expandNode, forkNode, multiSelectAction, recomputeNode, cancelGeneration } = useGraphActions({
    onNodesCreated: handleNodesCreated,
  });

  const nodes = useMemo(
    () => Object.values(allNodes).filter((n) => n.chatId === chatId),
    [allNodes, chatId],
  );
  const edges = useMemo(() => Object.values(allEdges).filter((e) => e.chatId === chatId), [allEdges, chatId]);
  const parentChildPairs = useMemo(
    () => nodes.filter((n) => n.parentId).map((n) => ({ from: n.parentId as string, to: n.id })),
    [nodes],
  );

  const handleSelect = useCallback((nodeId: string, _additive: boolean) => {
    setHighlightedNodeIds(new Set());
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        return next;
      }
      next.add(nodeId);

      // If the newly selected node is a prompt bubble, highlight its
      // input (→ prompt) and output (prompt →) nodes via edges.
      const node = useGraphStore.getState().nodes[nodeId];
      if (node?.kind === "prompt") {
        const chatEdges = Object.values(useGraphStore.getState().edges).filter((e) => e.chatId === chatId);
        const connected = new Set<string>();
        for (const e of chatEdges) {
          if (e.from === nodeId) connected.add(e.to);
          if (e.to === nodeId) connected.add(e.from);
        }
        connected.delete(nodeId);
        setHighlightedNodeIds(connected);
      }

      return next;
    });
  }, [chatId]);

  const handleBackgroundClick = useCallback(() => {
    setSelected(new Set());
    setHighlightedNodeIds(new Set());
  }, []);

  const handleIntroSubmit = useCallback(
    (prompt: string) => {
      markChatStarted(chatId);
      void createRoot(chatId, prompt);
    },
    [chatId, createRoot, markChatStarted],
  );

  const handleFork = useCallback(
    (nodeId: string) => {
      const newChatId = createChat();
      void forkNode(nodeId, newChatId);
    },
    [createChat, forkNode],
  );

  const handleJumpViewport = useCallback((v: Viewport) => {
    setViewport(chatId, v);
  }, [chatId, setViewport]);

  const handleHighlight = useCallback((nodeIds: string[]) => {
    setHighlightedNodeIds(new Set(nodeIds));
    setTimeout(() => setHighlightedNodeIds(new Set()), 3000);
  }, []);

  const thinkingHasContent = Boolean((thinkingState?.events?.length ?? 0) > 0 || thinkingState?.active || busyChat);
  const thinkingDismissed = thinkingState?.dismissed ?? false;
  const thinkingActive = !thinkingDismissed && thinkingHasContent;

  // Find the prompt log entry for a selected prompt node (for revert button)
  const selectedPromptEntry = useMemo(() => {
    if (selected.size !== 1) return null;
    const [id] = selected;
    const node = allNodes[id];
    if (!node || node.kind !== "prompt") return null;
    const log = chat?.promptLog ?? [];
    const idx = log.findIndex((e) => e.canvasNodeId === id);
    if (idx === -1) return null;
    return { entry: log[idx], index: idx };
  }, [selected, allNodes, chat?.promptLog]);

  if (!chat) return null;

  if (!chat.started) {
    return <IntroScreen chatId={chatId} onSubmit={handleIntroSubmit} busy={busyChat} />;
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <CanvasViewport
        viewport={chat.viewport}
        onViewportChange={(v: Viewport) => setViewport(chatId, v)}
        onBackgroundClick={handleBackgroundClick}
        underlay={<EdgesLayer nodes={allNodes} edges={edges} parentChildPairs={parentChildPairs} />}
      >
        <AnimatePresence>
          {nodes.map((node) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <NodeCard
                node={node}
                selected={selected.has(node.id)}
                highlighted={highlightedNodeIds.has(node.id)}
                zoom={chat.viewport.zoom}
                selectedIds={selected}
                onSelect={handleSelect}
                onExpand={(id) => void expandNode(chatId, id)}
                onFork={handleFork}
                onExplain={setExplainNodeId}
                onUpdate={setUpdateNodeId}
                onShowCitations={setCitationsNodeId}
                onPeek={setPeekNodeId}
                onFitNode={(id) => {
                  const n = allNodes[id];
                  if (!n || !containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  // Reserve space for the chat bar (~130px) and toolbar (~60px above bar on mobile)
                  // so the node fills the visible canvas area, not the area under the UI chrome.
                  const chatBarHeight = 130;
                  const framed = computeFramingViewport(
                    [n],
                    { width: rect.width, height: rect.height - chatBarHeight },
                    { padding: 32, maxZoom: 4, minZoom: 0.15 },
                  );
                  if (framed) setViewport(chatId, framed);
                }}
                generating={busyNodeIds.has(node.id) || node.generating}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </CanvasViewport>

      <ThinkingPanel chatId={chatId} busy={busyChat} />
      <AskUserHost />

      <CanvasToolbar
        viewport={chat.viewport}
        onViewportChange={(v) => setViewport(chatId, v)}
        nodes={nodes}
        containerSize={containerRef.current ? {
          width: containerRef.current.getBoundingClientRect().width,
          height: containerRef.current.getBoundingClientRect().height,
        } : { width: 800, height: 600 }}
        thinkingAvailable={thinkingHasContent}
        thinkingActive={thinkingActive}
        onToggleThinking={() => {
          if (thinkingDismissed) reopenThinking(chatId);
        }}
        promptCount={chat?.promptLog?.length ?? 0}
        promptsOpen={promptsOpen}
        onTogglePrompts={() => setPromptsOpen((o) => !o)}
      />

      {/* Revert-to-prompt floating button — shown when a prompt bubble is selected */}
      {selectedPromptEntry && (
        <div
          data-no-pan
          className="absolute bottom-36 left-1/2 -translate-x-1/2 z-20 animate-fade-in-up"
        >
          <button
            onClick={() => setRevertConfirmEntryIndex(selectedPromptEntry.index)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-warn/15 border border-warn/40 text-warn text-[12.5px] font-medium hover:bg-warn/25 transition-colors shadow-panel"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 1 0 1.5-3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M2 3.5V8h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Revert wall to this prompt
          </button>
        </div>
      )}

      {/* Floating chat bar */}
      <FloatingChatBar
        chatId={chatId}
        selectedNodeIds={selected}
        busy={busyChat}
        onSubmit={(prompt, selectedIds) => {
          void multiSelectAction(chatId, selectedIds, prompt);
          if (selectedIds.length > 0) setSelected(new Set());
        }}
        onCancel={cancelGeneration}
        onClearSelection={() => { setSelected(new Set()); setHighlightedNodeIds(new Set()); }}
      />

      {/* Prompt history panel */}
      {promptsOpen && containerRef.current && (
        <PromptLogPanel
          chatId={chatId}
          onClose={() => setPromptsOpen(false)}
          onJump={handleJumpViewport}
          onHighlight={handleHighlight}
          containerSize={{
            width: containerRef.current.getBoundingClientRect().width,
            height: containerRef.current.getBoundingClientRect().height,
          }}
        />
      )}

      {explainNodeId && allNodes[explainNodeId] && (
        <ExplainPanel node={allNodes[explainNodeId]} onClose={() => setExplainNodeId(null)} />
      )}

      {/* Citations panel — rendered here (outside canvas transform) to avoid stacking context trapping */}
      {citationsNodeId && allNodes[citationsNodeId] && (
        <CitationsPanel node={allNodes[citationsNodeId]} onClose={() => setCitationsNodeId(null)} />
      )}

      {/* Long-press peek overlay */}
      {peekNodeId && allNodes[peekNodeId] && (
        <NodePeek node={allNodes[peekNodeId]} onDismiss={() => setPeekNodeId(null)} />
      )}

      {updateNodeId && allNodes[updateNodeId] && (
        <UpdateNodePrompt
          nodeTitle={allNodes[updateNodeId].title}
          onSubmit={(instruction) => {
            void recomputeNode(updateNodeId, instruction);
            setUpdateNodeId(null);
          }}
          onClose={() => setUpdateNodeId(null)}
        />
      )}

      {/* Revert confirmation dialog */}
      {revertConfirmEntryIndex !== null && (
        <RevertConfirmDialog
          onConfirm={() => {
            revertToPrompt(chatId, revertConfirmEntryIndex);
            setRevertConfirmEntryIndex(null);
            setSelected(new Set());
            setHighlightedNodeIds(new Set());
          }}
          onClose={() => setRevertConfirmEntryIndex(null)}
        />
      )}

      {nodes.length === 0 && busyChat && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            layoutId={`node-shell-${chatId}`}
            className="w-[300px] bg-surface border border-border rounded-2xl shadow-panel px-4 py-4"
          >
            <div className="h-3 w-2/3 rounded skeleton-shimmer mb-2" />
            <div className="h-3 w-1/2 rounded skeleton-shimmer" />
          </motion.div>
        </div>
      )}
    </div>
  );
}

function RevertConfirmDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] max-w-[calc(100vw-32px)] bg-surface border border-border rounded-2xl shadow-panel p-5 animate-fade-in-up"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-warn/15 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 1 0 1.5-3.9" stroke="var(--color-warn)" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M2 3.5V8h4.5" stroke="var(--color-warn)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3 className="text-[14px] font-semibold text-ink">Revert wall?</h3>
        </div>
        <p className="text-[13px] text-ink-dim leading-relaxed mb-5">
          All nodes and edges created <em>after</em> this prompt will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-[13px] text-ink-dim hover:bg-white/6 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-warn/20 text-warn border border-warn/40 hover:bg-warn/30 transition-colors"
          >
            Yes, revert
          </button>
        </div>
      </div>
    </div>
  );
}

function UpdateNodePrompt({
  nodeTitle, onSubmit, onClose,
}: {
  nodeTitle: string;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] bg-surface border border-border rounded-2xl shadow-panel p-4 animate-fade-in-up"
      >
        <div className="text-[12px] text-ink-faint mb-1.5">Regenerate "{nodeTitle}"</div>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (value.trim()) onSubmit(value.trim());
            }
          }}
          placeholder="Describe what changed, e.g. 'budget is now $4M'"
          rows={2}
          className="w-full resize-none bg-surface-2 border border-border-soft rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12.5px] text-ink-dim hover:bg-white/6 transition-colors">Cancel</button>
          <button
            onClick={() => value.trim() && onSubmit(value.trim())}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
