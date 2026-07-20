import { join } from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadSproutStore, saveSproutStore } from "@/lib/delivery/store";
import { createMemoSproutMcpServer } from "@/lib/mcp/server";
import { seedDemoGate, seedDemoRegistry } from "@/lib/mcp/seed";

const defaultStorePath = join(process.cwd(), ".memosprout-local", "sprout-store.json");

async function main(): Promise<void> {
  const storePath = process.env.MEMOSPROUT_SPROUT_STORE?.trim() || defaultStorePath;
  let registry = await loadSproutStore(storePath);
  if (registry.size === 0) {
    registry = seedDemoRegistry();
    await saveSproutStore(registry, storePath);
    console.error(`Seeded sprout store at ${storePath}`);
  } else {
    console.error(`Loaded ${registry.size} sprouts from ${storePath}`);
  }

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
