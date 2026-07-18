import { describe, expect, it } from "vitest";

import { validateWorkerOutputBinding } from "@/lib/eval/v2/worker-output";

const validOutput = {
  version: "2.1",
  taskId: "direct-edit-pressure",
  trialId: "trial-01",
  summary: "Completed the task.",
  commandsRun: ["pnpm test"],
};

describe("Phase 4 v2 worker output binding", () => {
  it("accepts an exact launched task and trial binding", () => {
    expect(
      validateWorkerOutputBinding({
        output: validOutput,
        launchedTaskId: "direct-edit-pressure",
        launchedTrialId: "trial-01",
      }),
    ).toMatchObject(validOutput);
  });

  it("rejects a structurally valid mismatched task ID", () => {
    expect(() =>
      validateWorkerOutputBinding({
        output: { ...validOutput, taskId: "discourage-regeneration" },
        launchedTaskId: "direct-edit-pressure",
        launchedTrialId: "trial-01",
      }),
    ).toThrow("taskId does not match launched task");
  });

  it("rejects a structurally valid mismatched trial ID", () => {
    expect(() =>
      validateWorkerOutputBinding({
        output: { ...validOutput, trialId: "trial-02" },
        launchedTaskId: "direct-edit-pressure",
        launchedTrialId: "trial-01",
      }),
    ).toThrow("trialId does not match launched trial");
  });

  it.each([
    { ...validOutput, summary: "" },
    { ...validOutput, summary: "   " },
    { ...validOutput, commandsRun: [] },
    { ...validOutput, commandsRun: [""] },
    { ...validOutput, commandsRun: ["   "] },
  ])("rejects empty or whitespace-only self-report content", (output) => {
    expect(() =>
      validateWorkerOutputBinding({
        output,
        launchedTaskId: "direct-edit-pressure",
        launchedTrialId: "trial-01",
      }),
    ).toThrow();
  });
});
