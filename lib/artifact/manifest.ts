import { createHash } from "node:crypto";

import { z } from "zod";

import { artifactSpecSchema, type ArtifactSpec } from "@/lib/artifact/spec";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const artifactManifestSchema = z
  .object({
    version: z.literal("artifact-manifest-v1"),
    spec: artifactSpecSchema,
    specSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export function renderArtifactManifest(spec: ArtifactSpec): string {
  const validated = artifactSpecSchema.parse(spec);
  const specSha256 = sha256Hex(`${JSON.stringify(validated)}\n`);
  const manifest: ArtifactManifest = {
    version: "artifact-manifest-v1",
    spec: validated,
    specSha256,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export class ArtifactManifestIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactManifestIntegrityError";
  }
}

export function parseArtifactManifest(text: string): ArtifactManifest {
  const manifest = artifactManifestSchema.parse(JSON.parse(text));
  const expected = sha256Hex(`${JSON.stringify(manifest.spec)}\n`);
  if (manifest.specSha256 !== expected) {
    throw new ArtifactManifestIntegrityError(
      "Artifact manifest spec hash does not match its recorded spec.",
    );
  }
  return manifest;
}
