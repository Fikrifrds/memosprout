import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CorrectionStore } from "@/lib/correction/store";
import type { CorrectionRecord } from "@/lib/correction/schema";

function makeCorrection(overrides: Partial<CorrectionRecord> = {}): CorrectionRecord {
  return {
    correctionId: "corr_store_test1",
    version: 1,
    status: "active",
    domain: "coding",
    trigger: { keywords: ["generated"], entities: ["generated-files"] },
    wrongPattern: "Edit generated file directly",
    correctAnswer: "Modify schema and regenerate",
    explanation: "",
    sourceRef: "",
    submittedBy: "tester",
    submittedAt: "2026-07-21T10:00:00.000Z",
    validatedBy: "oracle",
    validatedAt: "2026-07-21T11:00:00.000Z",
    deprecatedAt: null,
    deprecatedReason: null,
    confirmCount: 0,
    sourceHash: null,
    expiresAt: null,
    lastValidatedAt: null,
    staleness: "fresh" as const,
    ...overrides,
  };
}

describe("CorrectionStore", () => {
  let directory: string;
  let store: CorrectionStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-store-test-"));
    store = new CorrectionStore(directory);
    await store.init();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("saves and retrieves a correction", async () => {
    const correction = makeCorrection();
    await store.save(correction);

    const loaded = store.get("corr_store_test1");
    expect(loaded).toBeDefined();
    expect(loaded!.correctAnswer).toBe("Modify schema and regenerate");
  });

  it("persists corrections to disk and reloads them", async () => {
    await store.save(makeCorrection());

    const freshStore = new CorrectionStore(directory);
    await freshStore.init();

    expect(freshStore.size).toBe(1);
    expect(freshStore.get("corr_store_test1")).toBeDefined();
  });

  it("lists corrections with filters", async () => {
    await store.save(makeCorrection({ correctionId: "corr_active1", status: "active" }));
    await store.save(makeCorrection({ correctionId: "corr_suggested1", status: "suggested" }));
    await store.save(makeCorrection({ correctionId: "corr_active2", status: "active", domain: "rag-chat" }));

    expect(store.list({ status: "active" })).toHaveLength(2);
    expect(store.list({ status: "suggested" })).toHaveLength(1);
    expect(store.list({ domain: "rag-chat" })).toHaveLength(1);
    expect(store.list({ keyword: "generated" })).toHaveLength(3);
  });

  it("matches corrections by query keywords", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_match1",
      trigger: { keywords: ["generated", "client"], entities: ["generated-files"] },
    }));
    await store.save(makeCorrection({
      correctionId: "corr_match2",
      trigger: { keywords: ["tenant", "isolation"], entities: ["tenant-isolation"] },
    }));

    const matches = store.match("I need to edit the generated client file");
    expect(matches).toHaveLength(1);
    expect(matches[0].correctionId).toBe("corr_match1");
  });

  it("only matches active corrections", async () => {
    await store.save(makeCorrection({ correctionId: "corr_active_match", status: "active" }));
    await store.save(makeCorrection({ correctionId: "corr_deprecated_match", status: "deprecated" }));

    const matches = store.match("generated");
    expect(matches).toHaveLength(1);
    expect(matches[0].correctionId).toBe("corr_active_match");
  });

  it("returns empty for no matches", () => {
    expect(store.match("completely unrelated query")).toHaveLength(0);
  });
});
