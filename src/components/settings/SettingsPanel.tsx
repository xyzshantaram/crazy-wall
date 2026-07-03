/**
 * Settings modal: per-provider API keys + model selection, active provider,
 * Nostr login/relays.
 */

import { useState } from "react";
import { PROVIDERS, type ProviderId } from "../../lib/providers/registry";
import { useSettingsStore } from "../../stores/settingsStore";
import { loginWithNip07, logoutNostr } from "../../lib/lua/nostrAuth";
import { hasNip07 } from "../../lib/lua/adapter";
import { toast } from "../../stores/toastStore";
import { ModelPicker } from "./ModelPicker";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const models = useSettingsStore((s) => s.models);
  const setModel = useSettingsStore((s) => s.setModel);
  const nostr = useSettingsStore((s) => s.nostr);
  const relays = useSettingsStore((s) => s.relays);
  const setRelays = useSettingsStore((s) => s.setRelays);
  const tavilyApiKey = useSettingsStore((s) => s.tavilyApiKey);
  const setTavilyApiKey = useSettingsStore((s) => s.setTavilyApiKey);
  const preferLocalFetch = useSettingsStore((s) => s.preferLocalFetch);
  const setPreferLocalFetch = useSettingsStore((s) => s.setPreferLocalFetch);

  const [relaysText, setRelaysText] = useState(relays.join("\n"));
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = async () => {
    setLoggingIn(true);
    try {
      await loginWithNip07();
      toast.push("Signed in with Nostr", "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : String(err), "danger");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[92vw] max-h-[85vh] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden flex flex-col animate-fade-in-up"
      >
        <div className="px-5 pt-4 pb-3 border-b border-border-soft flex items-center justify-between flex-shrink-0">
          <h3 className="text-[15px] font-semibold text-ink">Settings</h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 flex flex-col gap-6">
          <section>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-2.5">AI Providers</div>
            <div className="flex flex-col gap-3">
              {Object.values(PROVIDERS).map((p) => (
                <div key={p.id} className="bg-surface-2 border border-border-soft rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="activeProvider"
                        checked={activeProvider === p.id}
                        onChange={() => setActiveProvider(p.id as ProviderId)}
                        className="accent-[#7c6cff]"
                      />
                      <span className="text-[13px] font-medium text-ink">{p.label}</span>
                    </label>
                    <a href={p.keyHelpUrl} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">
                      Get API key
                    </a>
                  </div>
                  <input
                    type="password"
                    value={apiKeys[p.id]}
                    onChange={(e) => setApiKey(p.id as ProviderId, e.target.value)}
                    placeholder={p.keyPlaceholder}
                    className="w-full bg-surface-3 border border-border-soft rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 mb-2 font-mono"
                  />
                  <ModelPicker
                    providerId={p.id as ProviderId}
                    apiKey={apiKeys[p.id as ProviderId]}
                    value={models[p.id as ProviderId]}
                    onChange={(m) => setModel(p.id as ProviderId, m)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-2.5">Search</div>
            <div className="bg-surface-2 border border-border-soft rounded-xl p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-ink">Tavily Search</div>
                  <div className="text-[11.5px] text-ink-faint">Optional — enables web search. Wikipedia works without a key. Toggle tools per-prompt in the chat bar.</div>
                </div>
                <a href="https://app.tavily.com" target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline flex-shrink-0 ml-3">
                  Get free key
                </a>
              </div>
              <input
                type="password"
                value={tavilyApiKey}
                onChange={(e) => setTavilyApiKey(e.target.value)}
                placeholder="tvly-..."
                className="w-full bg-surface-3 border border-border-soft rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 font-mono"
              />
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-2.5">Page fetching</div>
            <div className="bg-surface-2 border border-border-soft rounded-xl p-3.5">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-[13px] font-medium text-ink">Use local fetcher instead of Tavily Extract</div>
                  <div className="text-[11.5px] text-ink-faint">
                    By default, when a Tavily key is set, web_fetch uses Tavily Extract for cleaner results on
                    JS-heavy pages, tables, and PDFs. Enable this to always use the local Readability-based fetcher
                    (via a public CORS proxy) instead — avoids spending Tavily credits and keeps fetched URLs off
                    Tavily's servers, at the cost of less reliable extraction on complex pages.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferLocalFetch}
                  onChange={(e) => setPreferLocalFetch(e.target.checked)}
                  className="accent-[#7c6cff] flex-shrink-0 w-4 h-4"
                />
              </label>
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-2.5">Nostr identity</div>
            <div className="bg-surface-2 border border-border-soft rounded-xl p-3.5">
              {nostr ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] text-ink font-medium">Signed in</div>
                    <div className="text-[11.5px] text-ink-faint font-mono">{nostr.pubkey.slice(0, 16)}…</div>
                  </div>
                  <button
                    onClick={() => {
                      logoutNostr();
                      toast.push("Signed out", "default");
                    }}
                    className="px-3 py-1.5 rounded-lg text-[12.5px] text-ink-dim hover:bg-white/6 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] text-ink font-medium">Not signed in</div>
                    <div className="text-[11.5px] text-ink-faint">
                      {hasNip07() ? "Extension detected" : "Install a NIP-07 extension (Alby, nos2x) to enable Nostr dashboards"}
                    </div>
                  </div>
                  <button
                    onClick={handleLogin}
                    disabled={loggingIn || !hasNip07()}
                    className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40 transition-colors"
                  >
                    {loggingIn ? "Signing in…" : "Sign in"}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-2.5">Relays</div>
            <textarea
              value={relaysText}
              onChange={(e) => setRelaysText(e.target.value)}
              onBlur={() => setRelays(relaysText.split("\n").map((r) => r.trim()).filter(Boolean))}
              rows={4}
              className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2 text-[12px] text-ink-dim font-mono focus:outline-none focus:border-accent/50 resize-none"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
