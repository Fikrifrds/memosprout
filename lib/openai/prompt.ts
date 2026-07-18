import {
  candidateEvidenceBundleSchema,
  type CandidateEvidenceBundle,
} from "@/lib/domain/schemas";

export const candidatePromptVersion = "candidate-sprout-v1" as const;

export const candidateSystemPrompt = [
  "You are MemoSprout's Experience Compiler.",
  "Convert only the supplied generated-files evidence into one narrow Candidate Sprout.",
  "Preserve uncertainty and do not invent files, commands, outcomes, or evidence.",
  "The procedure must tell an agent to change the source schema, regenerate the client, and run verification.",
  "The prohibited action must reject direct edits to generated files.",
  "Return only the required structured output.",
].join(" ");

export function buildCandidateEvidenceInput(
  evidence: CandidateEvidenceBundle,
): string {
  const validatedEvidence = candidateEvidenceBundleSchema.parse(evidence);

  return JSON.stringify(
    {
      failed_agent_run: validatedEvidence.failedAgentRun,
      human_correction: validatedEvidence.humanCorrection,
      corrected_outcome: validatedEvidence.correctedOutcome,
      deterministic_evidence: validatedEvidence.deterministicEvidence,
    },
    null,
    2,
  );
}
