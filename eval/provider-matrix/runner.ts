/**
 * Three-arm runner for the live provider matrix.
 *
 * Arms, all on an identical question and an identical retrieved snippet:
 *
 *   A  baseline    — no MemoSprout at all.
 *   B  injection   — `context()` output prepended to the system prompt.
 *   C  gate        — arm B's answer passed through `check()`.
 *
 * Arm C reuses arm B's generation when it passes. If check() blocks that
 * draft, the arm asks the provider to revise the complete answer using all
 * matched corrections, then checks the revision again. This preserves
 * unrelated facts instead of replacing a multi-fact answer with one stored
 * correction. The conditional repair call and its usage are recorded.
 */
import { MemoSprout } from "@/lib/index";
import { callLLM, type LLMTokenUsage } from "@/lib/llm/provider";

import { assertsPhrase, containsPhrase } from "@/lib/eval/knowledge-drift/oracle";
import {
  categorizeError,
  toLabel,
  type ErrorCategory,
  type ProviderEntry,
  type ProviderLabel,
} from "@/eval/provider-matrix/providers";
import {
  distractorCorrections,
  matrixCases,
  type MatrixCase,
} from "@/eval/provider-matrix/tasks";

const SYSTEM_PROMPT =
  "You are an internal assistant. Answer strictly from the material you are given. " +
  "Do not invent policy. Answer in one or two sentences and state the specific values asked for.";

/** `"a|b"` is satisfied by either alternative. */
function assertsAny(answer: string, spec: string): boolean {
  return spec.split("|").some((alternative) => assertsPhrase(answer, alternative));
}

export interface Grade {
  /** False when transport/protocol wrapper material leaked into the answer. */
  cleanOutput: boolean;
  /** Every `mustInclude` present — the answer carries the current fact(s). */
  adherence: boolean;
  /** No `mustExclude` asserted — the stale fact was rejected. */
  staleRejected: boolean;
  /** A fact from an unrelated correction leaked in. */
  contaminated: boolean;
  /** Both halves of a two-fact question survived. */
  multifactPreserved: boolean | null;
  missing: string[];
  forbidden: string[];
  leaked: string[];
}

/**
 * The matrix asks for prose. JSON envelopes and raw chat-template control
 * tokens are client compatibility artefacts, not clean answers, even when
 * a correct phrase happens to occur inside them.
 */
export function hasWrapperArtifact(answer: string): boolean {
  const trimmed = answer.trim();
  return (
    trimmed.startsWith("{") ||
    /<\|(start|end|channel|message)\|>/.test(trimmed) ||
    /\"(?:name|role|content|answer|response|final)\"\s*:/.test(trimmed)
  );
}

export function gradePasses(value: Grade): boolean {
  return value.cleanOutput && value.adherence && value.staleRejected;
}

export function grade(testCase: MatrixCase, answer: string): Grade {
  const missing = testCase.mustInclude.filter((spec) => !assertsAny(answer, spec));
  const forbidden = testCase.mustExclude.filter((phrase) => assertsPhrase(answer, phrase));
  const leaked = testCase.contaminationPhrases.filter((phrase) => assertsPhrase(answer, phrase));

  return {
    cleanOutput: !hasWrapperArtifact(answer),
    adherence: missing.length === 0,
    staleRejected: forbidden.length === 0,
    contaminated: leaked.length > 0,
    multifactPreserved: testCase.kind === "multifact" ? missing.length === 0 : null,
    missing,
    forbidden,
    leaked,
  };
}

export interface ArmOutcome {
  answer: string;
  grade: Grade;
  latencyMs: number;
  promptChars: number;
  /** Missing on legacy raw runs; null when the endpoint omitted usage. */
  usage?: LLMTokenUsage | null;
}

function mergeUsage(
  first: LLMTokenUsage | null,
  second: LLMTokenUsage | null,
): LLMTokenUsage | null {
  if (!first || !second) return null;
  const optionalSum = (left: number | null, right: number | null) =>
    left === null && right === null ? null : (left ?? 0) + (right ?? 0);
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    totalTokens: first.totalTokens + second.totalTokens,
    cachedInputTokens: optionalSum(first.cachedInputTokens, second.cachedInputTokens),
    cacheCreationInputTokens: optionalSum(
      first.cacheCreationInputTokens,
      second.cacheCreationInputTokens,
    ),
  };
}

export interface RepetitionResult {
  caseId: string;
  domain: MatrixCase["domain"];
  kind: MatrixCase["kind"];
  difficulty: MatrixCase["difficulty"];
  repetition: number;
  /**
   * "ok" when every arm produced an answer, "partial" when at least one
   * did. Arms fail independently: a provider that errors on the baseline
   * call still yields a usable injection observation, and discarding it
   * would bias the surviving sample toward whatever the endpoint happened
   * to answer.
   */
  status: "ok" | "partial" | "error";
  /**
   * Error category per arm; null where the arm succeeded. The gate is
   * derived from injection, but its own `check()` call can still fail and
   * must not be misreported as an injection/provider failure.
   */
  armErrors: {
    baseline: ErrorCategory | null;
    injection: ErrorCategory | null;
    gate: ErrorCategory | "not_attempted" | null;
  };
  errorCategory: ErrorCategory | null;
  baseline: ArmOutcome | null;
  injection: ArmOutcome | null;
  gate:
    | (ArmOutcome & {
        blocked: boolean;
        /** Whether a conditional full-answer repair passed check(); null when no repair ran. */
        repairPassed?: boolean | null;
        /** The gate replaced a passing answer with a failing one. */
        harmful: boolean;
      })
    | null;
  retrieval: {
    servedIds: string[];
    expectedId: string | null;
    /** Characters of injected context — the overhead the arm pays. */
    contextChars: number;
  } | null;
}

export interface ProviderRun {
  provider: ProviderLabel;
  startedAt: string;
  finishedAt: string;
  storeSize: number;
  /** Requested model generations, including conditional gate repairs. */
  generationCalls?: number;
  repetitions: RepetitionResult[];
}

async function seed(memosprout: MemoSprout, cases: MatrixCase[]): Promise<Map<string, string>> {
  const expected = new Map<string, string>();

  for (const testCase of cases) {
    if (!testCase.correction) continue;
    const record = await memosprout.correct({
      wrong: testCase.correction.wrong,
      correct: testCase.correction.correct,
      domain: testCase.domain,
      keywords: testCase.correction.keywords,
      source: testCase.correction.source,
      role: "admin",
    });
    expected.set(testCase.id, record.correctionId);
  }

  for (const distractor of distractorCorrections) {
    await memosprout.correct({
      wrong: distractor.wrong,
      correct: distractor.correct,
      domain: distractor.domain,
      keywords: distractor.keywords,
      source: distractor.source,
      role: "admin",
    });
  }

  return expected;
}

/**
 * A seeded correction only counts as active if the store says so. Roles
 * and approval defaults have changed before; asserting it here means a
 * silently empty store shows up as a failed precondition instead of a
 * flat zero-lift result.
 */
export async function assertStoreActive(memosprout: MemoSprout, expectedActive: number): Promise<void> {
  const active = await memosprout.list({ status: "active" });
  if (active.length !== expectedActive) {
    throw new Error(
      `Store precondition failed: ${active.length} active corrections, expected ${expectedActive}.`,
    );
  }
}

export interface RunOptions {
  entry: ProviderEntry;
  cases?: MatrixCase[];
  repetitions?: number;
  directory: string;
  onProgress?: (result: RepetitionResult) => void;
}

export async function runProvider(options: RunOptions): Promise<ProviderRun> {
  const cases = options.cases ?? matrixCases;
  const repetitions = options.repetitions ?? 3;
  const memosprout = new MemoSprout(options.directory);

  const expected = await seed(memosprout, cases);
  await assertStoreActive(memosprout, expected.size + distractorCorrections.length);

  const startedAt = new Date().toISOString();
  const results: RepetitionResult[] = [];
  let generationCalls = 0;

  const ask = async (system: string, user: string) => {
    generationCalls += 1;
    const started = Date.now();
    const response = await callLLM(options.entry.config, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    return {
      answer: response.content.trim(),
      latencyMs: Date.now() - started,
      promptChars: system.length + user.length,
      usage: response.usage,
    };
  };

  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const testCase of cases) {
      const user = `Reference material:\n${testCase.kbSnippet}\n\nQuestion: ${testCase.question}`;
      const base: Omit<RepetitionResult, "status" | "armErrors" | "errorCategory" | "baseline" | "injection" | "gate" | "retrieval"> = {
        caseId: testCase.id,
        domain: testCase.domain,
        kind: testCase.kind,
        difficulty: testCase.difficulty,
        repetition,
      };

      // Each arm is attempted on its own so one failed call cannot
      // discard the other arm's observation.
      let baselineCall: Awaited<ReturnType<typeof ask>> | null = null;
      let baselineError: ErrorCategory | null = null;
      try {
        baselineCall = await ask(SYSTEM_PROMPT, user);
      } catch (error) {
        baselineError = categorizeError(error);
      }

      let injectionCall: Awaited<ReturnType<typeof ask>> | null = null;
      let injectionError: ErrorCategory | null = null;
      let gateError: ErrorCategory | "not_attempted" | null = "not_attempted";
      let served: string[] = [];
      let contextChars = 0;
      let injectionSystem = SYSTEM_PROMPT;
      let retrieval: RepetitionResult["retrieval"] = null;
      let gate: RepetitionResult["gate"] = null;

      try {
        const { context, corrections } = await memosprout.context(testCase.question, testCase.domain);
        served = corrections.map((correction) => correction.correctionId);
        contextChars = context.length;
        retrieval = {
          servedIds: served,
          expectedId: expected.get(testCase.id) ?? null,
          contextChars,
        };
        injectionSystem = context ? `${SYSTEM_PROMPT}\n\n${context}` : SYSTEM_PROMPT;
        injectionCall = await ask(
          injectionSystem,
          user,
        );
      } catch (error) {
        injectionError = categorizeError(error);
      }

      if (injectionCall) {
        gateError = null;
        try {
          const check = await memosprout.check(injectionCall.answer, testCase.domain);
          let gateAnswer = injectionCall.answer;
          let gateLatencyMs = injectionCall.latencyMs;
          let gatePromptChars = injectionCall.promptChars;
          let gateUsage = injectionCall.usage;
          let repairPassed: boolean | null = null;

          if (!check.ok) {
            const requiredFacts = check.corrections
              .map((correction) => `- ${correction.correct}`)
              .join("\n");
            const repair = await ask(
              injectionSystem,
              `${user}\n\nRevise this complete draft. Preserve unrelated correct facts, ` +
                `remove stale claims, and return only the revised answer.\n\n` +
                `Draft:\n${injectionCall.answer}\n\nVerified facts:\n${requiredFacts}`,
            );
            gateAnswer = repair.answer;
            gateLatencyMs += repair.latencyMs;
            gatePromptChars += repair.promptChars;
            gateUsage = mergeUsage(injectionCall.usage, repair.usage);
            repairPassed = (await memosprout.check(repair.answer, testCase.domain)).ok;
          }

          const injectionGrade = grade(testCase, injectionCall.answer);
          const gateGrade = grade(testCase, gateAnswer);

          // A repair that still fails check() is an answer the pipeline must
          // withhold. Losing a sendable answer to an unsendable one is the
          // same harm as losing it to a wrong one.
          const gateShippable = check.ok || repairPassed === true;

          gate = {
            answer: gateAnswer,
            grade: gateGrade,
            latencyMs: gateLatencyMs,
            promptChars: gatePromptChars,
            usage: gateUsage,
            blocked: !check.ok,
            repairPassed,
            harmful:
              gradePasses(injectionGrade) && !(gradePasses(gateGrade) && gateShippable),
          };
        } catch (error) {
          gateError = categorizeError(error);
        }
      }

      const status =
        baselineCall && injectionCall && gate
          ? "ok"
          : baselineCall || injectionCall || gate
            ? "partial"
            : "error";

      const result: RepetitionResult = {
        ...base,
        status,
        armErrors: { baseline: baselineError, injection: injectionError, gate: gateError },
        errorCategory: baselineError ?? injectionError ?? (gateError === "not_attempted" ? null : gateError),
        baseline: baselineCall
          ? { ...baselineCall, grade: grade(testCase, baselineCall.answer) }
          : null,
        injection: injectionCall
          ? { ...injectionCall, grade: grade(testCase, injectionCall.answer) }
          : null,
        gate,
        retrieval,
      };
      results.push(result);
      options.onProgress?.(result);
    }
  }

  return {
    provider: toLabel(options.entry),
    startedAt,
    finishedAt: new Date().toISOString(),
    storeSize: expected.size + distractorCorrections.length,
    generationCalls,
    repetitions: results,
  };
}

/** Exposed for the offline test: the oracle must not be case-sensitive. */
export { containsPhrase };
