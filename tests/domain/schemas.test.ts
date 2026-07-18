import { describe, expect, it } from "vitest";

import {
  candidateEvidenceBundleSchema,
  candidateSproutSchema,
} from "@/lib/domain/schemas";
import {
  createSeededCandidate,
  loadSeededEvidence,
} from "@/lib/openai/extract-candidate";

describe("Phase 2 domain schemas", () => {
  it("validates the complete evidence bundle and Candidate Sprout", async () => {
    const evidence = await loadSeededEvidence();
    const candidate = createSeededCandidate(evidence);

    expect(candidateEvidenceBundleSchema.parse(evidence)).toEqual(evidence);
    expect(candidateSproutSchema.parse(candidate)).toEqual(candidate);
  });

  it("rejects a Candidate that omits deterministic evidence provenance", async () => {
    const candidate = createSeededCandidate(await loadSeededEvidence());
    const invalidCandidate = structuredClone(candidate) as Record<string, unknown>;
    const evidence = invalidCandidate.evidence as Record<string, unknown>;
    delete evidence.deterministicEvidenceId;

    expect(() => candidateSproutSchema.parse(invalidCandidate)).toThrow();
  });

  it("rejects evidence whose correction references another Agent Run", async () => {
    const evidence = structuredClone(await loadSeededEvidence());
    evidence.humanCorrection.agentRunId = "run_unrelated_001";

    expect(() => candidateEvidenceBundleSchema.parse(evidence)).toThrow(
      "Human Correction must reference the failed Agent Run.",
    );
  });

  it("prevents seeded Candidates from claiming live model provenance", async () => {
    const candidate = structuredClone(
      createSeededCandidate(await loadSeededEvidence()),
    );
    candidate.provenance.modelReturned = "gpt-5.6-sol";
    candidate.provenance.responseId = "resp_not_live";

    expect(() => candidateSproutSchema.parse(candidate)).toThrow(
      "Seeded Candidates must not claim live response provenance.",
    );
  });
});
