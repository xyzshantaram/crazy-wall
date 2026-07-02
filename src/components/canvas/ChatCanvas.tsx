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

  const thinkingState = useThinkingStore((s) => s.chats[chatId]);
  const reopenThinking = useThinkingStore((s) => s.reopen);

  const containerRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [explainNodeId, setExplainNodeId] = useState<string | null>(null);
  const [updateNodeId, setUpdateNodeId] = useState<string | null>(null);
  const [promptsOpen, setPromptsOpen] = useState(false);

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
    // All clicks are additive — toggle the node in/out of the selection set.
    // Background click (handleBackgroundClick) is the only way to clear all.
    setHighlightedNodeIds(new Set());
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

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
    // Auto-clear after 3 seconds
    setTimeout(() => setHighlightedNodeIds(new Set()), 3000);
  }, []);

  // Thinking panel: available if there's any trace (active or completed) and not dismissed
  const thinkingHasContent = Boolean(thinkingState?.text || thinkingState?.active);
  const thinkingDismissed = thinkingState?.dismissed ?? false;
  const thinkingActive = !thinkingDismissed && thinkingHasContent;

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
                onSelect={handleSelect}
                onExpand={(id) => void expandNode(chatId, id)}
                onFork={handleFork}
                onExplain={setExplainNodeId}
                onUpdate={setUpdateNodeId}
                generating={busyNodeIds.has(node.id) || node.generating}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </CanvasViewport>

      <ThinkingPanel chatId={chatId} />

      <CanvasToolbar
        viewport={chat.viewport}
        onViewportChange={(v) => setViewport(chatId, v)}
        thinkingAvailable={thinkingHasContent}
        thinkingActive={thinkingActive}
        onToggleThinking={() => {
          if (thinkingDismissed) reopenThinking(chatId);
        }}
        promptCount={chat?.promptLog?.length ?? 0}
        promptsOpen={promptsOpen}
        onTogglePrompts={() => setPromptsOpen((o) => !o)}
      />

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

function UpdateNodePrompt({
  nodeTitle,
  onSubmit,
  onClose,
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
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12.5px] text-ink-dim hover:bg-white/6 transition-colors">
            Cancel
          </button>
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
