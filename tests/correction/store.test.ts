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
      wrongPattern: "Share tenant data across accounts",
      correctAnswer: "Scope every query by tenant id",
    }));

    const matches = store.match("I need to edit the generated client file");
    expect(matches).toHaveLength(1);
    expect(matches[0].correctionId).toBe("corr_match1");
  });

  it("matches a configured multi-word keyword as a phrase", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_multi_word",
      trigger: { keywords: ["annual leave"], entities: [] },
      wrongPattern: "The allowance was twelve",
      correctAnswer: "The allowance is eighteen",
    }));

    expect(store.match("What is the annual leave allowance?")[0]?.correctionId).toBe(
      "corr_multi_word",
    );
    expect(store.match("Is the annual office closed when people leave?")).toEqual([]);
  });

  it("requires corroboration for a broad single-word keyword", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_training_hours",
      trigger: { keywords: ["training", "training hours"], entities: [] },
      wrongPattern: "Employees complete 8 training hours annually",
      correctAnswer: "Employees complete 12 training hours annually",
    }));

    expect(store.match("Where is the employee training room?")).toEqual([]);
    expect(store.match("What training hours must employees complete each year?")[0]?.correctionId)
      .toBe("corr_training_hours");
    expect(store.match("training")[0]?.correctionId).toBe("corr_training_hours");
  });

  it("lets a specific trigger survive natural question wording", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_settlement",
      trigger: { keywords: ["settlement", "settle", "funds"], entities: [] },
      wrongPattern: "Funds settle on a T+3 basis",
      correctAnswer: "Funds settle on a T+1 basis",
    }));

    expect(store.match("What is the settlement window for a merchant?")[0]?.correctionId)
      .toBe("corr_settlement");
    expect(store.match("Which currency do merchants settle in?")).toEqual([]);
  });

  it("matches common -ed and -ing keyword inflections", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_dispute",
      trigger: { keywords: ["chargeback", "chargeback fee", "dispute"], entities: [] },
      wrongPattern: "The chargeback fee is EUR 15",
      correctAnswer: "The chargeback fee is EUR 25",
    }));

    expect(store.match("What does a disputed transaction cost?")[0]?.correctionId)
      .toBe("corr_dispute");
  });

  it("matches an ordinary-language alias configured in trigger metadata", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_workwear",
      trigger: {
        keywords: ["uniform allowance", "allowance", "uniform", "workwear"],
        entities: [],
      },
      wrongPattern: "The annual uniform allowance is EUR 120",
      correctAnswer: "The annual uniform allowance is EUR 200",
    }));

    expect(store.match("How much can an employee claim for workwear?")[0]?.correctionId)
      .toBe("corr_workwear");
  });

  it("uses inflected content words as corroboration", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_retention",
      trigger: { keywords: ["retention", "deleted ticket", "data retention"], entities: [] },
      wrongPattern: "Deleted ticket retention is 30 days",
      correctAnswer: "Deleted ticket retention is 90 days",
    }));

    expect(store.match("How long is a ticket kept after a customer deletes it?")[0]?.correctionId)
      .toBe("corr_retention");
  });

  it("does not treat a keyword as a substring inside an unrelated word", async () => {
    await store.save(makeCorrection({
      correctionId: "corr_leave",
      trigger: { keywords: ["leave"], entities: [] },
      wrongPattern: "Annual leave is 12 days",
      correctAnswer: "Annual leave is 18 days",
    }));

    expect(store.match("I believe this answer is current")).toEqual([]);
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
