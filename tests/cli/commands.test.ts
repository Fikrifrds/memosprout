import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CodingAdapter } from "@/lib/adapter/coding";
import {
  commandActivate,
  commandAdd,
  commandCheck,
  commandInit,
  commandList,
  commandMatch,
  commandValidate,
} from "@/lib/cli/commands";
import { CorrectionStore } from "@/lib/correction/store";
import { idempotencyScenario } from "@/lib/scenario/idempotency";

describe("CLI commands", () => {
  let directory: string;
  let store: CorrectionStore;
  let adapter: CodingAdapter;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-cli-test-"));
    store = new CorrectionStore(directory);
    await store.init();
    adapter = new CodingAdapter();
    adapter.registerScenario(idempotencyScenario);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describe("commandInit", () => {
    it("creates the corrections directory", async () => {
      const target = join(directory, "sub", "corrections");
      const result = await commandInit(target);
      expect(result.created).toBe(true);
      expect(result.directory).toBe(target);
    });
  });

  describe("commandAdd", () => {
    it("adds a new correction", async () => {
      const correction = await commandAdd(store, {
        domain: "coding",
        wrongPattern: "Edit generated files",
        correctAnswer: "Modify schema and regenerate",
        keywords: ["generated"],
        entities: ["generated-files"],
      });

      expect(correction.correctionId).toMatch(/^corr_/);
      expect(correction.status).toBe("suggested");
      expect(store.size).toBe(1);
    });

    it("increments confirmCount for duplicate corrections", async () => {
      const input = {
        domain: "coding",
        wrongPattern: "Edit generated files",
        correctAnswer: "Modify schema and regenerate",
      };

      const first = await commandAdd(store, input);
      expect(first.confirmCount).toBe(0);

      const second = await commandAdd(store, input);
      expect(second.confirmCount).toBe(1);
      expect(store.size).toBe(1);
    });
  });

  describe("commandList", () => {
    it("lists all corrections", async () => {
      await commandAdd(store, { domain: "coding", wrongPattern: "w1", correctAnswer: "c1" });
      await commandAdd(store, { domain: "rag-chat", wrongPattern: "w2", correctAnswer: "c2" });

      const result = commandList(store);
      expect(result.total).toBe(2);
    });

    it("filters by domain", async () => {
      await commandAdd(store, { domain: "coding", wrongPattern: "w1", correctAnswer: "c1" });
      await commandAdd(store, { domain: "rag-chat", wrongPattern: "w2", correctAnswer: "c2" });

      const result = commandList(store, { domain: "coding" });
      expect(result.total).toBe(1);
      expect(result.corrections[0].domain).toBe("coding");
    });
  });

  describe("commandValidate", () => {
    it("validates a correction with a known scenario", async () => {
      const correction = await commandAdd(store, {
        domain: "coding",
        wrongPattern: "Skip idempotency check",
        correctAnswer: "Check for duplicate event IDs",
        entities: ["idempotency"],
      });

      const result = await commandValidate(store, adapter, correction.correctionId);
      expect(result.passed).toBe(true);
      expect(result.newStatus).toBe("validated");

      const updated = store.get(correction.correctionId);
      expect(updated!.status).toBe("validated");
      expect(updated!.validatedBy).toBeTruthy();
    });

    it("returns not found for unknown correction", async () => {
      const result = await commandValidate(store, adapter, "corr_nonexistent");
      expect(result.passed).toBe(false);
      expect(result.newStatus).toBe("unknown");
    });
  });

  describe("commandActivate", () => {
    it("activates a validated correction", async () => {
      const correction = await commandAdd(store, {
        domain: "coding",
        wrongPattern: "wrong",
        correctAnswer: "right",
        entities: ["idempotency"],
      });
      await commandValidate(store, adapter, correction.correctionId);

      const result = await commandActivate(store, correction.correctionId);
      expect(result.newStatus).toBe("active");
    });

    it("rejects activation of a non-validated correction", async () => {
      const correction = await commandAdd(store, {
        domain: "coding",
        wrongPattern: "wrong",
        correctAnswer: "right",
      });

      await expect(commandActivate(store, correction.correctionId)).rejects.toThrow(
        "must be validated",
      );
    });
  });

  describe("commandCheck", () => {
    it("blocks an answer matching a known-wrong pattern", async () => {
      const correction = await commandAdd(store, {
        domain: "coding",
        wrongPattern: "edit generated files directly",
        correctAnswer: "modify schema and regenerate",
        keywords: ["generated"],
        entities: ["idempotency"],
      });
      await commandValidate(store, adapter, correction.correctionId);
      await commandActivate(store, correction.correctionId);

      const result = commandCheck(
        store,
        "how do I update the API client?",
        "You can edit generated files directly",
      );
      expect(result.blocked).toBe(true);
      expect(result.matchedCorrections).toHaveLength(1);
      expect(result.matchedCorrections[0].correctAnswer).toBe("modify schema and regenerate");
    });

    it("allows an answer that does not match", async () => {
      const correction = await commandAdd(store, {
        domain: "coding",
        wrongPattern: "edit generated files directly",
        correctAnswer: "modify schema and regenerate",
        keywords: ["generated"],
        entities: ["idempotency"],
      });
      await commandValidate(store, adapter, correction.correctionId);
      await commandActivate(store, correction.correctionId);

      const result = commandCheck(
        store,
        "how do I update the API client?",
        "Modify the schema and regenerate",
      );
      expect(result.blocked).toBe(false);
    });
  });

  describe("commandMatch", () => {
    it("finds relevant corrections and builds context", async () => {
      const correction = await commandAdd(store, {
        domain: "coding",
        wrongPattern: "wrong",
        correctAnswer: "right",
        keywords: ["idempotency", "webhook"],
        entities: ["idempotency"],
      });
      await commandValidate(store, adapter, correction.correctionId);
      await commandActivate(store, correction.correctionId);

      const result = commandMatch(store, adapter, "implement webhook idempotency");
      expect(result.corrections).toHaveLength(1);
      expect(result.context).toContain("Do NOT: wrong");
      expect(result.context).toContain("Instead: right");
    });
  });
});
