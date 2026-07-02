/**
 * Provider registry — OpenRouter, DeepSeek, and Z.AI are all OpenAI-compatible
 * `/chat/completions` HTTP APIs. One client implementation, three configs.
 */

export type ProviderId = "openrouter" | "deepseek" | "zai";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  /** Path appended to baseUrl for chat completions. */
  chatPath: string;
  defaultModel: string;
  /** A short curated list shown in the model picker; user can also type a custom id. */
  suggestedModels: string[];
  keyPlaceholder: string;
  keyHelpUrl: string;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    chatPath: "/chat/completions",
    defaultModel: "anthropic/claude-sonnet-5",
    suggestedModels: [
      "anthropic/claude-sonnet-5",
      "anthropic/claude-opus-4.8",
      "anthropic/claude-haiku-4.5",
      "openai/gpt-5",
      "google/gemini-2.5-pro",
      "deepseek/deepseek-v4-pro",
    ],
    keyPlaceholder: "sk-or-v1-...",
    keyHelpUrl: "https://openrouter.ai/keys",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    chatPath: "/chat/completions",
    defaultModel: "deepseek-v4-pro",
    suggestedModels: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
    keyPlaceholder: "sk-...",
    keyHelpUrl: "https://platform.deepseek.com/api_keys",
  },
  zai: {
    id: "zai",
    label: "Z.AI",
    baseUrl: "https://api.z.ai/api/paas/v4",
    chatPath: "/chat/completions",
    defaultModel: "glm-5.2",
    suggestedModels: ["glm-5.2", "glm-4.6", "glm-4.5-air"],
    keyPlaceholder: "your-api-key",
    keyHelpUrl: "https://z.ai/manage-apikey/apikey-list",
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);
