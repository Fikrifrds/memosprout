import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoSprout } from "@/lib/index";
import { normalizeText } from "@/lib/correction/matching";
import { driftCaseSchema, driftCases } from "@/lib/eval/knowledge-drift/dataset";
import { containsPhrase, gradeAnswer } from "@/lib/eval/knowledge-drift/oracle";
import { runKnowledgeDriftBenchmark, type AnswerModel } from "@/lib/eval/knowledge-drift/runner";

/** Reads the injected "The correct answer is:" lines back out of a prompt. */
function correctionsFromPrompt(system: string): string[] {
  return [...system.matchAll(/The correct answer is: (.+)/g)].map((match) => match[1]!.trim());
}

function snippetFrom(user: string): string {
  return user.split("Handbook context:\n")[1]!.split("\n\nQuestion:")[0]!;
}

function questionFrom(user: string): string {
  return user.split("\n\nQuestion: ")[1]!;
}

/** How many of the question's content words a candidate answer shares. */
function overlap(question: string, candidate: string): number {
  const candidateTokens = new Set(normalizeText(candidate).split(" "));
  return normalizeText(question)
    .split(" ")
    .filter((token) => token.length >= 4 && candidateTokens.has(token)).length;
}

/**
 * Uses the injected correction that actually addresses the question, and
 * otherwise answers from the snippet. One fact per answer, the way a real
 * assistant replies to a single-fact question. Deliberately not a model:
 * this stub exists to check the harness arithmetic offline.
 */
const attentiveModel: AnswerModel = async ({ system, user }) => {
  const question = questionFrom(user);
  const relevant = correctionsFromPrompt(system)
    .map((text) => ({ text, score: overlap(question, text) }))
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score);
  return relevant[0]?.text ?? snippetFrom(user);
};

/** Ignores injected corrections entirely — only the gate can save it. */
const stubbornModel: AnswerModel = async ({ user }) => snippetFrom(user);

describe("knowledge-drift dataset", () => {
  it("every case satisfies the schema", () => {
    for (const testCase of driftCases) {
      expect(() => driftCaseSchema.parse(testCase)).not.toThrow();
    }
  });

  it("case ids are unique", () => {
    const ids = driftCases.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every drift snippet states the fact the correction disputes", () => {
    for (const testCase of driftCases) {
      if (testCase.kind !== "drift") continue;
      // If the stale snippet did not carry a forbidden phrase, the
      // baseline could pass by accident and the lift would be fiction.
      const carriesStaleFact = testCase.mustExclude.some((phrase) =>
        containsPhrase(testCase.kbSnippet, phrase),
      );
      expect(carriesStaleFact, `${testCase.id} snippet is not actually stale`).toBe(true);
    }
  });

  it("no drift snippet already contains the current fact", () => {
    for (const testCase of driftCases) {
      if (testCase.kind !== "drift") continue;
      const leaks = testCase.mustInclude.some((spec) =>
        spec.split("|").some((alternative) => containsPhrase(testCase.kbSnippet, alternative)),
      );
      expect(leaks, `${testCase.id} snippet leaks the current fact`).toBe(false);
    }
  });

  it("every correction text passes its own case", () => {
    for (const testCase of driftCases) {
      if (!testCase.correction) continue;
      // A correction that cannot satisfy the oracle would cap the ceiling
      // below 100% for reasons that have nothing to do with MemoSprout.
      const grade = gradeAnswer(testCase, testCase.correction.correct);
      expect(grade.passed, `${testCase.id}: ${JSON.stringify(grade)}`).toBe(true);
    }
  });

  it("every control snippet answers its own question", () => {
    for (const testCase of driftCases) {
      if (testCase.kind !== "control") continue;
      expect(gradeAnswer(testCase, testCase.kbSnippet).passed, testCase.id).toBe(true);
    }
  });
});

describe("knowledge-drift oracle", () => {
  const testCase = driftCases.find((candidate) => candidate.id === "annual-leave")!;

  it("passes an answer carrying the current fact", () => {
    expect(gradeAnswer(testCase, "Employees get 18 days of annual leave.").passed).toBe(true);
  });

  it("fails an answer carrying the stale fact", () => {
    const grade = gradeAnswer(testCase, "Employees get 12 days of annual leave.");
    expect(grade.passed).toBe(false);
    expect(grade.forbidden).toContain("12 days");
  });

  it("fails an answer that dodges the number", () => {
    expect(gradeAnswer(testCase, "Please check with HR.").passed).toBe(false);
  });

  it("passes an answer that names the stale fact only to reject it", () => {
    const answer =
      "Employees get 18 days of annual leave, not the 12 days stated in the older handbook.";
    expect(gradeAnswer(testCase, answer).passed).toBe(true);
  });

  it("still fails an answer that asserts the stale fact alongside the current one", () => {
    const answer = "Employees get 18 days of annual leave. Employees get 12 days of annual leave.";
    expect(gradeAnswer(testCase, answer).passed).toBe(false);
  });

  it("matches on word boundaries, not substrings", () => {
    expect(containsPhrase("112 days of leave", "12 days")).toBe(false);
  });
});

describe("knowledge-drift runner", () => {
  let directory: string;
  let memosprout: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-drift-test-"));
    memosprout = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("scores a model that applies injected corrections", async () => {
    const report = await runKnowledgeDriftBenchmark({
      memosprout,
      answer: attentiveModel,
      cases: driftCases,
      model: "stub-attentive",
    });

    expect(report.drift.baselinePassed).toBe(0);
    expect(report.drift.protectedPassed).toBe(report.totals.driftCases);
    expect(report.drift.liftPoints).toBe(100);
    expect(report.drift.retrievalRecall).toBe(1);
    expect(report.control.baselinePassed).toBe(report.totals.controlCases);
    expect(report.control.protectedPassed).toBe(report.totals.controlCases);
    expect(report.control.falseBlocks).toBe(0);
    expect(report.control.retrievalContaminationRate).toBeGreaterThanOrEqual(0);
    expect(report.gate.blocksTriggered).toBe(
      report.gate.trueSaves + report.gate.redundantBlocks,
    );
    expect(report.harmfulBlocks).toEqual([]);
    expect(report.regressions).toEqual([]);
  });

  it("preserves a correct multi-fact answer that negates the stale fact", async () => {
    const multiFactCase = driftCaseSchema.parse({
      id: "payout-multifact",
      kind: "drift",
      question: "How often are payouts sent, and what is the minimum payout?",
      kbSnippet: "Payouts are sent weekly. The minimum payout is EUR 50.",
      mustInclude: ["daily", "50"],
      mustExclude: ["weekly"],
      correction: {
        wrong: "Payouts are sent weekly",
        correct: "Payouts are sent daily",
        keywords: ["payout", "payouts", "sent"],
        source: "Payments policy rev. 2026-04",
      },
    });
    const chattyModel: AnswerModel = async ({ system, user }) =>
      correctionsFromPrompt(system).length > 0
        ? "Payouts are sent daily, not weekly, and the minimum payout is EUR 50."
        : snippetFrom(user);

    const report = await runKnowledgeDriftBenchmark({
      memosprout,
      answer: chattyModel,
      cases: [multiFactCase],
      model: "stub-chatty",
    });

    expect(report.harmfulBlocks).toEqual([]);
    expect(report.drift.protectedPassed).toBe(1);
  });

  it("credits the gate when the model ignores the injected corrections", async () => {
    const report = await runKnowledgeDriftBenchmark({
      memosprout,
      answer: stubbornModel,
      cases: driftCases,
      model: "stub-stubborn",
    });

    // Context injection buys nothing here — every point comes from check().
    expect(report.drift.protectedPassedBeforeGate).toBe(0);
    expect(report.drift.protectedPassed).toBeGreaterThan(0);
    expect(report.control.falseBlocks).toBe(0);
    expect(report.gate.trueSaves).toBeGreaterThan(0);
  });
});
