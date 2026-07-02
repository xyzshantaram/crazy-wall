/**
 * transfer.ts — Trystero-based P2P wall transfer.
 *
 * Uses the Nostr strategy (same relay network already in the app) for
 * signaling. Actual wall data flows directly browser-to-browser over
 * an encrypted WebRTC DataChannel — relays only see the SDP handshake.
 *
 * Room code: 6 uppercase alphanumeric chars, e.g. "X7K2PQ".
 * Both peers join the same code — one sends, the other receives.
 */

import { joinRoom, selfId as trysteroSelfId } from "trystero";
import type { Room, MessageAction, DataPayload } from "trystero";
import type { WallPayload } from "../export/serialize";

export { trysteroSelfId as selfId };

export type TransferState =
  | { status: "idle" }
  | { status: "waiting"; code: string }
  | { status: "connected"; peerId: string }
  | { status: "sending"; progress: number }
  | { status: "receiving"; progress: number }
  | { status: "done"; direction: "sent" | "received" }
  | { status: "error"; message: string };

export type OnStateChange = (state: TransferState) => void;
export type OnReceived = (payload: WallPayload) => void;

const APP_ID = "crazy-wall-v1";

/** Generate a human-friendly 6-char room code (no 0/O/1/I ambiguity). */
export function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  for (const b of arr) code += chars[b % chars.length];
  return code;
}

export interface TransferSession {
  code: string;
  send: (data: Uint8Array) => Promise<void>;
  close: () => void;
}

export function openTransferRoom(
  code: string,
  onState: OnStateChange,
  onReceived: OnReceived,
): TransferSession {
  let room: Room;

  try {
    room = joinRoom({ appId: APP_ID }, code);
  } catch (err) {
    onState({ status: "error", message: String(err) });
    return { code, send: async () => {}, close: () => {} };
  }

  // wall action: transfer the raw gzipped bytes as ArrayBuffer
  const wallAction = room.makeAction<ArrayBuffer>("wall") as MessageAction<DataPayload>;

  // ack action: receiver confirms receipt so sender shows "done"
  const ackAction = room.makeAction<string>("ack") as MessageAction<DataPayload>;

  room.onPeerJoin = (peerId: string) => {
    onState({ status: "connected", peerId });
  };

  room.onPeerLeave = (_peerId: string) => {
    onState({ status: "waiting", code });
  };

  wallAction.onReceiveProgress = (progress: number) => {
    onState({ status: "receiving", progress });
  };

  wallAction.onMessage = (data: DataPayload, _ctx) => {
    void (async () => {
      try {
        const { deserializeWall } = await import("../export/serialize");
        const payload = await deserializeWall(new Uint8Array(data as ArrayBuffer));
        onReceived(payload);
        await ackAction.send("ok");
        onState({ status: "done", direction: "received" });
      } catch (e) {
        onState({ status: "error", message: "Failed to deserialize: " + String(e) });
      }
    })();
  };

  ackAction.onMessage = (_data: DataPayload, _ctx) => {
    onState({ status: "done", direction: "sent" });
  };

  const send = async (data: Uint8Array): Promise<void> => {
    onState({ status: "sending", progress: 0 });
    await wallAction.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, {
      onProgress: (progress: number) => {
        onState({ status: "sending", progress });
      },
    });
  };

  const close = () => {
    try { void room.leave(); } catch { /* ignore */ }
  };

  onState({ status: "waiting", code });
  return { code, send, close };
}
