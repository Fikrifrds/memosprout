import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

export const protectionArtifactPaths = [
  "AGENTS.md",
  "package.json",
  "scripts/check-generated-files.ts",
  "tests/generated-policy.test.ts",
] as const;

export const codexArtifactManifestSchema = z
  .object({
    version: z.literal("1"),
    sourceSproutId: z.string().regex(/^sprout_[a-z0-9_-]+$/),
    guidancePath: z.literal("AGENTS.md"),
    enforcementPath: z.literal("scripts/check-generated-files.ts"),
    testPath: z.literal("tests/generated-policy.test.ts"),
    packageScript: z.literal("check:generated"),
    observational: z.literal(true),
    reusesPureGenerator: z.literal(true),
    comparisonStrategy: z.literal("complete_byte_equality"),
    changedPaths: z.array(z.enum(protectionArtifactPaths)).length(4),
    summary: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.changedPaths).size !== protectionArtifactPaths.length) {
      context.addIssue({
        code: "custom",
        path: ["changedPaths"],
        message: "Codex output must list each allowlisted artifact exactly once.",
      });
    }
  });

export type CodexArtifactManifest = z.infer<typeof codexArtifactManifestSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const acceptanceResultSchema = z
  .object({
    id: z.string().min(1),
    expected: z.enum(["allow", "reject"]),
    observed: z.enum(["allow", "reject"]),
    exitCode: z.number().int(),
    repositoryUnchanged: z.boolean(),
  })
  .strict();

export const protectionRunSchema = z
  .object({
    id: z.string().regex(/^protection_[a-z0-9_-]+$/),
    source: z.enum(["live", "seeded"]),
    scenario: z.literal("generated-files"),
    status: z.literal("accepted"),
    sourceSproutId: z.string().regex(/^sprout_[a-z0-9_-]+$/),
    provenance: z
      .object({
        failedAgentRunId: z.string().regex(/^run_[a-z0-9_-]+$/),
        humanCorrectionId: z.string().regex(/^correction_[a-z0-9_-]+$/),
        correctedOutcomeId: z.string().regex(/^outcome_[a-z0-9_-]+$/),
        deterministicEvidenceId: z.string().regex(/^evidence_[a-z0-9_-]+$/),
        candidateSproutId: z.string().regex(/^sprout_[a-z0-9_-]+$/),
        okfSha256: sha256Schema,
      })
      .strict(),
    codex: z
      .object({
        threadId: z.string().min(1).nullable(),
        cliVersion: z.string().min(1).nullable(),
        command: z.string().min(1),
        startedAt: z.string().datetime({ offset: true }),
        completedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    output: codexArtifactManifestSchema,
    changedPaths: z.array(z.enum(protectionArtifactPaths)).length(4),
    patchSha256: sha256Schema,
    artifactHashes: z.record(z.enum(protectionArtifactPaths), sha256Schema),
    acceptance: z
      .object({
        invalid: z.array(acceptanceResultSchema).length(5),
        valid: z.array(acceptanceResultSchema).length(8),
      })
      .strict(),
    liveSourceRunId: z.string().regex(/^protection_[a-z0-9_-]+$/).nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.source === "live" && (!run.codex.threadId || !run.codex.cliVersion)) {
      context.addIssue({
        code: "custom",
        path: ["codex"],
        message: "Live protection evidence requires Codex thread and CLI provenance.",
      });
    }
    if (run.source === "seeded" && (run.codex.threadId || run.liveSourceRunId === null)) {
      context.addIssue({
        code: "custom",
        path: ["codex"],
        message: "Seeded evidence must reference, but not impersonate, a live run.",
      });
    }
    for (const result of [...run.acceptance.invalid, ...run.acceptance.valid]) {
      if (result.expected !== result.observed) {
        context.addIssue({
          code: "custom",
          path: ["acceptance"],
          message: `Acceptance result ${result.id} did not match its expectation.`,
        });
      }
      if (!result.repositoryUnchanged) {
        context.addIssue({
          code: "custom",
          path: ["acceptance"],
          message: `Protection mutated the repository for ${result.id}.`,
        });
      }
    }
  });

export type ProtectionRun = z.infer<typeof protectionRunSchema>;

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertAllowedChangedPaths(paths: string[]): void {
  const allowed = new Set<string>(protectionArtifactPaths);
  const unique = [...new Set(paths)].sort();
  if (
    unique.length !== protectionArtifactPaths.length ||
    unique.some((path) => !allowed.has(path))
  ) {
    throw new Error(`Codex changed paths outside the artifact allowlist: ${unique.join(", ")}`);
  }
}

export async function validateProtectionArtifacts(options: {
  repositoryRoot: string;
  sourceSproutId: string;
  baselinePackageJson: unknown;
  changedPaths: string[];
}): Promise<Record<(typeof protectionArtifactPaths)[number], string>> {
  assertAllowedChangedPaths(options.changedPaths);
  const packagePath = join(options.repositoryRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
  const baseline = structuredClone(options.baselinePackageJson) as Record<string, unknown>;
  const scripts = packageJson.scripts as Record<string, unknown> | undefined;
  const baselineScripts = baseline.scripts as Record<string, unknown> | undefined;

  if (scripts?.["check:generated"] !== "tsx scripts/check-generated-files.ts") {
    throw new Error("Codex must add the exact check:generated package script.");
  }
  delete scripts["check:generated"];
  packageJson.scripts = scripts;
  baseline.scripts = baselineScripts;
  if (JSON.stringify(packageJson) !== JSON.stringify(baseline)) {
    throw new Error("Codex changed package.json outside the allowed package script.");
  }

  const contents = Object.fromEntries(
    await Promise.all(
      protectionArtifactPaths.map(async (path) => [
        path,
        await readFile(join(options.repositoryRoot, path), "utf8"),
      ]),
    ),
  ) as Record<(typeof protectionArtifactPaths)[number], string>;

  for (const path of [
    "AGENTS.md",
    "scripts/check-generated-files.ts",
    "tests/generated-policy.test.ts",
  ] as const) {
    if (!contents[path].includes(options.sourceSproutId)) {
      throw new Error(`${path} must contain its source Candidate Sprout ID.`);
    }
  }

  return contents;
}
