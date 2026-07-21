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
        return {
          passed: true,
          detail: `Correction targets scenario "${scenario.id}" with ${scenario.guardedPaths.length} guarded paths.`,
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
