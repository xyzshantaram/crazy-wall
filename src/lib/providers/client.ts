/**
 * Minimal OpenAI-compatible chat completions client, with tool-calling
 * support. Works unmodified against OpenRouter, DeepSeek, and Z.AI — all
 * three expose the same `/chat/completions` shape including the
 * `tools`/`tool_calls` function-calling contract. We don't use the `openai`
 * npm package to keep the bundle small; this is a thin fetch wrapper.
 */

import { PROVIDERS, type ProviderId } from "./registry";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** DeepSeek's thinking-mode chain-of-thought for this assistant message. Required to be
   *  echoed back in subsequent requests whenever this assistant turn made a tool call
   *  (DeepSeek returns a 400 otherwise). Harmlessly ignored by OpenRouter/Z.AI. */
  reasoning_content?: string | null;
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionOptions {
  providerId: ProviderId;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  /** Request a visible reasoning/thinking trace from models that support it.
   *  Normalized across providers: OpenRouter uses `reasoning.effort`, DeepSeek/Z.AI
   *  use `thinking.type`. Ignored (harmlessly) by models/providers that don't support it. */
  reasoning?: boolean;
  /** Force `response_format: {type: "json_object"}` — guarantees syntactically
   *  valid JSON (no markdown code fences, no trailing prose) on OpenRouter,
   *  DeepSeek, and Z.AI alike. Only safe to set on calls that do NOT also pass
   *  `tools` — mixing forced JSON-object output with tool-calling isn't a
   *  combination any of the three providers document as supported, and the
   *  model needs the freedom to return `tool_calls` instead of content on any
   *  turn where tools are offered. `parseLlmGraphResponse`'s code-fence/prose
   *  stripping stays in place regardless as a fallback for providers/models
   *  that don't honor this. */
  jsonMode?: boolean;
  /** AbortSignal to cancel an in-flight request. */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  /** Visible reasoning/thinking trace, if the model/provider returned one.
   *  Sourced from (in order of preference) `message.reasoning`,
   *  `message.reasoning_content`, or a concatenation of
   *  `message.reasoning_details[].text`/`.summary` (OpenRouter's structured form). */
  reasoning: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  /** Token usage for this single request, normalized across the three
   *  providers' slightly different `usage` shapes. null if the provider
   *  omitted the field entirely (shouldn't normally happen, but a response
   *  parse failure elsewhere shouldn't be compounded by a crash here). */
  usage: UsageInfo | null;
  raw: unknown;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Tokens served from a prompt cache at a discounted rate. 0 if the
   *  provider doesn't report this or none were cached. Sourced from
   *  OpenRouter's `prompt_tokens_details.cached_tokens`, DeepSeek's
   *  `prompt_cache_hit_tokens`, or Z.AI's `prompt_tokens_details.cached_tokens`. */
  cachedTokens: number;
  /** Reasoning/thinking tokens included within completionTokens, when the
   *  provider breaks it out separately (currently only OpenRouter's
   *  `completion_tokens_details.reasoning_tokens`). null if not reported. */
  reasoningTokens: number | null;
  /** Actual dollar cost billed for this request, ONLY populated when the
   *  provider itself reports it (currently only OpenRouter's `usage.cost`,
   *  which reflects real billing including any provider-side markup/BYOK
   *  discount). null for DeepSeek/Z.AI — their cost must be estimated
   *  client-side from a hardcoded pricing table instead (see pricingTables.ts),
   *  since neither returns a cost figure in the response body at all. */
  costUsd: number | null;
}


export class ProviderError extends Error {
  status?: number;
  providerId?: ProviderId;
  constructor(message: string, status?: number, providerId?: ProviderId) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.providerId = providerId;
  }
}

export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const cfg = PROVIDERS[opts.providerId];
  const url = `${cfg.baseUrl}${cfg.chatPath}`;

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;
  if (opts.jsonMode && !opts.tools?.length) body.response_format = { type: "json_object" };
  if (opts.reasoning) {
    // OpenRouter's unified `reasoning` param (works for Claude, Gemini, etc. via
    // this gateway) and DeepSeek/Z.AI's `thinking` param are sent together;
    // each provider ignores the field it doesn't recognize.
    body.reasoning = { effort: "medium" };
    body.thinking = { type: "enabled" };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        ...(opts.providerId === "openrouter"
          ? {
              "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://localhost",
              "X-Title": "Crazy Wall",
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ProviderError(
      `Network error contacting ${cfg.label}: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      opts.providerId,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || errJson?.message || JSON.stringify(errJson);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ProviderError(
      `${cfg.label} returned ${res.status}: ${detail || res.statusText}`,
      res.status,
      opts.providerId,
    );
  }

  const json = await res.json();
  const choice = json?.choices?.[0];
  const content = choice?.message?.content ?? "";
  const toolCalls: ToolCall[] = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls : [];
  const finishReason = choice?.finish_reason ?? null;
  const reasoning = extractReasoning(choice?.message);
  const usage = extractUsage(json?.usage);
  return { content, reasoning, toolCalls, finishReason, usage, raw: json };
}

/** Normalizes the three providers' `usage` object shapes into one common
 *  UsageInfo. All three are OpenAI-compatible at the top level
 *  (prompt_tokens/completion_tokens/total_tokens); they diverge on cached-
 *  token and cost reporting:
 *    - OpenRouter: prompt_tokens_details.cached_tokens, cost (real dollars)
 *    - DeepSeek:   prompt_cache_hit_tokens (NOT nested under a details object)
 *    - Z.AI:       prompt_tokens_details.cached_tokens, no cost field
 */
function extractUsage(usage: Record<string, unknown> | undefined): UsageInfo | null {
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : promptTokens + completionTokens;

  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const cachedTokens =
    (typeof promptDetails?.cached_tokens === "number" ? promptDetails.cached_tokens : undefined) ??
    (typeof usage.prompt_cache_hit_tokens === "number" ? usage.prompt_cache_hit_tokens : undefined) ??
    0;

  const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined;
  const reasoningTokens = typeof completionDetails?.reasoning_tokens === "number" ? completionDetails.reasoning_tokens : null;

  const costUsd = typeof usage.cost === "number" ? usage.cost : null;

  return { promptTokens, completionTokens, totalTokens, cachedTokens, reasoningTokens, costUsd };
}

function extractReasoning(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  if (typeof message.reasoning === "string" && message.reasoning.trim()) return message.reasoning;
  if (typeof message.reasoning_content === "string" && message.reasoning_content.trim()) return message.reasoning_content;
  if (Array.isArray(message.reasoning_details)) {
    const parts = message.reasoning_details
      .map((d: Record<string, unknown>) => (typeof d.text === "string" ? d.text : typeof d.summary === "string" ? d.summary : ""))
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n\n");
  }
  return null;
}
