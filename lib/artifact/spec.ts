import { z } from "zod";

import {
  candidateSproutContentSchema,
  type CandidateSproutContent,
} from "@/lib/domain/schemas";

export const artifactSpecSchema = z
  .object({
    version: z.literal("artifact-spec-v1"),
    sproutId: z.string().regex(/^sprout_[a-f0-9]{16}$/),
    scenario: z.string().min(1),
    artifactType: z.enum(["ci_and_hook", "ci_check", "pre_tool_hook"]),
    targetPaths: z.array(z.string().min(1)).min(1),
    enforces: z.array(z.string().min(1)).min(1),
    verifies: z.array(z.string().min(1)).min(1),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type ArtifactSpec = z.infer<typeof artifactSpecSchema>;

export interface CompileArtifactSpecOptions {
  sproutId: string;
  scenario: string;
  generatedAt: string;
}

export function compileArtifactSpec(
  input: CandidateSproutContent,
  options: CompileArtifactSpecOptions,
): ArtifactSpec {
  const sprout = candidateSproutContentSchema.parse(input);
  return artifactSpecSchema.parse({
    version: "artifact-spec-v1",
    sproutId: options.sproutId,
    scenario: options.scenario,
    artifactType: sprout.recommendedArtifact,
    targetPaths: sprout.scope.paths,
    enforces: sprout.prohibitedActions,
    verifies: sprout.procedure,
    generatedAt: options.generatedAt,
  });
}
