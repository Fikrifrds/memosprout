import { SproutRegistry } from "@/lib/delivery/registry";
import { ReflexGate, compileReflexRule } from "@/lib/reflex/gate";
import { idempotencyGuardedPaths } from "@/lib/scenario/idempotency";
import { softDeleteGuardedPaths } from "@/lib/scenario/soft-delete";

export const idempotencySproutId = "sprout_3f7c9a21b8e04d65";
export const softDeleteSproutId = "sprout_8c2e5a71d90f3b64";

export function seedDemoRegistry(): SproutRegistry {
  const registry = new SproutRegistry();
  registry.add({
    sproutId: idempotencySproutId,
    scenario: "idempotency",
    guidance:
      "Use the provider event id as the idempotency key. Protect terminal order states. " +
      "Do not process the same event id twice.",
    scopePaths: ["src/webhook-handler.ts"],
  });
  registry.add({
    sproutId: softDeleteSproutId,
    scenario: "soft-delete",
    guidance:
      "Soft-delete by setting deletedAt; never hard-delete a user record. " +
      "Exclude soft-deleted records from active listings.",
    scopePaths: ["src/user-service.ts"],
  });
  return registry;
}

export function seedDemoGate(): ReflexGate {
  const gate = new ReflexGate();
  gate.addRule(
    compileReflexRule({
      sproutId: idempotencySproutId,
      scenario: "idempotency",
      guardedPaths: [...idempotencyGuardedPaths],
    }),
  );
  gate.addRule(
    compileReflexRule({
      sproutId: softDeleteSproutId,
      scenario: "soft-delete",
      guardedPaths: [...softDeleteGuardedPaths],
    }),
  );
  return gate;
}
