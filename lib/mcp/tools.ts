import {
  type GetTaskContextInput,
  getTaskContext,
  getTaskContextToolDefinition,
} from "@/lib/delivery/get-task-context";
import type { SproutRegistry } from "@/lib/delivery/registry";
import type { ReflexGate } from "@/lib/reflex/gate";
import { toolCallSchema } from "@/lib/reflex/schema";

export interface McpToolDependencies {
  registry: SproutRegistry;
  gate?: ReflexGate;
}

export const checkToolCallToolDefinition = {
  name: "check_tool_call",
  description:
    "Check whether a proposed tool call violates any validated sprout protection (reflex gate). " +
    "Returns an allow/block/warn decision before the tool call is executed.",
  inputSchema: {
    type: "object",
    properties: {
      tool: { type: "string", description: "The tool name, for example edit_file." },
      targetPath: {
        type: "string",
        description: "The repository-relative path the tool would edit.",
      },
    },
    required: ["tool"],
    additionalProperties: false,
  },
} as const;

export const memoSproutToolDefinitions = [
  getTaskContextToolDefinition,
  checkToolCallToolDefinition,
];

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function jsonResult(value: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function handleGetTaskContext(registry: SproutRegistry, args: unknown): McpToolResult {
  const input = args as GetTaskContextInput;
  return jsonResult(getTaskContext(registry, input));
}

export function handleCheckToolCall(gate: ReflexGate, args: unknown): McpToolResult {
  const call = toolCallSchema.parse(args);
  return jsonResult(gate.evaluate(call));
}

export function handleToolCall(
  name: string,
  args: unknown,
  deps: McpToolDependencies,
): McpToolResult {
  if (name === "get_task_context") {
    return handleGetTaskContext(deps.registry, args);
  }
  if (name === "check_tool_call") {
    if (!deps.gate) {
      throw new Error("The reflex gate is not configured.");
    }
    return handleCheckToolCall(deps.gate, args);
  }
  throw new Error(`Unknown tool: ${name}`);
}
