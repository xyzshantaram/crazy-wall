/**
 * Live model discovery per provider.
 *
 * OpenRouter: fetches the public /models endpoint, filters junk, and buckets
 * into 3 price tiers (Free / Standard / Premium), picking the top 10 per tier
 * ranked by AI intelligence index from benchmarks. Each tier becomes an
 * <optgroup> in the ModelPicker.
 *
 * DeepSeek / Z.AI: their /models endpoint requires a valid key. Falls back to
 * the small curated list in registry.ts if no key or call fails.
 */

import { PROVIDERS, type ProviderId } from "./registry";

export interface ModelOption {
  id: string;
  label: string;
  contextLength?: number;
}

export interface ModelGroup {
  label: string;
  models: ModelOption[];
}

/** Flat list for providers that don't need grouping. */
export type ModelList = ModelOption[];

/** Grouped list for OpenRouter. */
export type GroupedModelList = ModelGroup[];

export type FetchModelsResult = ModelList | GroupedModelList;

export function isGrouped(r: FetchModelsResult): r is GroupedModelList {
  return Array.isArray(r) && r.length > 0 && "models" in (r[0] as object);
}

// ── Cache ─────────────────────────────────────────────────────────────────

interface CacheEntry { at: number; result: FetchModelsResult }
const cache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(providerId: ProviderId, apiKey: string): string {
  return `${providerId}:${apiKey.slice(0, 8)}`;
}

// ── Main entry point ───────────────────────────────────────────────────────

export async function fetchModels(providerId: ProviderId, apiKey: string): Promise<FetchModelsResult> {
  const key = cacheKey(providerId, apiKey);
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const cfg = PROVIDERS[providerId];
  const fallback: ModelList = cfg.suggestedModels.map((id) => ({ id, label: id }));

  if (providerId !== "openrouter" && !apiKey.trim()) return fallback;

  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const raw: Array<Record<string, unknown>> = Array.isArray(json?.data) ? json.data : [];
    if (raw.length === 0) return fallback;

    let result: FetchModelsResult;
    if (providerId === "openrouter") {
      result = buildOpenRouterGroups(raw);
    } else {
      result = raw
        .map((m) => ({
          id: String(m.id ?? ""),
          label: typeof m.name === "string" ? m.name : String(m.id ?? ""),
          contextLength: typeof m.context_length === "number" ? m.context_length : undefined,
        }))
        .filter((m) => m.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    }

    cache[key] = { at: Date.now(), result };
    return result;
  } catch {
    return fallback;
  }
}

// ── OpenRouter grouping ────────────────────────────────────────────────────

const TOP_PER_TIER = 10;

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  benchmarks?: {
    artificial_analysis?: {
      intelligence_index?: number;
    };
  };
  architecture?: {
    output_modalities?: string[];
  };
}

function isUsableTextModel(m: RawModel): boolean {
  // Must produce text
  const out = m.architecture?.output_modalities ?? ["text"];
  if (!out.includes("text")) return false;

  const id = m.id;

  // Drop OpenRouter meta-routers and auto-routers
  if (id.startsWith("openrouter/")) return false;

  // Drop explicit variant suffixes (same model, worse latency/price profile)
  if (/:nitro$/.test(id) || /:floor$/.test(id) || /:turbo$/.test(id) || /:extended$/.test(id)) return false;

  // Drop moderation / embedding / image-gen / TTS / STT models by id pattern
  if (/embed|moderat|whisper|tts|dall-e|stable-diff|flux|imagen|vision-only/i.test(id)) return false;

  // Drop negative-priced routing artefacts
  const prompt = parseFloat(String(m.pricing?.prompt ?? "0"));
  if (prompt < 0) return false;

  return true;
}

function priceTier(m: RawModel): "free" | "standard" | "premium" {
  const prompt = parseFloat(String(m.pricing?.prompt ?? "0")) * 1_000_000; // per 1M tokens
  if (prompt === 0) return "free";
  if (prompt <= 3) return "standard";
  return "premium";
}

function intelligenceScore(m: RawModel): number {
  return m.benchmarks?.artificial_analysis?.intelligence_index ?? -1;
}

function toModelOption(m: RawModel): ModelOption {
  return {
    id: m.id,
    label: m.name ?? m.id,
    contextLength: m.context_length,
  };
}

function buildOpenRouterGroups(raw: Array<Record<string, unknown>>): GroupedModelList {
  const models = raw as unknown as RawModel[];

  const usable = models.filter(isUsableTextModel);

  const byTier: Record<"free" | "standard" | "premium", RawModel[]> = {
    free: [],
    standard: [],
    premium: [],
  };

  for (const m of usable) {
    byTier[priceTier(m)].push(m);
  }

  const pick = (tier: RawModel[]): ModelOption[] =>
    tier
      .sort((a, b) => intelligenceScore(b) - intelligenceScore(a))
      .slice(0, TOP_PER_TIER)
      .map(toModelOption);

  const groups: GroupedModelList = [];

  const free = pick(byTier.free);
  const standard = pick(byTier.standard);
  const premium = pick(byTier.premium);

  if (premium.length > 0) groups.push({ label: "Premium  (>$3 / 1M tokens)", models: premium });
  if (standard.length > 0) groups.push({ label: "Standard  ($0.01–$3 / 1M tokens)", models: standard });
  if (free.length > 0)     groups.push({ label: "Free", models: free });

  return groups;
}
