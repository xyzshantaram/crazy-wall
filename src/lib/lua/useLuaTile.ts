/**
 * React hook: mount a Lua script as a tile in the sandbox runtime and get
 * back the live TileOutput tree (re-rendered automatically by nostr-canvas
 * whenever the script's signals change), cast to our WidgetNode schema.
 *
 * Each node gets its own tile identifier (namespaced by node id) so multiple
 * nodes never collide, and its own tile instance so state (signals) is
 * isolated per node.
 */

import { useEffect, useRef, useState } from "react";
import { getSandboxRuntime } from "./runtimeManager";
import type { WidgetNode } from "../../types/widget";

export interface UseLuaTileResult {
  output: WidgetNode | null;
  error: string | null;
  deliver: (handler: string, payload?: Record<string, unknown>) => void;
}

export function useLuaTile(nodeId: string, script: string | undefined): UseLuaTileResult {
  const [output, setOutput] = useState<WidgetNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tileIdRef = useRef<string | null>(null);
  const identifierRef = useRef<string>(`canvas.local:node-${nodeId}`);

  useEffect(() => {
    if (!script) {
      setOutput(null);
      return;
    }
    setError(null);
    const runtime = getSandboxRuntime();
    const identifier = identifierRef.current;

    let disposed = false;

    try {
      runtime.register({ identifier, script, language: "lua" });
      const tileId = runtime.createTile(identifier, { placement: "main" });
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
  }, [nodeId, script]);

  const deliver = (handler: string, payload?: Record<string, unknown>) => {
    const runtime = getSandboxRuntime();
    const tileId = tileIdRef.current;
    if (!tileId) return;
    try {
      runtime.deliverInputEvent(tileId, handler, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return { output, error, deliver };
}
