import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { join, relative } from "node:path";

import { z } from "zod";

import type { CodexEvent } from "@/lib/codex/jsonl";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const phase4V2PreflightOutputSchema = z
  .object({ acknowledgement: z.literal("preflight-complete") })
  .strict();

export const phase4V2PreflightRunSchema = z
  .object({
    version: z.literal("phase4-v2-preflight-evidence-v1"),
    source: z.literal("live"),
    scored: z.literal(false),
    status: z.literal("passed"),
    preflightContractSha256: sha256Schema,
    workerConfigSha256: sha256Schema,
    isolatedRuntimeContractSha256: sha256Schema,
    cli: z
      .object({
        executable: z.literal("codex"),
        version: z.literal("codex-cli 0.144.6"),
        command: z.string().startsWith("codex exec "),
      })
      .strict(),
    worker: z
      .object({
        requestedModel: z.literal("gpt-5.4-mini"),
        resolvedModel: z.literal("gpt-5.4-mini"),
        modelResolutionEvidence: z.literal(
          "bundled-catalog-match-and-successful-explicit-model-turn",
        ),
        reasoningEffort: z.literal("low"),
        reasoningAccepted: z.literal(true),
      })
      .strict(),
    authenticationCategory: z.enum(["auth-file", "environment"]),
    attempts: z
      .array(
        z
          .object({
            attempt: z.number().int().min(1).max(2),
            exitCode: z.number().int(),
            turnCompleted: z.boolean(),
            tracePath: z.string().startsWith("demo/generated-files/evidence/v2/preflight/"),
            traceSha256: sha256Schema,
          })
          .strict(),
      )
      .min(1)
      .max(2),
    completedAttempt: z.number().int().min(1).max(2),
    modelOutcomeRetries: z.literal(0),
    infrastructureRetries: z.number().int().min(0).max(1),
    turn: z
      .object({
        completed: z.literal(true),
        completedTurnCount: z.literal(1),
        threadId: z.string().min(1),
        toolEventCount: z.literal(0),
        output: phase4V2PreflightOutputSchema,
        tokenUsage: z
          .object({
            inputTokens: z.number().int().nonnegative().nullable(),
            cachedInputTokens: z.number().int().nonnegative().nullable(),
            outputTokens: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      })
      .strict(),
    exposure: z
      .object({
        promptSha256: sha256Schema,
        repositoryInspectionRequested: z.literal(false),
        evaluationTaskContentExposed: z.literal(false),
        calibrationTaskContentExposed: z.literal(false),
        scoringAnswersExposed: z.literal(false),
        reservedTaskContentExposed: z.literal(false),
      })
      .strict(),
    repository: z
      .object({
        initialSnapshotSha256: sha256Schema,
        finalSnapshotSha256: sha256Schema,
        byteIdentical: z.literal(true),
        filesCreated: z.literal(0),
        filesChanged: z.literal(0),
        filesDeleted: z.literal(0),
        gitStatusClean: z.literal(true),
      })
      .strict(),
    sensitiveDataScan: z
      .object({
        passed: z.literal(true),
        credentialsFound: z.literal(0),
        machinePathsFound: z.literal(0),
        environmentValuesRecorded: z.literal(0),
      })
      .strict(),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.completedAttempt !== run.attempts.length) {
      context.addIssue({ code: "custom", message: "Completed attempt does not match attempt evidence." });
    }
    if (run.infrastructureRetries !== run.attempts.length - 1) {
      context.addIssue({ code: "custom", message: "Infrastructure retry count is inconsistent." });
    }
    if (run.attempts.slice(0, -1).some((attempt) => attempt.turnCompleted)) {
      context.addIssue({ code: "custom", message: "A completed model turn was retried." });
    }
    const completed = run.attempts.at(-1);
    if (!completed?.turnCompleted || completed.exitCode !== 0) {
      context.addIssue({ code: "custom", message: "Final preflight attempt did not complete successfully." });
    }
    if (run.repository.initialSnapshotSha256 !== run.repository.finalSnapshotSha256) {
      context.addIssue({ code: "custom", message: "Preflight repository snapshot changed." });
    }
  });

export const phase4V2PreflightManifestSchema = z
  .object({
    version: z.literal("phase4-v2-preflight-manifest-v1"),
    source: z.literal("live"),
    scored: z.literal(false),
    files: z
      .array(
        z
          .object({
            path: z.string().startsWith("demo/generated-files/evidence/v2/preflight/"),
            sha256: sha256Schema,
          })
          .strict(),
      )
      .min(2)
      .max(3)
      .refine((files) => new Set(files.map((file) => file.path)).size === files.length),
  })
  .strict();

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function extractPreflightTokenUsage(events: CodexEvent[]) {
  const completed = [...events].reverse().find((event) => event.type === "turn.completed");
  const usage =
    completed && typeof completed.usage === "object" && completed.usage !== null
      ? (completed.usage as Record<string, unknown>)
      : {};
  const value = (input: unknown) =>
    typeof input === "number" && Number.isInteger(input) && input >= 0 ? input : null;
  return {
    inputTokens: value(usage.input_tokens),
    cachedInputTokens: value(usage.cached_input_tokens),
    outputTokens: value(usage.output_tokens),
  };
}

export function countPreflightToolEvents(events: CodexEvent[]): number {
  return events.filter((event) => {
    if (!event.type.startsWith("item.")) return false;
    if (typeof event.item !== "object" || event.item === null) return false;
    const type = (event.item as Record<string, unknown>).type;
    return type !== "agent_message" && type !== "reasoning";
  }).length;
}

export async function snapshotRepositoryWorktree(repositoryRoot: string): Promise<{
  sha256: string;
  files: Map<string, string>;
}> {
  const files = new Map<string, string>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const absolutePath = join(directory, entry.name);
      const path = relative(repositoryRoot, absolutePath);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const metadata = await lstat(absolutePath);
        const content = entry.isSymbolicLink()
          ? Buffer.from(`symlink:${await readlink(absolutePath)}`)
          : await readFile(absolutePath);
        files.set(path, `${metadata.mode}:${sha256(content)}`);
      }
    }
  }
  await visit(repositoryRoot);
  const digest = createHash("sha256");
  for (const [path, value] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    digest.update(path);
    digest.update("\0");
    digest.update(value);
    digest.update("\n");
  }
  return { sha256: digest.digest("hex"), files };
}

export function compareRepositorySnapshots(
  before: Map<string, string>,
  after: Map<string, string>,
): { created: string[]; changed: string[]; deleted: string[] } {
  const created = [...after.keys()].filter((path) => !before.has(path)).sort();
  const deleted = [...before.keys()].filter((path) => !after.has(path)).sort();
  const changed = [...before.keys()]
    .filter((path) => after.has(path) && before.get(path) !== after.get(path))
    .sort();
  return { created, changed, deleted };
}

export const phase4V2PreflightProviderSchema = {
  type: "object",
  properties: {
    acknowledgement: {
      type: "string",
      const: "preflight-complete",
      description: "Exact non-evaluation preflight acknowledgement.",
    },
  },
  required: ["acknowledgement"],
  additionalProperties: false,
} as const;
