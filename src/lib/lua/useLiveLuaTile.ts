/**
 * React hook: mount a Lua script in the LIVE runtime (real Nostr adapter),
 * only after the user has approved its declared capabilities. Mirrors
 * useLuaTile but wires registerFromEvent (grant-bearing) instead of the
 * grant-less register(), and threads a per-call confirm callback through to
 * the adapter so publish/fetch/nip44/navigate each get an explicit prompt.
 */

import { useEffect, useRef, useState } from "react";
import { getLiveRuntime } from "./runtimeManager";
import { buildSyntheticTileDefEvent } from "./syntheticTileEvent";
import type { ConfirmRequest } from "./adapter";
import type { WidgetNode } from "../../types/widget";
import type { NostrCapability } from "../../types/graph";

export interface UseLiveLuaTileResult {
  output: WidgetNode | null;
  error: string | null;
  deliver: (handler: string, payload?: Record<string, unknown>) => void;
}

export function useLiveLuaTile(opts: {
  nodeId: string;
  script: string | undefined;
  capabilities: NostrCapability[];
  relays: string[];
  /** Approval must already have happened before this hook mounts anything real. */
  approved: boolean;
  onConfirmRequest: (req: ConfirmRequest) => Promise<boolean>;
}): UseLiveLuaTileResult {
  const [output, setOutput] = useState<WidgetNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tileIdRef = useRef<string | null>(null);
  const runtimeRef = useRef<ReturnType<typeof getLiveRuntime> | null>(null);
  const relaysKey = opts.relays.join(",");
  const capsKey = opts.capabilities.join(",");

  useEffect(() => {
    if (!opts.script || !opts.approved) {
      setOutput(null);
      return;
    }
    setError(null);

    const runtime = getLiveRuntime({ relays: opts.relays, confirm: opts.onConfirmRequest });
    runtimeRef.current = runtime;
    const event = buildSyntheticTileDefEvent({
      nodeId: opts.nodeId,
      script: opts.script,
      capabilities: opts.capabilities,
    });

    let disposed = false;
    try {
      runtime.registerFromEvent(event);
      const tileId = runtime.createTile(event.identifier, { placement: "main" });
      tileIdRef.current = tileId;
      const offOutput = runtime.onTileOutput(tileId, (out) => {
        if (disposed) return;
        setOutput(out as unknown as WidgetNode);
      });
      return () => {
        disposed = true;
        offOutput();
        runtime.removeTile(tileId);
        tileIdRef.current = null;
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    // relaysKey/capsKey are derived stand-ins for opts.relays/opts.capabilities identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.nodeId, opts.script, opts.approved, relaysKey, capsKey]);

  const deliver = (handler: string, payload?: Record<string, unknown>) => {
    const runtime = runtimeRef.current;
    const tileId = tileIdRef.current;
    if (!runtime || !tileId) return;
    try {
      runtime.deliverInputEvent(tileId, handler, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return { output, error, deliver };
}
