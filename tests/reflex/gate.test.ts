import { describe, expect, it } from "vitest";

import { ReflexGate, compileReflexRule } from "@/lib/reflex/gate";

const sproutId = "sprout_3f7c9a21b8e04d65";
const guardedPaths = ["src/payment-store.ts", "src/types.ts", "tests/idempotency.acceptance.test.ts"];

function makeGate(action: "block" | "warn" = "block"): ReflexGate {
  const gate = new ReflexGate();
  gate.addRule(
    compileReflexRule({ sproutId, scenario: "idempotency", guardedPaths, action }),
  );
  return gate;
}

describe("compileReflexRule", () => {
  it("compiles a rule protecting the guarded paths", () => {
    const rule = compileReflexRule({ sproutId, scenario: "idempotency", guardedPaths });
    expect(rule.protectedPaths).toEqual(guardedPaths);
    expect(rule.action).toBe("block");
    expect(rule.ruleId).toMatch(/^reflex_[a-f0-9]{16}$/);
  });
});

describe("ReflexGate.evaluate", () => {
  it("blocks an edit to a guarded file", () => {
    const decision = makeGate().evaluate({
      tool: "edit_file",
      targetPath: "src/payment-store.ts",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe("block");
    expect(decision.matchedRuleId).toMatch(/^reflex_/);
  });

  it("blocks an edit to the held-out acceptance test", () => {
    const decision = makeGate().evaluate({
      tool: "write_file",
      targetPath: "tests/idempotency.acceptance.test.ts",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe("block");
  });

  it("allows an edit to a non-guarded file", () => {
    const decision = makeGate().evaluate({
      tool: "edit_file",
      targetPath: "src/webhook-handler.ts",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe("allow");
    expect(decision.matchedRuleId).toBeNull();
  });

  it("allows a non-file-edit tool", () => {
    const decision = makeGate().evaluate({
      tool: "run_command",
      targetPath: "src/payment-store.ts",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe("allow");
  });

  it("warns instead of blocking when the rule action is warn", () => {
    const decision = makeGate("warn").evaluate({
      tool: "edit_file",
      targetPath: "src/payment-store.ts",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe("warn");
    expect(decision.matchedRuleId).toMatch(/^reflex_/);
  });
});
