/**
 * ask_user tool — lets the LLM pause the agent loop and ask the user a
 * clarifying question, with optional predefined choices and/or a freeform
 * text input. The user's response is returned as a plain string and injected
 * back into the conversation as a tool result, allowing the model to continue
 * with richer context.
 *
 * Use this when the request is ambiguous and a quick clarification would
 * meaningfully change the output (e.g. "Which city are you flying from?",
 * "What's your budget?", "Expert or beginner level?"). Don't use it for
 * questions you can answer yourself or that don't affect the output.
 */

import type { ToolDefinition } from "./types";
import { requestAskUser } from "./askUserQueue";

export const askUserTool: ToolDefinition = {
  name: "ask_user",
  description:
    "Pause and ask the user a clarifying question before continuing. Use when the request is genuinely ambiguous and the answer would significantly change what you produce. Do NOT use for questions you can answer from context, or just to seem thorough — only ask when the answer materially affects the output. Returns the user's answer as a string.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to ask. Should be short, direct, and specific. One question at a time.",
      },
      choices: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of 2–5 predefined answer choices to offer as buttons. Omit or use [] if any freeform answer is equally valid.",
      },
      allow_freeform: {
        type: "boolean",
        description:
          "Whether to show a text input so the user can type their own answer instead of (or in addition to) picking a choice. Default true.",
      },
    },
    required: ["question"],
  },
  execute: async (args) => {
    const question = String(args.question ?? "").trim();
    if (!question) return "Error: no question provided.";

    const rawChoices = Array.isArray(args.choices) ? args.choices : [];
    const choices = rawChoices.map((c) => String(c)).filter(Boolean).slice(0, 8);
    const allowFreeform = args.allow_freeform !== false; // default true

    const answer = await requestAskUser({ question, choices, allowFreeform });
    return answer || "(no answer provided)";
  },
};
