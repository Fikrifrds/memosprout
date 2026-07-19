import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { TestRunner } from "@/lib/eval/engine/oracle";
import {
  assertScenarioIsolation,
  evaluateScenarioControl,
  prepareScenarioRepository,
} from "@/lib/eval/engine/runner";
import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";
import { idempotencyScenario, idempotencyScenarioPaths } from "@/lib/scenario/idempotency";
import { softDeleteScenario, softDeleteScenarioPaths } from "@/lib/scenario/soft-delete";

function vitestRunner(testFile: string): TestRunner {
  return (repositoryRoot) =>
    new Promise((resolvePromise) => {
      const child = spawn("pnpm", ["exec", "vitest", "run", testFile], {
        cwd: repositoryRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
      child.on("error", (error) =>
        resolvePromise({ exitCode: -1, stdout, stderr: `${stderr}\n${error.message}` }),
      );
      child.on("close", (code) => resolvePromise({ exitCode: code ?? -1, stdout, stderr }));
    });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const correctIdempotentHandler = `import type { PaymentStore } from "./payment-store";
import type { OrderStatus, PaymentEvent } from "./types";

const statusByType: Record<PaymentEvent["type"], OrderStatus> = {
  payment_pending: "pending",
  payment_succeeded: "paid",
  payment_failed: "failed",
};

export function handlePaymentEvent(store: PaymentStore, event: PaymentEvent): void {
  if (store.hasProcessedEvent(event.eventId)) {
    return;
  }
  store.markEventProcessed(event.eventId);
  const existing = store.getOrder(event.orderId);
  if (existing?.status === "paid" || existing?.status === "failed") {
    return;
  }
  const nextStatus = statusByType[event.type];
  store.upsertOrder({ orderId: event.orderId, status: nextStatus, amountCents: event.amountCents });
  if (nextStatus === "paid") {
    store.recordCharge(event.orderId, event.amountCents);
  }
}
`;

const correctSoftDeleteService = `import type { UserStore } from "./user-store";
import type { User } from "./types";

export function deleteUser(store: UserStore, id: string): void {
  if (!store.getById(id)) {
    return;
  }
  store.setDeletedAt(id, new Date().toISOString());
}

export function listActiveUsers(store: UserStore): User[] {
  return store.all().filter((user) => user.deletedAt === null);
}
`;

const scenarios: ScenarioDefinition[] = [idempotencyScenario, softDeleteScenario];

describe("validation engine reusability", () => {
  it("asserts protection isolation for every scenario", async () => {
    for (const scenario of scenarios) {
      await expect(assertScenarioIsolation(scenario)).resolves.toBeUndefined();
    }
  });

  it("exposes protected-only paths only when protection is requested", async () => {
    for (const scenario of scenarios) {
      for (const exposeProtection of [false, true]) {
        const { repositoryRoot, outputSchemaPath } = await prepareScenarioRepository({
          scenario,
          exposeProtection,
        });
        for (const path of scenario.protectedOnlyPaths) {
          expect(await pathExists(join(repositoryRoot, path))).toBe(exposeProtection);
        }
        expect(await pathExists(outputSchemaPath)).toBe(true);
      }
    }
  });

  it("accepts a correct idempotency implementation through the engine", async () => {
    const control = await evaluateScenarioControl({
      scenario: idempotencyScenario,
      controlId: "correct-idempotent-handler",
      implementationPath: idempotencyScenarioPaths.handler,
      correctSource: correctIdempotentHandler,
      runAcceptanceTests: vitestRunner(idempotencyScenario.acceptanceTestPath),
    });
    expect(control.observed).toBe("allow");
    expect(control.passed).toBe(true);
  });

  it("accepts a correct soft-delete implementation through the engine", async () => {
    const control = await evaluateScenarioControl({
      scenario: softDeleteScenario,
      controlId: "correct-soft-delete-service",
      implementationPath: softDeleteScenarioPaths.service,
      correctSource: correctSoftDeleteService,
      runAcceptanceTests: vitestRunner(softDeleteScenario.acceptanceTestPath),
    });
    expect(control.observed).toBe("allow");
    expect(control.passed).toBe(true);
  });
});
