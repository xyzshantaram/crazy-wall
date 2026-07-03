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
import { parseLlmGraphResponse, LlmResponseError } from "./parseResponse";
import type { LlmGraphResponse } from "./contract";
import { toolToSpec, type ToolDefinition } from "./tools/types";
import { fetchNipTool, searchNipsTool } from "./tools/nipTools";
import { makeWikipediaSearchTool, makeWikipediaFetchTool, makeWebFetchTool, makeTavilySearchTool } from "./tools/searchTools";
import { ToolCallBudget, CitationPool } from "./tools/toolRuntime";
import { askUserTool } from "./tools/askUserTool";
import { useThinkingStore } from "../../stores/thinkingStore";
import { useSettingsStore } from "../../stores/settingsStore";

const MAX_TOOL_STEPS = 20;
// How many extra "please fix this" round-trips we allow when the model's
// JSON response fails parsing or content-shape validation, before giving up
// and falling back to lenient parsing (per-node fallback widgets / thrown
// error) like before this existed. Keeps the failure path from silently
// shipping obviously-broken content when the model can plausibly just be
// told what's wrong and asked to correct it in the same conversation.
const MAX_REPAIR_ATTEMPTS = 2;

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

/**
 * Parses `content` strictly (rejecting the whole response on ANY node's
 * content-shape or widget-schema issue, not just hard JSON/structure
 * errors). On failure, appends a user-role message describing exactly what
 * was wrong and re-calls the model (no tools) to get a corrected response,
 * up to MAX_REPAIR_ATTEMPTS times. If every attempt fails, falls back to a
 * final lenient parse (per-node fallback widgets instead of rejection) so
 * the user still gets a usable result rather than nothing.
 *
 * `messages` is mutated in place (repair turns are appended) so the caller's
 * conversation stays coherent if this is ever extended to log the exchange.
 */
async function parseWithRepair(
  content: string,
  messages: ChatMessage[],
  citationPool: CitationPool,
  callOpts: { providerId: ProviderId; apiKey: string; model: string; signal?: AbortSignal; chatId: string },
): Promise<LlmGraphResponse> {
  let attemptContent = content;
  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    try {
      return parseLlmGraphResponse(attemptContent, citationPool, { strict: true });
    } catch (err) {
      const message = err instanceof LlmResponseError ? err.message : String(err);
      if (attempt === MAX_REPAIR_ATTEMPTS) {
        // Out of retries — ship whatever we can salvage rather than nothing.
        useThinkingStore.getState().pushEvent(callOpts.chatId, {
          type: "status",
          content: `Giving up on repair after ${MAX_REPAIR_ATTEMPTS} attempt(s); using best-effort fallback.`,
        });
        return parseLlmGraphResponse(attemptContent, citationPool, { strict: false });
      }

      useThinkingStore.getState().pushEvent(callOpts.chatId, {
        type: "status",
        content: `Response had issues, asking the model to fix them (attempt ${attempt + 1}/${MAX_REPAIR_ATTEMPTS})…`,
      });

      messages.push({ role: "assistant", content: attemptContent });
      messages.push({
        role: "user",
        content:
          `Your last response could not be used:\n${message}\n\n` +
          `Return the corrected, complete JSON response (same shape as before), fixing the issue(s) above. No prose, no code fences, no further tool calls.`,
      });

      const repairResult = await chatCompletion({
        providerId: callOpts.providerId,
        apiKey: callOpts.apiKey,
        model: callOpts.model,
        messages,
        temperature: 0.2,
        maxTokens: 8000,
        reasoning: true,
        jsonMode: true,
        signal: callOpts.signal,
      });
      if (repairResult.reasoning) {
        useThinkingStore.getState().appendReasoning(callOpts.chatId, repairResult.reasoning);
      }
      attemptContent = repairResult.content;
    }
  }
  // Unreachable (loop always returns or throws within MAX_REPAIR_ATTEMPTS+1
  // iterations), but keeps TypeScript satisfied about the return type.
  return parseLlmGraphResponse(attemptContent, citationPool, { strict: false });
}


export async function generateGraph(opts: GenerateGraphOptions): Promise<LlmGraphResponse> {
  const systemPrompt = buildSystemPrompt(opts);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: opts.userPrompt },
  ];

  const { enabledTools, tavilyApiKey } = useSettingsStore.getState();
  // Fresh per-turn budget — resets every call to generateGraph (i.e. every
  // prompt submission), independent of MAX_TOOL_STEPS which bounds the
  // whole agent loop's round-trips.
  const budget = new ToolCallBudget();
  // Ground-truth registry of citations backed by URLs actually fetched this
  // turn — the model is told to "copy CITATION_JSON verbatim" but nothing
  // enforced that until now; parseLlmGraphResponse cross-checks against this.
  const citationPool = new CitationPool();
  const tools: ToolDefinition[] = [
    askUserTool,
    makeWebFetchTool(
      () =>
        enabledTools.tavily !== false && !useSettingsStore.getState().preferLocalFetch
          ? useSettingsStore.getState().tavilyApiKey
          : undefined,
      budget,
    ),
    fetchNipTool,
    searchNipsTool,
    ...(enabledTools.wikipedia !== false ? [makeWikipediaSearchTool(budget), makeWikipediaFetchTool(budget)] : []),
    ...(enabledTools.tavily !== false && tavilyApiKey?.trim()
      ? [makeTavilySearchTool(() => useSettingsStore.getState().tavilyApiKey, budget)]
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
        return parseWithRepair(result.content, messages, citationPool, {
          providerId: opts.providerId,
          apiKey: opts.apiKey,
          model: opts.model,
          signal: opts.signal,
          chatId: opts.chatId,
        });
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

        // Register any CITATION_JSON(_LIST) markers in this tool's output as
        // ground truth before the model ever sees/copies them — this is the
        // authoritative record of what was actually fetched this turn.
        citationPool.ingest(output);

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
    // jsonMode is safe here specifically because this call omits `tools`.
    messages.push({ role: "user", content: "Now produce your final JSON response, with no further tool calls." });
    const finalResult = await chatCompletion({
      providerId: opts.providerId,
      apiKey: opts.apiKey,
      model: opts.model,
      messages,
      temperature: 0.3,
      maxTokens: 8000,
      reasoning: true,
      jsonMode: true,
      signal: opts.signal,
    });
    if (finalResult.reasoning) {
      useThinkingStore.getState().appendReasoning(opts.chatId, finalResult.reasoning);
    }
    return parseWithRepair(finalResult.content, messages, citationPool, {
      providerId: opts.providerId,
      apiKey: opts.apiKey,
      model: opts.model,
      signal: opts.signal,
      chatId: opts.chatId,
    });
  } finally {
    thinking.finish(opts.chatId);
  }
}
