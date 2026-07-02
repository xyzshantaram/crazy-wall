/**
 * Live model discovery per provider.
 *
 * - OpenRouter: public `/models` list (no auth required) — always fetchable,
 *   cached in-memory for the session. We filter/rank so the newest
 *   Claude (Sonnet 5, Opus 4.8, Haiku 4.5) and DeepSeek models surface first,
 *   with everything else still browsable/searchable below.
 * - DeepSeek / Z.AI: their `/models` endpoint is OpenAI-compatible but
 *   requires a valid API key to list anything, so we only fetch once a key
 *   is present, and fall back to each provider's small curated default list
 *   (registry.ts `suggestedModels`) if the call fails or no key yet.
 *
 * Each provider's list is independent -- no cross-provider deduplication or
 * merging. If the same underlying model is servable through two providers,
 * it simply appears once in each provider's own list.
 */

import { PROVIDERS, type ProviderId } from "./registry";

export interface ModelOption {
  id: string;
  label: string;
  contextLength?: number;
}

// Featured OpenRouter model ids we always want pinned to the top, in order,
// when present in the live list.
const OPENROUTER_FEATURED = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-haiku-4.5",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "openai/gpt-5",
  "google/gemini-2.5-pro",
];

interface Cache {
  [key: string]: { at: number; models: ModelOption[] };
}
const cache: Cache = {};
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(providerId: ProviderId, apiKey: string): string {
  return `${providerId}:${apiKey.slice(0, 8)}`;
}

export async function fetchModels(providerId: ProviderId, apiKey: string): Promise<ModelOption[]> {
  const key = cacheKey(providerId, apiKey);
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.models;

  const cfg = PROVIDERS[providerId];
  const fallback = cfg.suggestedModels.map((id) => ({ id, label: id }));

  // OpenRouter's list endpoint is public; DeepSeek/Z.AI require a key.
  if (providerId !== "openrouter" && !apiKey.trim()) {
    return fallback;
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const raw: Array<Record<string, unknown>> = Array.isArray(json?.data) ? json.data : [];
    if (raw.length === 0) return fallback;

    let models: ModelOption[] = raw
      .map((m) => ({
        id: String(m.id ?? ""),
        label: typeof m.name === "string" ? m.name : String(m.id ?? ""),
        contextLength: typeof m.context_length === "number" ? m.context_length : undefined,
      }))
      .filter((m) => m.id && !m.id.startsWith("~")); // drop OpenRouter's rolling "-latest" aliases; pin explicit versions instead

    if (providerId === "openrouter") {
      models = rankOpenRouterModels(models);
    } else {
      models.sort((a, b) => a.id.localeCompare(b.id));
    }

    cache[key] = { at: Date.now(), models };
    return models;
  } catch {
    return fallback;
  }
}

function rankOpenRouterModels(models: ModelOption[]): ModelOption[] {
  const byId = new Map(models.map((m) => [m.id, m]));
  const featured: ModelOption[] = [];
  for (const id of OPENROUTER_FEATURED) {
    const m = byId.get(id);
    if (m) {
      featured.push(m);
      byId.delete(id);
    }
  }
  const rest = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  return [...featured, ...rest];
}
