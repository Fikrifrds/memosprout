import type { CorrectionRecord } from "@/lib/correction/schema";

export interface OracleResult {
  passed: boolean;
  detail: string;
}

export interface Oracle {
  readonly id: string;
  evaluate(correction: CorrectionRecord): Promise<OracleResult>;
}

export interface ProtectionResult {
  blocked: boolean;
  warnings: string[];
  matchedCorrectionId: string | null;
  correctAnswer: string | null;
  sourceRef: string | null;
}

export interface DomainAdapter {
  readonly domain: string;

  captureCorrection(input: unknown): Promise<CorrectionRecord>;

  createOracle(correction: CorrectionRecord): Oracle;

  buildContext(corrections: CorrectionRecord[]): string;

  checkOutput(output: unknown): ProtectionResult;
}
