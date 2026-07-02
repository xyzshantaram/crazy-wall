/**
 * SharePanel — P2P wall transfer UI.
 *
 * Two modes:
 *   Host (send): generates a code, waits for peer, sends on connect.
 *   Guest (receive): enters a code, joins, receives the wall.
 *
 * The last-used code for each chat is persisted in settingsStore so
 * subsequent syncs are one tap (code pre-filled).
 */

import { useState, useEffect, useRef } from "react";
import { useGraphStore } from "../../stores/graphStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { serializeWall } from "../../lib/export/serialize";
import {
  openTransferRoom,
  generateCode,
  type TransferState,
  type TransferSession,
} from "../../lib/p2p/transfer";
import type { WallPayload } from "../../lib/export/serialize";

interface Props {
  chatId: string;
  onClose: () => void;
}

type Mode = "pick" | "send" | "receive";

export function SharePanel({ chatId, onClose }: Props) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const chat = useGraphStore((s) => s.chats[chatId]);
  const importWall = useGraphStore((s) => s.importWall);
  const savedCode = useSettingsStore((s) => s.shareCodes[chatId] ?? "");
  const setShareCode = useSettingsStore((s) => s.setShareCode);

  const [mode, setMode] = useState<Mode>("pick");
  const [code, setCode] = useState(savedCode);
  const [transferState, setTransferState] = useState<TransferState>({ status: "idle" });
  const sessionRef = useRef<TransferSession | null>(null);

  // Clean up room on unmount.
  useEffect(() => {
    return () => { sessionRef.current?.close(); };
  }, []);

  const handleStateChange = (state: TransferState) => {
    setTransferState(state);
    if (state.status === "waiting") {
      setShareCode(chatId, state.code);
      setCode(state.code);
    }
  };

  const handleReceived = (payload: WallPayload) => {
    importWall(payload);
  };

  const startSend = () => {
    if (!chat) return;
    const roomCode = generateCode();
    setMode("send");
    const chatNodes = Object.values(nodes).filter((n) => n.chatId === chatId);
    const chatEdges = Object.values(edges).filter((e) => e.chatId === chatId);

    const session = openTransferRoom(roomCode, async (state) => {
      handleStateChange(state);
      // Auto-send as soon as a peer connects.
      if (state.status === "connected") {
        const data = await serializeWall(chat, chatNodes, chatEdges);
        await session.send(data);
      }
    }, handleReceived);

    sessionRef.current = session;
  };

  const startReceive = () => {
    if (!code.trim()) return;
    const roomCode = code.trim().toUpperCase();
    setMode("receive");
    setShareCode(chatId, roomCode);
    const session = openTransferRoom(roomCode, handleStateChange, handleReceived);
    sessionRef.current = session;
  };

  const reset = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setMode("pick");
    setTransferState({ status: "idle" });
  };

  const progressPct = transferState.status === "sending" || transferState.status === "receiving"
    ? Math.round(transferState.progress * 100)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[420px] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">Share Wall</h2>
            <p className="text-[12px] text-ink-faint mt-0.5 truncate max-w-[300px]">{chat?.title}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-white/6 transition-colors">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">

          {/* Mode picker */}
          {mode === "pick" && (
            <>
              <p className="text-[13px] text-ink-dim leading-relaxed">
                Transfer this wall directly to another device — no server, end-to-end encrypted over WebRTC.
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={startSend}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-accent/40 bg-accent/5 hover:bg-accent/10 hover:border-accent/60 transition-colors text-left"
                >
                  <span className="text-[22px]">📤</span>
                  <div>
                    <div className="text-[13px] font-semibold text-ink">Send this wall</div>
                    <div className="text-[12px] text-ink-faint mt-0.5">Generate a code — other device enters it to receive</div>
                  </div>
                </button>
                <button
                  onClick={() => setMode("receive")}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-accent-2/40 bg-accent-2/5 hover:bg-accent-2/10 hover:border-accent-2/60 transition-colors text-left"
                >
                  <span className="text-[22px]">📥</span>
                  <div>
                    <div className="text-[13px] font-semibold text-ink">Receive a wall</div>
                    <div className="text-[12px] text-ink-faint mt-0.5">
                      {savedCode ? `Enter code (last: ${savedCode})` : "Enter the code from the sending device"}
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Send mode */}
          {mode === "send" && (
            <>
              {transferState.status === "waiting" && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <p className="text-[13px] text-ink-dim text-center">Enter this code on the receiving device:</p>
                  <div className="flex items-center gap-1.5">
                    {code.split("").map((ch, i) => (
                      <span key={i} className="w-9 h-11 flex items-center justify-center rounded-lg bg-surface-3 border border-border text-[20px] font-bold font-mono text-ink tracking-wider">
                        {ch}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-faint">Waiting for peer to connect…</p>
                  <div className="flex gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "200ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "400ms" }} />
                  </div>
                </div>
              )}
              {transferState.status === "connected" && (
                <StatusRow icon="🔗" label="Peer connected — preparing transfer…" color="accent" />
              )}
              {transferState.status === "sending" && (
                <ProgressBar label="Sending…" progress={progressPct ?? 0} color="accent" />
              )}
              {transferState.status === "done" && (
                <StatusRow icon="✅" label="Wall sent successfully!" color="good" />
              )}
              {transferState.status === "error" && (
                <StatusRow icon="⚠️" label={transferState.message} color="bad" />
              )}
            </>
          )}

          {/* Receive mode */}
          {mode === "receive" && transferState.status === "idle" && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-ink-dim">Enter the 6-character code from the sending device:</p>
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={(e) => { if (e.key === "Enter") startReceive(); }}
                placeholder="XXXXXX"
                className="w-full px-4 py-3 rounded-xl bg-surface-3 border border-border text-[20px] font-bold font-mono text-ink text-center tracking-[0.3em] uppercase outline-none focus:border-accent-2 transition-colors"
              />
              <button
                onClick={startReceive}
                disabled={code.length < 6}
                className="w-full py-2.5 rounded-xl bg-accent-2/15 border border-accent-2/40 text-[13px] font-semibold text-accent-2 hover:bg-accent-2/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Join room
              </button>
            </div>
          )}
          {mode === "receive" && transferState.status === "waiting" && (
            <StatusRow icon="🔗" label={`Waiting in room ${code} for sender…`} color="accent-2" pulse />
          )}
          {mode === "receive" && transferState.status === "connected" && (
            <StatusRow icon="🔗" label="Sender connected — receiving…" color="accent-2" />
          )}
          {mode === "receive" && transferState.status === "receiving" && (
            <ProgressBar label="Receiving…" progress={progressPct ?? 0} color="accent-2" />
          )}
          {mode === "receive" && transferState.status === "done" && (
            <StatusRow icon="✅" label="Wall received and imported!" color="good" />
          )}
          {mode === "receive" && transferState.status === "error" && (
            <StatusRow icon="⚠️" label={transferState.message} color="bad" />
          )}

          {/* Footer actions */}
          <div className="flex justify-between items-center pt-1">
            {mode !== "pick" ? (
              <button onClick={reset} className="text-[12px] text-ink-faint hover:text-ink transition-colors">
                ← Back
              </button>
            ) : <span />}
            {(transferState.status === "done" || transferState.status === "error") && (
              <button onClick={onClose} className="text-[12px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink-dim hover:text-ink transition-colors">
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ icon, label, color, pulse }: { icon: string; label: string; color: string; pulse?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-${color}/5 border border-${color}/20`}>
      <span className="text-[18px]">{icon}</span>
      <span className={`text-[13px] text-${color} ${pulse ? "animate-pulse" : ""}`}>{label}</span>
    </div>
  );
}

function ProgressBar({ label, progress, color }: { label: string; progress: number; color: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-[12px]">
        <span className="text-ink-dim">{label}</span>
        <span className={`text-${color} font-mono`}>{progress}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          className={`h-full rounded-full bg-${color} transition-all duration-200`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
