import { stringify } from "yaml";

import {
  candidateSproutSchema,
  type CandidateSprout,
} from "@/lib/domain/schemas";

export const okfDownloadFilename = "generated-files-agent-experience.md";
export const okfContentType = "text/markdown; charset=utf-8";

export interface OkfDocument {
  frontmatter: Record<string, unknown>;
  body: string;
}

function inline(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function bulletList(values: string[], emptyText: string): string[] {
  return values.length > 0
    ? values.map((value) => `- ${inline(value)}`)
    : [`- ${emptyText}`];
}

export function renderOkfDocument(document: OkfDocument): string {
  const frontmatter = stringify(document.frontmatter, {
    lineWidth: 0,
    sortMapEntries: false,
  }).trimEnd();
  const body = document.body.trim();

  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

export function renderCandidateOkf(
  input: CandidateSprout,
  extensionMetadata: Record<string, unknown> = {},
): string {
  const candidate = candidateSproutSchema.parse(input);
  const frontmatter: Record<string, unknown> = {
    ...extensionMetadata,
    type: candidate.type,
    title: inline(candidate.title),
    description:
      "A Candidate Sprout derived from generated-files evidence and Human Correction.",
    version: "0.1",
    created_at: candidate.provenance.generatedAt,
    memosprout: {
      sprout_id: candidate.id,
      status: candidate.status,
      source: candidate.provenance.source,
      prompt_version: candidate.provenance.promptVersion,
      model_requested: candidate.provenance.modelRequested,
      model_returned: candidate.provenance.modelReturned,
      response_id: candidate.provenance.responseId,
      evidence_ids: candidate.evidence,
    },
  };
  const body = [
    `# ${inline(candidate.title)}`,
    "",
    "## Trigger",
    "",
    inline(candidate.trigger),
    "",
    "## Validated Procedure",
    "",
    ...candidate.procedure.map(
      (procedure, index) => `${index + 1}. ${inline(procedure)}`,
    ),
    "",
    "## Prohibited Action",
    "",
    ...bulletList(candidate.prohibitedActions, "No prohibited action recorded."),
    "",
    "## Scope",
    "",
    ...candidate.scope.paths.map((path) => `- \`${path.replaceAll("`", "\\`")}\``),
    "",
    "## Evidence",
    "",
    `- Failed Agent Run: \`${candidate.evidence.failedAgentRunId}\``,
    `- Human Correction: \`${candidate.evidence.humanCorrectionId}\``,
    `- Corrected outcome: \`${candidate.evidence.correctedOutcomeId}\``,
    `- Deterministic evidence: \`${candidate.evidence.deterministicEvidenceId}\``,
    "",
    "## Uncertainties",
    "",
    ...bulletList(candidate.uncertainties, "No unresolved uncertainty recorded."),
    "",
    "## Recommended Artifact",
    "",
    `\`${candidate.recommendedArtifact}\``,
  ].join("\n");

  return renderOkfDocument({ frontmatter, body });
}
