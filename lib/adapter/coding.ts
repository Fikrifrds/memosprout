import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";
import { createDeterministicId } from "@/lib/domain/ids";
import {
  correctionRecordSchema,
  type CorrectionRecord,
} from "@/lib/correction/schema";
import type {
  DomainAdapter,
  Oracle,
  OracleResult,
  ProtectionResult,
} from "@/lib/adapter/types";

export interface CodingCorrectionInput {
  scenario: string;
  task: string;
  wrongBehavior: string;
  correctBehavior: string;
  guardedPaths: string[];
  explanation?: string;
  sourceRef?: string;
  submittedBy?: string;
}

export class CodingAdapter implements DomainAdapter {
  readonly domain = "coding";

  constructor(
    private readonly scenarios: Map<string, ScenarioDefinition> = new Map(),
  ) {}

  registerScenario(scenario: ScenarioDefinition): void {
    this.scenarios.set(scenario.id, scenario);
  }

  async captureCorrection(input: unknown): Promise<CorrectionRecord> {
    const codingInput = input as CodingCorrectionInput;
    const correctionId = createDeterministicId(
      "corr",
      `${codingInput.scenario}:${codingInput.wrongBehavior}:${codingInput.correctBehavior}`,
    );
    return correctionRecordSchema.parse({
      correctionId,
      version: 1,
      status: "suggested",
      domain: "coding",
      trigger: {
        keywords: codingInput.guardedPaths,
        entities: [codingInput.scenario],
      },
      wrongPattern: codingInput.wrongBehavior,
      correctAnswer: codingInput.correctBehavior,
      explanation: codingInput.explanation ?? "",
      sourceRef: codingInput.sourceRef ?? "",
      submittedBy: codingInput.submittedBy ?? "unknown",
      submittedAt: new Date().toISOString(),
      validatedBy: null,
      validatedAt: null,
      deprecatedAt: null,
      deprecatedReason: null,
      confirmCount: 0,
    });
  }

  createOracle(correction: CorrectionRecord): Oracle {
    const scenarioId = correction.trigger.entities[0];
    const scenario = scenarioId ? this.scenarios.get(scenarioId) : undefined;
    return {
      id: `coding-oracle:${correction.correctionId}`,
      async evaluate(): Promise<OracleResult> {
        if (!scenario) {
          return {
            passed: false,
            detail: `No scenario registered for "${scenarioId}". Cannot validate correction without a test suite.`,
          };
        }

        const issues: string[] = [];

        const mentionsGuardedPath = scenario.guardedPaths.some(
          (path) =>
            correction.wrongPattern.toLowerCase().includes(path.toLowerCase()) ||
            correction.correctAnswer.toLowerCase().includes(path.toLowerCase()) ||
            correction.trigger.keywords.some((k) => k.toLowerCase().includes(path.toLowerCase())),
        );
        if (!mentionsGuardedPath && scenario.guardedPaths.length > 0) {
          issues.push(
            `Correction does not reference any guarded path (${scenario.guardedPaths.join(", ")}). ` +
            `A coding correction should relate to the protected files.`,
          );
        }

        if (correction.wrongPattern.toLowerCase() === correction.correctAnswer.toLowerCase()) {
          issues.push("Wrong pattern and correct answer are identical. Correction has no effect.");
        }

        if (correction.correctAnswer.length < 10) {
          issues.push("Correct answer is too short to be a meaningful coding instruction.");
        }

        if (issues.length > 0) {
          return {
            passed: false,
            detail: `Validation failed for scenario "${scenario.id}": ${issues.join(" ")}`,
          };
        }

        return {
          passed: true,
          detail:
            `Correction validated against scenario "${scenario.id}" ` +
            `(${scenario.guardedPaths.length} guarded paths, ` +
            `acceptance test: ${scenario.acceptanceTestPath}). ` +
            `Correction references guarded content and provides a distinct correct answer.`,
        };
      },
    };
  }

  buildContext(corrections: CorrectionRecord[]): string {
    if (corrections.length === 0) return "";
    const lines = corrections.map((correction) => {
      const parts = [
        `- Do NOT: ${correction.wrongPattern}`,
        `  Instead: ${correction.correctAnswer}`,
      ];
      if (correction.sourceRef) {
        parts.push(`  Source: ${correction.sourceRef}`);
      }
      return parts.join("\n");
    });
    return [
      "## Validated corrections",
      "",
      "The following corrections have been verified. Apply them:",
      "",
      ...lines,
    ].join("\n");
  }

  checkOutput(output: unknown): ProtectionResult {
    const filePath = output as string;
    for (const scenario of this.scenarios.values()) {
      for (const guardedPath of scenario.guardedPaths) {
        if (
          filePath === guardedPath ||
          filePath.startsWith(`${guardedPath}/`)
        ) {
          return {
            blocked: true,
            warnings: [],
            matchedCorrectionId: null,
            correctAnswer: null,
            sourceRef: `Guarded path in scenario "${scenario.id}"`,
          };
        }
      }
    }
    return {
      blocked: false,
      warnings: [],
      matchedCorrectionId: null,
      correctAnswer: null,
      sourceRef: null,
    };
  }
}
