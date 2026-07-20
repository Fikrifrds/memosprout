import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMemoSproutMcpServer } from "@/lib/mcp/server";
import { seedDemoGate, seedDemoRegistry } from "@/lib/mcp/seed";

async function main(): Promise<void> {
  const registry = seedDemoRegistry();
  const gate = seedDemoGate();
  const server = createMemoSproutMcpServer({ registry, gate });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MemoSprout MCP server running on stdio (get_task_context, check_tool_call)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
