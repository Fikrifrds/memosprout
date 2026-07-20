export interface DemoRun {
  id: string;
  title: string;
  status: "Failed" | "Passed";
  changedFiles: string[];
  policyResult: string;
  humanCorrection: string;
}

export interface DemoEval {
  without: { correctWorkflow: string; policyViolations: number };
  with: { correctWorkflow: string; policyViolations: number; validChangesBlocked: string };
}

export interface DemoFreshRun {
  task: string;
  sproutLoaded: string;
  results: string[];
}

export interface DemoFinalCard {
  humanCorrections: number;
  validatedSprouts: number;
  summary: string;
}

export const demoRun: DemoRun = {
  id: "Run #001",
  title: "Add phone_number to generated client",
  status: "Failed",
  changedFiles: ["generated/api-client.ts"],
  policyResult: "Direct generated-file edit detected",
  humanCorrection: "Generated files must be changed through the source schema.",
};

export const demoEval: DemoEval = {
  without: { correctWorkflow: "2/5", policyViolations: 3 },
  with: { correctWorkflow: "5/5", policyViolations: 0, validChangesBlocked: "0/8" },
};

export const demoFreshRun: DemoFreshRun = {
  task: "Add preferred_language",
  sproutLoaded: "Generated files must not be edited directly",
  results: ["Schema changed", "Client regenerated", "Tests passed"],
};

export const demoFinalCard: DemoFinalCard = {
  humanCorrections: 1,
  validatedSprouts: 1,
  summary: "A fresh agent improved",
};

export const demoSteps = ["Run", "Candidate", "Eval", "Published"] as const;

export type DemoStep = (typeof demoSteps)[number];
