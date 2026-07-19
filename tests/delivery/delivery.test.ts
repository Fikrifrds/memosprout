import { describe, expect, it } from "vitest";

import {
  AgentsMdAdapter,
  ClaudeCodeAdapter,
  deliveryAdapters,
} from "@/lib/delivery/adapters";
import {
  getTaskContext,
  getTaskContextToolDefinition,
  matchSprouts,
  pathInScope,
} from "@/lib/delivery/get-task-context";
import { SproutRegistry, type ValidatedSprout } from "@/lib/delivery/registry";

const idempotencySprout: ValidatedSprout = {
  sproutId: "sprout_3f7c9a21b8e04d65",
  scenario: "idempotency",
  guidance: "Use the provider event id as the idempotency key.",
  scopePaths: ["src/webhook-handler.ts"],
};

const softDeleteSprout: ValidatedSprout = {
  sproutId: "sprout_8c2e5a71d90f3b64",
  scenario: "soft-delete",
  guidance: "Soft-delete by setting deletedAt; never hard-delete.",
  scopePaths: ["src/user-service.ts"],
};

function makeRegistry(): SproutRegistry {
  const registry = new SproutRegistry();
  registry.add(idempotencySprout);
  registry.add(softDeleteSprout);
  return registry;
}

describe("SproutRegistry", () => {
  it("stores and retrieves sprouts", () => {
    const registry = makeRegistry();
    expect(registry.size).toBe(2);
    expect(registry.get("sprout_3f7c9a21b8e04d65")).toEqual(idempotencySprout);
    expect(registry.list()).toHaveLength(2);
  });

  it("rejects an invalid sprout", () => {
    const registry = new SproutRegistry();
    expect(() =>
      registry.add({ ...idempotencySprout, sproutId: "bad-id" }),
    ).toThrow();
  });
});

describe("path matching", () => {
  it("matches an exact path", () => {
    expect(pathInScope("src/webhook-handler.ts", "src/webhook-handler.ts")).toBe(true);
  });

  it("matches a file under a scoped directory", () => {
    expect(pathInScope("src/webhook-handler.ts", "src")).toBe(true);
  });

  it("does not match an unrelated path", () => {
    expect(pathInScope("src/user-service.ts", "src/webhook-handler.ts")).toBe(false);
  });
});

describe("matchSprouts", () => {
  it("returns the sprout whose scope covers the touched file", () => {
    const matched = matchSprouts(makeRegistry(), ["src/webhook-handler.ts"]);
    expect(matched.map((sprout) => sprout.scenario)).toEqual(["idempotency"]);
  });

  it("returns multiple sprouts when several scopes match", () => {
    const matched = matchSprouts(makeRegistry(), ["src"]);
    expect(matched.map((sprout) => sprout.scenario).sort()).toEqual([
      "idempotency",
      "soft-delete",
    ]);
  });

  it("returns nothing when no scope matches", () => {
    expect(matchSprouts(makeRegistry(), ["README.md"])).toEqual([]);
  });
});

describe("getTaskContext", () => {
  it("returns guidance for the touched files", () => {
    const result = getTaskContext(makeRegistry(), {
      filePaths: ["src/webhook-handler.ts"],
    });
    expect(result.sprouts).toHaveLength(1);
    expect(result.sprouts[0]?.scenario).toBe("idempotency");
    expect(result.sprouts[0]?.guidance).toContain("idempotency key");
  });

  it("rejects an empty filePaths input", () => {
    expect(() => getTaskContext(makeRegistry(), { filePaths: [] })).toThrow();
  });

  it("exposes an MCP tool definition named get_task_context", () => {
    expect(getTaskContextToolDefinition.name).toBe("get_task_context");
    expect(getTaskContextToolDefinition.inputSchema.required).toEqual(["filePaths"]);
  });
});

describe("delivery adapters", () => {
  it("renders validated sprouts to AGENTS.md format", () => {
    const markdown = new AgentsMdAdapter().render([idempotencySprout]);
    expect(markdown).toContain("## MemoSprout: idempotency (sprout_3f7c9a21b8e04d65)");
    expect(markdown).toContain("idempotency key");
  });

  it("renders validated sprouts to Claude Code format", () => {
    const markdown = new ClaudeCodeAdapter().render([softDeleteSprout]);
    expect(markdown).toContain("# MemoSprout validated guidance");
    expect(markdown).toContain("## soft-delete (sprout_8c2e5a71d90f3b64)");
    expect(markdown).toContain("never hard-delete");
  });

  it("renders empty output when there are no sprouts", () => {
    expect(new AgentsMdAdapter().render([])).toBe("");
    expect(new ClaudeCodeAdapter().render([])).toBe("");
  });

  it("registers both adapters by id", () => {
    expect(deliveryAdapters["agents-md"]?.targetFile).toBe("AGENTS.md");
    expect(deliveryAdapters["claude-code"]?.targetFile).toBe("CLAUDE.md");
  });
});
