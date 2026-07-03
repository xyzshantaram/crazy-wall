/**
 * Hardcoded per-1M-token pricing for DeepSeek and Z.AI, used to ESTIMATE cost
 * client-side since neither provider returns a `cost` field in their `usage`
 * object the way OpenRouter does (see client.ts's extractUsage — OpenRouter's
 * usage.cost is real billed dollars and needs no estimation).
 *
 * MAINTENANCE: these prices are a point-in-time snapshot and WILL drift as
 * the providers change them. Re-check both source pages below periodically
 * (a good rule of thumb: monthly) and bump PRICING_LAST_UPDATED whenever you
 * update a rate. The Context Usage modal surfaces PRICING_LAST_UPDATED to
 * the user directly ("Pricing as of <date>, may not reflect current rates")
 * so staleness is visible, not just a code comment nobody reads.
 *
 * Source of truth:
 *   DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 *   Z.AI:     https://docs.z.ai/guides/overview/pricing
 *
 * If a future agent/maintainer is touching this file for an unrelated
 * reason and notices PRICING_LAST_UPDATED is more than ~60 days old, please
 * take two minutes to refetch both pages above and update the tables.
 */

export const PRICING_LAST_UPDATED = "2026-07-03";

export interface ModelRate {
  /** $ per 1M input/prompt tokens that did NOT hit the cache. */
  inputPerM: number;
  /** $ per 1M input/prompt tokens that DID hit the cache (discounted rate).
   *  Equal to inputPerM for models/providers with no separate cache-hit price. */
  cachedInputPerM: number;
  /** $ per 1M output/completion tokens. */
  outputPerM: number;
}

// DeepSeek — https://api-docs.deepseek.com/quick_start/pricing (checked 2026-07-03)
const DEEPSEEK_RATES: Record<string, ModelRate> = {
  "deepseek-v4-pro": { inputPerM: 0.435, cachedInputPerM: 0.003625, outputPerM: 0.87 },
  "deepseek-v4-flash": { inputPerM: 0.14, cachedInputPerM: 0.0028, outputPerM: 0.28 },
  // Deprecated aliases (still routable until 2026/07/24 per DeepSeek's own docs) —
  // map to v4-flash's non-thinking/thinking modes, same underlying rates.
  "deepseek-chat": { inputPerM: 0.14, cachedInputPerM: 0.0028, outputPerM: 0.28 },
  "deepseek-reasoner": { inputPerM: 0.14, cachedInputPerM: 0.0028, outputPerM: 0.28 },
};

// Z.AI — https://docs.z.ai/guides/overview/pricing (checked 2026-07-03), text models only
// (this app never calls Z.AI's vision/image/video/audio models).
const ZAI_RATES: Record<string, ModelRate> = {
  "glm-5.2": { inputPerM: 1.4, cachedInputPerM: 0.26, outputPerM: 4.4 },
  "glm-5.1": { inputPerM: 1.4, cachedInputPerM: 0.26, outputPerM: 4.4 },
  "glm-5": { inputPerM: 1.0, cachedInputPerM: 0.2, outputPerM: 3.2 },
  "glm-5-turbo": { inputPerM: 1.2, cachedInputPerM: 0.24, outputPerM: 4.0 },
  "glm-4.7": { inputPerM: 0.6, cachedInputPerM: 0.11, outputPerM: 2.2 },
  "glm-4.7-flashx": { inputPerM: 0.07, cachedInputPerM: 0.01, outputPerM: 0.4 },
  "glm-4.7-flash": { inputPerM: 0, cachedInputPerM: 0, outputPerM: 0 },
  "glm-4.6": { inputPerM: 0.6, cachedInputPerM: 0.11, outputPerM: 2.2 },
  "glm-4.5": { inputPerM: 0.6, cachedInputPerM: 0.11, outputPerM: 2.2 },
  "glm-4.5-x": { inputPerM: 2.2, cachedInputPerM: 0.45, outputPerM: 8.9 },
  "glm-4.5-air": { inputPerM: 0.2, cachedInputPerM: 0.03, outputPerM: 1.1 },
  "glm-4.5-airx": { inputPerM: 1.1, cachedInputPerM: 0.22, outputPerM: 4.5 },
  "glm-4.5-flash": { inputPerM: 0, cachedInputPerM: 0, outputPerM: 0 },
  "glm-4-32b-0414-128k": { inputPerM: 0.1, cachedInputPerM: 0.1, outputPerM: 0.1 },
};

const TABLES: Record<"deepseek" | "zai", Record<string, ModelRate>> = {
  deepseek: DEEPSEEK_RATES,
  zai: ZAI_RATES,
};

/** Looks up a hardcoded rate for a DeepSeek/Z.AI model id (case-insensitive,
 *  since Z.AI's model ids in requests/responses aren't always consistently
 *  cased). Returns null for OpenRouter (never estimated — it reports real
 *  cost) or an unrecognized model id (new/renamed model this table hasn't
 *  been updated for yet — better to show nothing than a wrong number). */
export function getModelRate(providerId: string, modelId: string): ModelRate | null {
  if (providerId !== "deepseek" && providerId !== "zai") return null;
  const table = TABLES[providerId];
  return table[modelId.toLowerCase()] ?? null;
}

/** Estimates cost in USD from raw token counts + a rate. Cached input tokens
 *  are billed at the (usually much cheaper) cachedInputPerM rate; the rest
 *  of the input at inputPerM. */
export function estimateCost(
  rate: ModelRate,
  promptTokens: number,
  cachedTokens: number,
  completionTokens: number,
): number {
  const uncachedInput = Math.max(0, promptTokens - cachedTokens);
  return (
    (uncachedInput * rate.inputPerM) / 1_000_000 +
    (cachedTokens * rate.cachedInputPerM) / 1_000_000 +
    (completionTokens * rate.outputPerM) / 1_000_000
  );
}
