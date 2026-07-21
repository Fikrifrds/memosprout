import { parse, stringify } from "yaml";

import { correctionRecordSchema, type CorrectionRecord } from "@/lib/correction/schema";

export function renderCorrectionMarkdown(correction: CorrectionRecord): string {
  const record = correctionRecordSchema.parse(correction);

  const frontmatter: Record<string, unknown> = {
    correction_id: record.correctionId,
    version: record.version,
    status: record.status,
    domain: record.domain,
    trigger_keywords: record.trigger.keywords,
    trigger_entities: record.trigger.entities,
    wrong_pattern: record.wrongPattern,
    correct_answer: record.correctAnswer,
    explanation: record.explanation,
    source_ref: record.sourceRef,
    submitted_by: record.submittedBy,
    submitted_at: record.submittedAt,
    validated_by: record.validatedBy,
    validated_at: record.validatedAt,
    deprecated_at: record.deprecatedAt,
    deprecated_reason: record.deprecatedReason,
    confirm_count: record.confirmCount,
    source_hash: record.sourceHash,
    expires_at: record.expiresAt,
    last_validated_at: record.lastValidatedAt,
    staleness: record.staleness,
  };

  const yaml = stringify(frontmatter, { lineWidth: 0, sortMapEntries: false }).trimEnd();

  const body = [
    `# Correction: ${record.correctAnswer.slice(0, 80)}`,
    "",
    "## Wrong pattern",
    "",
    record.wrongPattern,
    "",
    "## Correct answer",
    "",
    record.correctAnswer,
    "",
    ...(record.explanation
      ? ["## Explanation", "", record.explanation, ""]
      : []),
    ...(record.sourceRef
      ? ["## Source", "", record.sourceRef, ""]
      : []),
    "## Trigger",
    "",
    ...(record.trigger.keywords.length > 0
      ? [`Keywords: ${record.trigger.keywords.join(", ")}`]
      : []),
    ...(record.trigger.entities.length > 0
      ? [`Entities: ${record.trigger.entities.join(", ")}`]
      : []),
  ].join("\n");

  return `---\n${yaml}\n---\n\n${body}\n`;
}

export function parseCorrectionMarkdown(markdown: string): CorrectionRecord {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("Correction Markdown must start with YAML frontmatter.");
  }

  const raw = parse(match[1]) as Record<string, unknown>;

  return correctionRecordSchema.parse({
    correctionId: raw.correction_id,
    version: raw.version,
    status: raw.status,
    domain: raw.domain,
    trigger: {
      keywords: raw.trigger_keywords ?? [],
      entities: raw.trigger_entities ?? [],
    },
    wrongPattern: raw.wrong_pattern,
    correctAnswer: raw.correct_answer,
    explanation: raw.explanation ?? "",
    sourceRef: raw.source_ref ?? "",
    submittedBy: raw.submitted_by ?? "unknown",
    submittedAt: raw.submitted_at,
    validatedBy: raw.validated_by ?? null,
    validatedAt: raw.validated_at ?? null,
    deprecatedAt: raw.deprecated_at ?? null,
    deprecatedReason: raw.deprecated_reason ?? null,
    confirmCount: raw.confirm_count ?? 0,
    sourceHash: raw.source_hash ?? null,
    expiresAt: raw.expires_at ?? null,
    lastValidatedAt: raw.last_validated_at ?? null,
    staleness: raw.staleness ?? "fresh",
  });
}

export function correctionFilename(correctionId: string): string {
  return `${correctionId}.md`;
}
