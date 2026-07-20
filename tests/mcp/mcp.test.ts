import { describe, expect, it } from "vitest";

import { createMemoSproutMcpServer } from "@/lib/mcp/server";
import { seedDemoGate, seedDemoRegistry } from "@/lib/mcp/seed";
import { handleToolCall, memoSproutToolDefinitions } from "@/lib/mcp/tools";

function parseResult(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0]?.text ?? "null");
}

describe("MCP tool definitions", () => {
  it("exposes get_task_context and check_tool_call", () => {
    expect(memoSproutToolDefinitions.map((tool) => tool.name)).toEqual([
      "get_task_context",
      "check_tool_call",
    ]);
  });
});

describe("handleToolCall", () => {
  it("returns the relevant sprout for get_task_context", () => {
    const result = parseResult(
      handleToolCall("get_task_context", { filePaths: ["src/webhook-handler.ts"] }, {
        registry: seedDemoRegistry(),
        gate: seedDemoGate(),
      }),
    ) as { sprouts: Array<{ scenario: string }> };
    expect(result.sprouts.map((sprout) => sprout.scenario)).toEqual(["idempotency"]);
  });

  it("returns the soft-delete sprout for its scope", () => {
    const result = parseResult(
      handleToolCall("get_task_context", { filePaths: ["src/user-service.ts"] }, {
        registry: seedDemoRegistry(),
      }),
    ) as { sprouts: Array<{ scenario: string }> };
    expect(result.sprouts.map((sprout) => sprout.scenario)).toEqual(["soft-delete"]);
  });

  it("blocks a guarded edit via check_tool_call", () => {
    const result = parseResult(
      handleToolCall(
        "check_tool_call",
        { tool: "edit_file", targetPath: "src/payment-store.ts" },
        { registry: seedDemoRegistry(), gate: seedDemoGate() },
      ),
    ) as { allowed: boolean; action: string };
    expect(result.allowed).toBe(false);
    expect(result.action).toBe("block");
  });

  it("allows a non-guarded edit via check_tool_call", () => {
    const result = parseResult(
      handleToolCall(
        "check_tool_call",
        { tool: "edit_file", targetPath: "src/webhook-handler.ts" },
        { registry: seedDemoRegistry(), gate: seedDemoGate() },
      ),
    ) as { allowed: boolean; action: string };
    expect(result.allowed).toBe(true);
    expect(result.action).toBe("allow");
  });

  it("throws for check_tool_call when no gate is configured", () => {
    expect(() =>
      handleToolCall(
        "check_tool_call",
        { tool: "edit_file", targetPath: "src/payment-store.ts" },
        { registry: seedDemoRegistry() },
      ),
    ).toThrow(/reflex gate is not configured/);
  });

  it("throws for an unknown tool", () => {
    expect(() =>
      handleToolCall("nope", {}, { registry: seedDemoRegistry() }),
    ).toThrow(/Unknown tool/);
  });
});

describe("createMemoSproutMcpServer", () => {
  it("creates a configured MCP server", () => {
    const server = createMemoSproutMcpServer({
      registry: seedDemoRegistry(),
      gate: seedDemoGate(),
    });
    expect(server).toBeDefined();
  });
});
