import { describe, expect, it } from "vitest";

import {
  ArtifactManifestIntegrityError,
  parseArtifactManifest,
  renderArtifactManifest,
} from "@/lib/artifact/manifest";
import { compileArtifactSpec } from "@/lib/artifact/spec";
import type { CandidateSproutContent } from "@/lib/domain/schemas";

const idempotencySprout: CandidateSproutContent = {
  title: "Payment events must be processed idempotently",
  type: "Agent Experience",
  trigger: "A task implements the payment webhook handler.",
  procedure: [
    "Use the provider event id as the idempotency key.",
    "Protect terminal order states.",
  ],
  prohibitedActions: ["Do not process the same event id twice."],
  scope: { paths: ["src/webhook-handler.ts"] },
  uncertainties: [],
  recommendedArtifact: "ci_and_hook",
};

const softDeleteSprout: CandidateSproutContent = {
  title: "Users must be soft-deleted",
  type: "Agent Experience",
  trigger: "A task implements user deletion.",
  procedure: [
    "Set deletedAt instead of removing the record.",
    "Exclude soft-deleted records from active listings.",
  ],
  prohibitedActions: ["Do not hard-delete a user record."],
  scope: { paths: ["src/user-service.ts"] },
  uncertainties: [],
  recommendedArtifact: "ci_check",
};

const specOptions = {
  sproutId: "sprout_3f7c9a21b8e04d65",
  scenario: "idempotency",
  generatedAt: "2026-07-20T00:00:00.000Z",
};

describe("compileArtifactSpec", () => {
  it("compiles the idempotency sprout into an artifact spec", () => {
    const spec = compileArtifactSpec(idempotencySprout, specOptions);
    expect(spec.artifactType).toBe("ci_and_hook");
    expect(spec.targetPaths).toEqual(["src/webhook-handler.ts"]);
    expect(spec.enforces).toEqual(["Do not process the same event id twice."]);
    expect(spec.verifies).toEqual(idempotencySprout.procedure);
    expect(spec.scenario).toBe("idempotency");
  });

  it("compiles the soft-delete sprout into an artifact spec", () => {
    const spec = compileArtifactSpec(softDeleteSprout, {
      sproutId: "sprout_8c2e5a71d90f3b64",
      scenario: "soft-delete",
      generatedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(spec.artifactType).toBe("ci_check");
    expect(spec.targetPaths).toEqual(["src/user-service.ts"]);
    expect(spec.enforces).toEqual(["Do not hard-delete a user record."]);
  });

  it("rejects invalid sprout content", () => {
    expect(() =>
      compileArtifactSpec({ title: "only a title" } as never, specOptions),
    ).toThrow();
  });
});

describe("artifact manifest", () => {
  it("round-trips a rendered manifest through parsing", () => {
    const spec = compileArtifactSpec(idempotencySprout, specOptions);
    const manifest = parseArtifactManifest(renderArtifactManifest(spec));
    expect(manifest.spec).toEqual(spec);
    expect(manifest.version).toBe("artifact-manifest-v1");
  });

  it("rejects a manifest whose spec was tampered with", () => {
    const spec = compileArtifactSpec(idempotencySprout, specOptions);
    const manifest = JSON.parse(renderArtifactManifest(spec)) as Record<string, unknown>;
    const tamperedSpec = { ...(manifest.spec as Record<string, unknown>), scenario: "other" };
    const tampered = JSON.stringify({ ...manifest, spec: tamperedSpec });
    expect(() => parseArtifactManifest(tampered)).toThrow(ArtifactManifestIntegrityError);
  });
});
