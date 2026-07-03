/**
 * Tool interface + registry for the LLM agent loop.
 *
 * Mirrors tile-studio's `Tool` pattern (description + JSON-schema parameters
 * + async execute). The JSON Schema in `parameters` is what's shown to the
 * model; actual runtime validation/coercion of the model's tool-call
 * arguments is done separately via zod schemas wrapped around each tool's
 * `execute()` (see `withValidatedArgs` in toolRuntime.ts) so malformed args
 * surface a clear error instead of silently coercing to NaN/"undefined".
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export function toolToSpec(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
