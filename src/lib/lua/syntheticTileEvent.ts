/**
 * Build a synthetic in-memory TileDefEvent for a Nostr-dashboard node.
 *
 * We never actually sign or publish this as a real Nostr event -- it exists
 * purely to drive `TileRuntime.registerFromEvent`'s existing grant-resolution
 * path (identifier -> perms -> granted capability set), reusing nostr-canvas's
 * own machinery instead of reinventing it. `registerFromEvent` only reads the
 * fields below; it never verifies a signature.
 */

import type { TileDefEvent } from "@soapbox.pub/nostr-canvas";
import type { NostrCapability } from "../../types/graph";

export function buildSyntheticTileDefEvent(opts: {
  nodeId: string;
  script: string;
  capabilities: NostrCapability[];
}): TileDefEvent {
  return {
    id: `synthetic-${opts.nodeId}`,
    pubkey: "0".repeat(64),
    createdAt: Math.floor(Date.now() / 1000),
    identifier: `canvas.local:dashboard-${opts.nodeId}`,
    name: "Nostr Dashboard",
    version: "1",
    language: "lua",
    script: opts.script,
    settings: [],
    actions: [],
    perms: opts.capabilities,
  };
}
