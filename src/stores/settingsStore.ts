/**
 * App settings: LLM provider API keys/models, active provider, tool toggles,
 * and Nostr login state. Persisted to localStorage.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderId } from "../lib/providers/registry";
import { PROVIDERS } from "../lib/providers/registry";

export interface NostrIdentity {
  pubkey: string;
  handle?: string;
}

/** Tool ids that can be toggled on/off. */
export type ToolId = "wikipedia" | "tavily";

export const TOOL_DEFINITIONS: { id: ToolId; label: string; description: string }[] = [
  { id: "wikipedia", label: "Wikipedia", description: "Free encyclopaedia search + article fetch. No key required." },
  { id: "tavily", label: "Tavily Search", description: "Web search with AI-extracted content. Requires API key." },
];

interface SettingsState {
  activeProvider: ProviderId;
  apiKeys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  tavilyApiKey: string;
  /** Per-tool enabled/disabled toggle. Defaults to enabled for all. */
  enabledTools: Record<ToolId, boolean>;
  nostr: NostrIdentity | null;
  relays: string[];

  setActiveProvider: (id: ProviderId) => void;
  setApiKey: (id: ProviderId, key: string) => void;
  setModel: (id: ProviderId, model: string) => void;
  setTavilyApiKey: (key: string) => void;
  setToolEnabled: (tool: ToolId, enabled: boolean) => void;
  setNostrIdentity: (identity: NostrIdentity | null) => void;
  setRelays: (relays: string[]) => void;

  isConfigured: () => boolean;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      activeProvider: "openrouter",
      apiKeys: { openrouter: "", deepseek: "", zai: "" },
      models: {
        openrouter: PROVIDERS.openrouter.defaultModel,
        deepseek: PROVIDERS.deepseek.defaultModel,
        zai: PROVIDERS.zai.defaultModel,
      },
      tavilyApiKey: "",
      enabledTools: { wikipedia: true, tavily: true },
      nostr: null,
      relays: ["wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.nostr.band"],

      setActiveProvider: (id) => set({ activeProvider: id }),
      setApiKey: (id, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [id]: key } })),
      setModel: (id, model) => set((s) => ({ models: { ...s.models, [id]: model } })),
      setTavilyApiKey: (key) => set({ tavilyApiKey: key }),
      setToolEnabled: (tool, enabled) =>
        set((s) => ({ enabledTools: { ...s.enabledTools, [tool]: enabled } })),
      setNostrIdentity: (identity) => set({ nostr: identity }),
      setRelays: (relays) => set({ relays }),

      isConfigured: () => {
        const s = get();
        return Boolean(s.apiKeys[s.activeProvider]?.trim());
      },
    }),
    { name: "canvas-settings" },
  ),
);
