/**
 * Lua runtime management.
 *
 * We keep exactly two long-lived `TileRuntime` instances for the whole app:
 *
 * - `sandboxRuntime` — backed by `NullAdapter`. Every ordinary graph node's
 *   Lua content runs here. No network, no identity, no relay -- pure
 *   rendering. Tiles are registered via the in-memory `register()` API
 *   (never `registerFromEvent`), so nothing is persisted by nostr-canvas
 *   itself and no capability is ever granted.
 *
 * - `liveRuntime` (lazily created) — backed by `LiveNostrAdapter`, used only
 *   for approved "Nostr dashboard" nodes. Tiles here ARE registered via a
 *   synthetic `TileDefEvent` (see nostrDashboard.ts) carrying the AI's
 *   declared `perm` tags, so the runtime's normal grant resolution applies.
 *
 * Both runtimes share one `WorkerExecutor` pool (per nostr-canvas's own
 * recommendation) so Lua VMs are reused efficiently across many small nodes.
 */

import { TileRuntime, WorkerExecutor, type Capability } from "@soapbox.pub/nostr-canvas";
import { createNullAdapter, LiveNostrAdapter, type ConfirmFn } from "./adapter";

const sharedPool = WorkerExecutor.createPool();

let _sandboxRuntime: TileRuntime | null = null;
export function getSandboxRuntime(): TileRuntime {
  if (!_sandboxRuntime) {
    _sandboxRuntime = new TileRuntime(createNullAdapter(), {
      workerPool: sharedPool,
      storage: new MemoryStorage(),
    });
  }
  return _sandboxRuntime;
}

let _liveRuntime: TileRuntime | null = null;
let _liveAdapter: LiveNostrAdapter | null = null;

export function getLiveRuntime(opts: { relays: string[]; confirm: ConfirmFn }): TileRuntime {
  if (_liveAdapter) _liveAdapter.destroy();
  _liveAdapter = new LiveNostrAdapter({ relays: opts.relays, confirm: opts.confirm });
  if (_liveRuntime) {
    _liveRuntime.destroy();
  }
  _liveRuntime = new TileRuntime(_liveAdapter, {
    workerPool: sharedPool,
    storage: new MemoryStorage(),
    // The declared perms are whatever the AI put in the synthetic event;
    // grant exactly what was declared since the user already approved them
    // via the confirmation dialog before we got here.
    onGrantDecision: (_identifier: string, declared: Capability[]) => declared,
  });
  return _liveRuntime;
}

/** In-memory storage backend — we don't want nostr-canvas persisting
 *  anything to localStorage; our own graph store is the source of truth. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}
