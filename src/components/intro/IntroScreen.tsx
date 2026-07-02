/**
 * IntroScreen — the pre-canvas state of a chat: a centered chat-like input.
 * On submit, we DON'T navigate to a chat transcript; instead the input bar
 * itself morphs into the first (root) node card while the sidebar slides
 * away, revealing the canvas underneath. See Canvas.tsx for how the morph
 * animation is coordinated (shared layoutId via framer-motion).
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { useSettingsStore } from "../../stores/settingsStore";
import { PROVIDERS, type ProviderId } from "../../lib/providers/registry";
import { useGraphStore } from "../../stores/graphStore";
import { ModelPicker } from "../settings/ModelPicker";

interface Props {
  chatId: string;
  onSubmit: (prompt: string) => void;
  busy: boolean;
}

const SUGGESTIONS = [
  "Plan a 2-week trip to Japan",
  "Compare React, Vue, and Svelte",
  "Build a startup around AI note-taking",
  "Causes of the 2008 financial crisis",
  "How does a nuclear reactor work?",
  "Best budget GPUs right now",
];

export function IntroScreen({ chatId, onSubmit, busy }: Props) {
  const [value, setValue] = useState("");
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const models = useSettingsStore((s) => s.models);
  const setModel = useSettingsStore((s) => s.setModel);
  const setChatProviderModel = useGraphStore((s) => s.setChatProviderModel);

  const handleSubmit = () => {
    if (!value.trim() || busy) return;
    setChatProviderModel(chatId, activeProvider, models[activeProvider]);
    onSubmit(value.trim());
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[560px] flex flex-col items-center gap-6"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-2 mb-1 flex items-center justify-center text-[18px]">
            📌
          </div>
          <h1 className="text-[22px] font-semibold text-ink tracking-tight">What's going on the wall?</h1>
          <p className="text-[13px] text-ink-dim">Throw anything at it. It comes back as a map, not a wall of text.</p>
        </div>

        <motion.div
          layoutId={`node-shell-${chatId}`}
          className="w-full bg-surface border border-border rounded-2xl shadow-panel overflow-hidden"
        >
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="What's the topic? A trip, a decision, a rabbit hole, a plan…"
            rows={3}
            disabled={busy}
            className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              <select
                value={activeProvider}
                onChange={(e) => setActiveProvider(e.target.value as ProviderId)}
                className="flex-shrink-0 bg-surface-2 border border-border-soft rounded-lg px-2 py-1 text-[11.5px] text-ink-dim focus:outline-none"
              >
                {Object.values(PROVIDERS).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <ModelPicker
                providerId={activeProvider}
                apiKey={apiKeys[activeProvider]}
                value={models[activeProvider]}
                onChange={(m) => setModel(activeProvider, m)}
                className="min-w-0 bg-surface-2 border border-border-soft rounded-lg px-2 py-1 text-[11.5px] text-ink-dim focus:outline-none max-w-[140px]"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={busy || !value.trim()}
              className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? "Generating…" : "Generate"}
              {!busy && (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </motion.div>

        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setValue(s)}
              className="px-3 py-1.5 rounded-full text-[12px] text-ink-faint border border-border-soft hover:border-border hover:text-ink-dim transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
