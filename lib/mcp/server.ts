import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  type McpToolDependencies,
  handleToolCall,
  memoSproutToolDefinitions,
} from "@/lib/mcp/tools";

export const mcpServerInfo = { name: "memosprout", version: "1.0.0" } as const;

export function createMemoSproutMcpServer(deps: McpToolDependencies): Server {
  const server = new Server(
    { name: mcpServerInfo.name, version: mcpServerInfo.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: memoSproutToolDefinitions as unknown as never,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    try {
      return handleToolCall(name, args ?? {}, deps) as CallToolResult;
    } catch (error) {
      return {
        content: [
          { type: "text", text: error instanceof Error ? error.message : String(error) },
        ],
        isError: true,
      };
    }
  });

  return server;
}
