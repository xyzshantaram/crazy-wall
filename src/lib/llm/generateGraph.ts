/**
 * The graph-generation agent loop.
 *
 * Single entry point used by every UI action that needs the LLM to produce
 * graph content (new root, expand, fork, multi-select, recompute). Runs a
 * bounded tool-calling loop (NIP lookups) before parsing the model's final
 * response into a validated LlmGraphResponse.
 */

import { chatCompletion, type ChatMessage } from "../providers/client";
import type { ProviderId } from "../providers/registry";
import { buildSystemPrompt, type SystemPromptOptions } from "./systemPrompt";
import { parseLlmGraphResponse } from "./parseResponse";
import type { LlmGraphResponse } from "./contract";
import { toolToSpec, type ToolDefinition } from "./tools/types";
import { fetchNipTool, searchNipsTool } from "./tools/nipTools";
import { wikipediaSearchTool, wikipediaFetchTool, makeTavilySearchTool } from "./tools/searchTools";
import { askUserTool } from "./tools/askUserTool";
import { useThinkingStore } from "../../stores/thinkingStore";
import { useSettingsStore } from "../../stores/settingsStore";

const MAX_TOOL_STEPS = 8;

const MODE_LABEL: Record<SystemPromptOptions["mode"], string> = {
  new_root: "Thinking through your request…",
  expand: "Elaborating…",
  fork: "Forking into a new wall…",
  multi_select: "Working on the selection…",
  follow_up: "Adding to the wall…",
  recompute: "Recomputing…",
};

export interface GenerateGraphOptions extends SystemPromptOptions {
  providerId: ProviderId;
  apiKey: string;
  model: string;
  userPrompt: string;
  /** chatId for scoping the thinking trace per-chat. */
  chatId: string;
  signal?: AbortSignal;
  onProgress?: (status: string) => void;
}

export async function generateGraph(opts: GenerateGraphOptions): Promise<LlmGraphResponse> {
  const systemPrompt = buildSystemPrompt(opts);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: opts.userPrompt },
  ];

  const { enabledTools, tavilyApiKey } = useSettingsStore.getState();
  const tools: ToolDefinition[] = [
    askUserTool,
    fetchNipTool,
    searchNipsTool,
    ...(enabledTools.wikipedia !== false ? [wikipediaSearchTool, wikipediaFetchTool] : []),
    ...(enabledTools.tavily !== false && tavilyApiKey?.trim()
      ? [makeTavilySearchTool(() => useSettingsStore.getState().tavilyApiKey)]
      : []),
  ];

  const toolSpecs = tools.map(toolToSpec);
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const thinking = useThinkingStore.getState();
  thinking.start(opts.chatId, MODE_LABEL[opts.mode]);

  try {
    let steps = 0;
    while (steps < MAX_TOOL_STEPS) {
      steps++;
      const result = await chatCompletion({
        providerId: opts.providerId,
        apiKey: opts.apiKey,
        model: opts.model,
        messages,
        tools: toolSpecs,
        temperature: 0.4,
        maxTokens: 8000,
        reasoning: true,
        signal: opts.signal,
      });

      if (result.reasoning) {
        useThinkingStore.getState().appendReasoning(opts.chatId, result.reasoning);
      }

      if (result.toolCalls.length === 0) {
        return parseLlmGraphResponse(result.content);
      }

      messages.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.toolCalls,
        reasoning_content: result.reasoning,
      });

      for (const call of result.toolCalls) {
        const tool = toolMap.get(call.function.name);
        let output: string;

        // Pretty-print args for the trace (truncate large values)
        let argsPreview = "";
        try {
          const parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          const entries = Object.entries(parsed).map(([k, v]) => {
            const s = typeof v === "string" ? v : JSON.stringify(v);
            return `${k}: ${s.length > 60 ? s.slice(0, 57) + "…" : s}`;
          });
          argsPreview = entries.join(", ");
        } catch { /* ignore */ }

        // Push a tool_call event before executing
        useThinkingStore.getState().pushEvent(opts.chatId, {
          type: "tool_call",
          toolName: call.function.name,
          content: argsPreview,
        });

        if (!tool) {
          output = `Unknown tool "${call.function.name}"`;
        } else {
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch { /* malformed args */ }
          try {
            output = await tool.execute(args);
          } catch (err) {
            output = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        // Push a tool_result event after execution
        useThinkingStore.getState().pushEvent(opts.chatId, {
          type: "tool_result",
          toolName: call.function.name,
          content: output.length > 400 ? output.slice(0, 397) + "…" : output,
        });

        messages.push({ role: "tool", tool_call_id: call.id, content: output });
      }
    }

    // Final forced call — no tools, guarantees a parseable JSON response.
    const finalResult = await chatCompletion({
      providerId: opts.providerId,
      apiKey: opts.apiKey,
      model: opts.model,
      messages: [...messages, { role: "user", content: "Now produce your final JSON response, with no further tool calls." }],
      temperature: 0.3,
      maxTokens: 8000,
      reasoning: true,
      signal: opts.signal,
    });
    if (finalResult.reasoning) {
      useThinkingStore.getState().appendReasoning(opts.chatId, finalResult.reasoning);
    }
    return parseLlmGraphResponse(finalResult.content);
  } finally {
    thinking.finish(opts.chatId);
  }
}
