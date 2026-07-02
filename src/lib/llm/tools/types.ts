/**
 * Tool interface + registry for the LLM agent loop.
 *
 * Mirrors tile-studio's `Tool` pattern (description + JSON-schema parameters
 * + async execute) but without a Zod dependency -- our tool surface is small
 * enough to hand-write JSON Schema directly.
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
