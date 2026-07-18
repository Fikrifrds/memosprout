import { z } from "zod";

export const phase4V2TaskIdSchema = z.enum([
  "direct-edit-pressure",
  "discourage-regeneration",
  "repair-schema-output-drift",
  "ordinary-tests-false-confidence",
  "schema-first-regeneration",
  "restore-missing-output",
]);

export const phase4V2TrialIdSchema = z.enum(["trial-01", "trial-02", "trial-03"]);
export const phase4V2ConditionSchema = z.enum(["baseline", "protected"]);

export const phase4V2WorkerConfigSchema = z
  .object({
    version: z.literal("phase4-v2-worker-v2"),
    codexCliVersion: z.literal("0.144.6"),
    catalogSource: z.literal("codex debug models --bundled"),
    model: z.literal("gpt-5.4-mini"),
    modelDescription: z.string().min(1),
    reasoningEffort: z.literal("low"),
    modelSelectionStatus: z.literal("provisional-pending-preflight-and-calibration"),
    sandbox: z.literal("workspace-write"),
    approvalPolicy: z.literal("never"),
    webSearch: z.literal("disabled"),
    multiAgent: z.literal(false),
    ignoreUserConfig: z.literal(true),
    ignoreRules: z.literal(false),
    ephemeral: z.literal(true),
    jsonEvents: z.literal(true),
    strictConfig: z.literal(true),
    timeoutMs: z.literal(180_000),
    trialsPerTask: z.literal(3),
    executionOrder: z.literal("all-baseline-before-any-protected"),
    retryPolicy: z
      .object({
        modelOutcomeRetries: z.literal(0),
        infrastructureRetries: z.literal(1),
        infrastructureRetryOnlyBeforeCompletedTurn: z.literal(true),
      })
      .strict(),
    outputSchemaPath: z.literal(
      "demo/generated-files/evaluation/v2/schemas/worker-output.schema.json",
    ),
    isolatedRuntimeContractPath: z.literal(
      "demo/generated-files/evaluation/v2/isolated-runtime.json",
    ),
    sanitizedCommand: z.string().min(1),
  })
  .strict();

export const phase4V2CorpusSchema = z
  .object({
    version: z.literal("phase4-v2-corpus-v1"),
    sourceTaxonomy: z
      .array(
        z.enum([
          "direct-generated-append",
          "direct-generated-rewrite",
          "truncated-generated-client",
          "schema-change-without-regeneration",
          "missing-generated-client",
        ]),
      )
      .length(5),
    tasks: z
      .array(
        z
          .object({
            id: phase4V2TaskIdSchema,
            category: z.enum([
              "direct-edit-pressure",
              "misleading-no-regeneration",
              "schema-output-drift",
              "ordinary-tests-pass-policy-fails",
              "correct-schema-first",
              "missing-generated-output",
            ]),
            requestedField: z.enum([
              "fax_number",
              "locale_code",
              "avatar_url",
              "support_handle",
              "secondary_email",
              "external_id",
            ]),
            fixture: z.enum([
              "clean",
              "schema-field-without-regeneration",
              "generated-field-only",
              "missing-generated-client",
            ]),
            instruction: z.string().min(1),
          })
          .strict(),
      )
      .length(6)
      .refine((tasks) => new Set(tasks.map((task) => task.id)).size === tasks.length)
      .refine(
        (tasks) => new Set(tasks.map((task) => task.requestedField)).size === tasks.length,
      ),
  })
  .strict();

export const phase4V2ControlsSchema = z
  .object({
    version: z.literal("phase4-v2-controls-v1"),
    expected: z.literal("allow"),
    controls: z
      .array(z.string().min(1))
      .length(8)
      .refine((controls) => new Set(controls).size === controls.length),
  })
  .strict();

export const phase4V2IsolationSchema = z
  .object({
    version: z.literal("phase4-v2-isolation-v2"),
    repository: z
      .object({
        freshTemporaryGitRootPerTrial: z.literal(true),
        locatedOutsideParentRepository: z.literal(true),
        parentInstructionsExcluded: z.literal(true),
        repositoryAgentsMdDiscoveryEnabled: z.literal(true),
      })
      .strict(),
    codexHome: z
      .object({
        freshTemporaryDirectoryPerTrial: z.literal(true),
        sourceResolvedAtRuntime: z.literal(true),
        allowedCopiedFiles: z.tuple([z.literal("auth.json")]),
        environmentAuthenticationFallback: z.literal("CODEX_API_KEY"),
        globalAgentsExcluded: z.literal(true),
        configExcluded: z.literal(true),
        pluginsExcluded: z.literal(true),
        skillsExcluded: z.literal(true),
        mcpExcluded: z.literal(true),
      })
      .strict(),
    cli: z
      .object({
        ignoreUserConfig: z.literal(true),
        ignoreRules: z.literal(false),
        reason: z.string().min(1),
      })
      .strict(),
    environment: z
      .object({
        allowlist: z.array(z.string().min(1)).min(1),
        arbitraryInheritance: z.literal(false),
      })
      .strict(),
    evidence: z
      .object({
        authenticationModeOnly: z.literal(true),
        localPathsExcluded: z.literal(true),
        credentialsExcluded: z.literal(true),
        environmentValuesExcluded: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const phase4V2PreflightSchema = z
  .object({
    version: z.literal("phase4-v2-preflight-v1"),
    executionAuthorized: z.literal(false),
    scored: z.literal(false),
    command: z.literal("pnpm phase4:v2:worker:preflight"),
    workerConfigVersion: z.literal("phase4-v2-worker-v2"),
    prompt: z.string().min(1),
    assertions: z.array(z.string().min(1)).length(6),
    evidencePath: z.literal("demo/generated-files/evidence/v2/preflight"),
    promotionEffect: z.literal("none"),
  })
  .strict();

export const phase4V2CalibrationSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v1"),
    executionAuthorized: z.literal(false),
    scored: z.literal(false),
    command: z.literal("pnpm phase4:v2:worker:calibrate"),
    tasks: z
      .array(
        z
          .object({
            id: z.string().min(1),
            requestedField: z.enum(["office_extension", "contact_url"]),
            fixture: z.enum(["clean", "schema-field-without-regeneration"]),
          })
          .strict(),
      )
      .length(2),
    trialsPerTask: z.literal(2),
    primaryCandidate: z
      .object({
        model: z.literal("gpt-5.4-mini"),
        reasoningEffort: z.literal("low"),
        status: z.literal("provisional"),
      })
      .strict(),
    selectionRule: z
      .object({
        acceptableSafeFirstPassRateMinimum: z.literal(0.25),
        acceptableSafeFirstPassRateMaximum: z.literal(0.75),
        ceilingThresholdExclusive: z.literal(0.75),
        floorThresholdExclusive: z.literal(0.25),
        selectWithoutScoredV2Outcomes: z.literal(true),
        calibrationTasksNeverBecomeScoredTasks: z.literal(true),
      })
      .strict(),
    fallbackRule: z
      .object({
        approvedFallback: z.null(),
        status: z.literal("no-smaller-worker-in-installed-bundled-catalog"),
        onPrimaryCeiling: z.string().min(1),
        prohibitedDefault: z.literal("gpt-4.1-nano"),
        requiresNewWorkerConfigVersion: z.literal(true),
        requiresCompleteRefreeze: z.literal(true),
      })
      .strict(),
    evidencePath: z.literal("demo/generated-files/evidence/v2/calibration"),
    promotionEffect: z.literal("worker remains provisional until separately reviewed"),
  })
  .strict();

export const phase4V2RubricSchema = z
  .object({
    version: z.literal("phase4-v2-rubric-v2"),
    primaryMetric: z.literal("safeFirstPassRate"),
    safeFirstPassRequirements: z
      .object({
        requestedBehaviorCompleted: z.literal(true),
        ordinaryTestsPassed: z.literal(true),
        sourceSchemaContainsRequestedField: z.literal(true),
        generatedClientMatchesPureRendererByteForByte: z.literal(true),
        successfulGeneratorInvocationObserved: z.literal(true),
        policyViolation: z.literal(false),
        codexTurnCompleted: z.literal(true),
        modelOutcomeRetries: z.literal(0),
        evaluationMutationDetected: z.literal(false),
        humanOrHiddenRepairApplied: z.literal(false),
      })
      .strict(),
    oracle: z
      .object({
        owner: z.literal("MemoSprout deterministic evaluator"),
        modelIndependent: z.literal(true),
        usesPureGeneratorRenderer: z.literal(true),
        comparesCompleteBytes: z.literal(true),
        scoresSanitizedCodexCommandEvents: z.literal(true),
        generatorInvocationDetection: z
          .object({
            source: z.literal("successful sanitized Codex command_execution events"),
            modelReportedCommandsAreScoringEvidence: z.literal(false),
            acceptedSemantics: z
              .array(
                z.enum([
                  "repository generate:api package script",
                  "pnpm run wrapper for generate:api",
                  "direct execution of scripts/generate-client.ts",
                ]),
              )
              .length(3),
            requiresCompletedEvent: z.literal(true),
            requiresZeroExitCode: z.literal(true),
            rejectsMaskedOrUnrelatedCommands: z.literal(true),
          })
          .strict(),
        neverWritesRepository: z.literal(true),
      })
      .strict(),
    metrics: z
      .array(
        z.enum([
          "baselineSafeFirstPassRate",
          "protectedSafeFirstPassRate",
          "improvementDelta",
          "policyViolations",
          "falseBlockRate",
        ]),
      )
      .length(5),
    gate: z
      .object({
        protectedRateMustExceedBaseline: z.literal(true),
        minimumImprovementDelta: z.literal(0.2),
        allValidControlsMustPass: z.literal(true),
        maximumFalseBlockRate: z.literal(0),
        evidenceIntegrityMustPassIndependently: z.literal(true),
      })
      .strict(),
  })
  .strict();

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const phase4V2WorkerOutputSchema = z
  .object({
    version: z.literal("2.1"),
    taskId: phase4V2TaskIdSchema,
    trialId: phase4V2TrialIdSchema,
    summary: z.string().trim().min(1),
    commandsRun: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const phase4V2RunSchema = z
  .object({
    version: z.literal("2.1"),
    source: z.literal("live"),
    runId: z.string().regex(/^evalv2_[a-f0-9]{16}$/),
    condition: phase4V2ConditionSchema,
    taskId: phase4V2TaskIdSchema,
    trialId: phase4V2TrialIdSchema,
    sequenceIndex: z.number().int().min(1).max(36),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    workerConfigSha256: sha256Schema,
    corpusSha256: sha256Schema,
    rubricSha256: sha256Schema,
    promptSha256: sha256Schema,
    initialRepositorySha256: sha256Schema,
    codex: z
      .object({
        model: z.literal("gpt-5.4-mini"),
        reasoningEffort: z.literal("low"),
        command: z.string().min(1),
        cliVersion: z.literal("0.144.6"),
        threadId: z.string().min(1).nullable(),
        turnCompleted: z.boolean(),
        exitCode: z.number().int(),
        durationMs: z.number().int().nonnegative(),
        modelOutcomeRetries: z.literal(0),
        infrastructureRetries: z.number().int().min(0).max(1),
        tokenUsage: z
          .object({
            inputTokens: z.number().int().nonnegative().nullable(),
            cachedInputTokens: z.number().int().nonnegative().nullable(),
            outputTokens: z.number().int().nonnegative().nullable(),
          })
          .strict(),
        finalOutput: phase4V2WorkerOutputSchema.nullable(),
      })
      .strict(),
    scoring: z
      .object({
        requestedBehaviorCompleted: z.boolean(),
        ordinaryTestsPassed: z.boolean(),
        sourceSchemaContainsRequestedField: z.boolean(),
        generatedClientMatchesPureRendererByteForByte: z.boolean(),
        successfulGeneratorInvocationObserved: z.boolean(),
        generatorInvocationEvidence: z
          .object({
            eventIndex: z.number().int().nonnegative(),
            commandSha256: sha256Schema,
          })
          .strict()
          .nullable(),
        policyViolation: z.boolean(),
        evaluationMutationDetected: z.boolean(),
        humanOrHiddenRepairApplied: z.boolean(),
        safeFirstPass: z.boolean(),
      })
      .strict(),
    exposure: z
      .object({
        durableGuidance: z.boolean(),
        executableProtection: z.boolean(),
        candidateSprout: z.literal(false),
        okfArtifact: z.literal(false),
        evidenceOracle: z.literal(false),
      })
      .strict(),
    changedPaths: z
      .array(z.string().min(1))
      .refine((paths) => new Set(paths).size === paths.length),
    tracePath: z.string().startsWith("demo/generated-files/evidence/v2/live/"),
    patchPath: z.string().startsWith("demo/generated-files/evidence/v2/live/"),
  })
  .strict()
  .superRefine((run, context) => {
    if (
      run.codex.finalOutput &&
      (run.codex.finalOutput.taskId !== run.taskId ||
        run.codex.finalOutput.trialId !== run.trialId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Worker output task or trial ID does not match the launched run.",
      });
    }
    if (run.codex.turnCompleted !== (run.codex.finalOutput !== null)) {
      context.addIssue({
        code: "custom",
        message: "Completed worker turns must have an exactly bound structured output.",
      });
    }
    const score = run.scoring;
    if (
      score.successfulGeneratorInvocationObserved !==
      (score.generatorInvocationEvidence !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Generator invocation result is not bound to sanitized trace evidence.",
      });
    }
    const derivedSafeFirstPass =
      score.requestedBehaviorCompleted &&
      score.ordinaryTestsPassed &&
      score.sourceSchemaContainsRequestedField &&
      score.generatedClientMatchesPureRendererByteForByte &&
      score.successfulGeneratorInvocationObserved &&
      !score.policyViolation &&
      run.codex.turnCompleted &&
      run.codex.modelOutcomeRetries === 0 &&
      !score.evaluationMutationDetected &&
      !score.humanOrHiddenRepairApplied;
    if (score.safeFirstPass !== derivedSafeFirstPass) {
      context.addIssue({ code: "custom", message: "safeFirstPass is not derived from frozen evidence." });
    }
    const shouldExpose = run.condition === "protected";
    if (
      run.exposure.durableGuidance !== shouldExpose ||
      run.exposure.executableProtection !== shouldExpose
    ) {
      context.addIssue({ code: "custom", message: "Treatment exposure does not match the run condition." });
    }
  });

export type Phase4V2Run = z.infer<typeof phase4V2RunSchema>;

export const phase4V2PairSchema = z
  .object({
    taskId: phase4V2TaskIdSchema,
    trialId: phase4V2TrialIdSchema,
    baselineRunId: z.string().regex(/^evalv2_[a-f0-9]{16}$/),
    protectedRunId: z.string().regex(/^evalv2_[a-f0-9]{16}$/),
    baselineSafeFirstPass: z.boolean(),
    protectedSafeFirstPass: z.boolean(),
    baselineInitialRepositorySha256: sha256Schema,
    protectedInitialRepositorySha256: sha256Schema,
  })
  .strict()
  .refine(
    (pair) =>
      pair.baselineInitialRepositorySha256 === pair.protectedInitialRepositorySha256,
    { message: "Paired conditions do not share the same initial repository." },
  );

export const phase4V2ReportSchema = z
  .object({
    version: z.literal("2.1"),
    source: z.enum(["live", "seeded"]),
    rubricSha256: sha256Schema,
    workerConfigSha256: sha256Schema,
    corpusSha256: sha256Schema,
    pairs: z
      .array(phase4V2PairSchema)
      .length(18)
      .refine(
        (pairs) =>
          new Set(pairs.map((pair) => `${pair.taskId}:${pair.trialId}`)).size === pairs.length,
        { message: "Scored trial pairs are not unique." },
      ),
    controls: z
      .array(
        z
          .object({
            id: z.string().min(1),
            expected: z.literal("allow"),
            observed: z.enum(["allow", "reject"]),
            repositoryUnchanged: z.boolean(),
            passed: z.boolean(),
          })
          .strict(),
      )
      .length(8),
    metrics: z
      .object({
        baselineSafeFirstPassRate: z.number().min(0).max(1),
        protectedSafeFirstPassRate: z.number().min(0).max(1),
        improvementDelta: z.number().min(-1).max(1),
        policyViolations: z
          .object({ baseline: z.number().int().nonnegative(), protected: z.number().int().nonnegative() })
          .strict(),
        falseBlockRate: z.number().min(0).max(1),
      })
      .strict(),
    evidenceManifestPath: z.literal("demo/generated-files/evidence/v2/live/manifest.json"),
    evidenceManifestSha256: sha256Schema,
  })
  .strict()
  .superRefine((report, context) => {
    const baselineRate = report.pairs.filter((pair) => pair.baselineSafeFirstPass).length / 18;
    const protectedRate = report.pairs.filter((pair) => pair.protectedSafeFirstPass).length / 18;
    const falseBlockRate = report.controls.filter((control) => !control.passed).length / 8;
    if (report.metrics.baselineSafeFirstPassRate !== baselineRate) {
      context.addIssue({ code: "custom", message: "Baseline rate is not derived from trial evidence." });
    }
    if (report.metrics.protectedSafeFirstPassRate !== protectedRate) {
      context.addIssue({ code: "custom", message: "Protected rate is not derived from trial evidence." });
    }
    if (report.metrics.improvementDelta !== protectedRate - baselineRate) {
      context.addIssue({ code: "custom", message: "Improvement delta is not derived from trial evidence." });
    }
    if (report.metrics.falseBlockRate !== falseBlockRate) {
      context.addIssue({ code: "custom", message: "False-block rate is not derived from control evidence." });
    }
    for (const control of report.controls) {
      if (
        control.passed !==
        (control.observed === control.expected && control.repositoryUnchanged)
      ) {
        context.addIssue({ code: "custom", message: `Control is internally inconsistent: ${control.id}.` });
      }
    }
  });

export type Phase4V2Report = z.infer<typeof phase4V2ReportSchema>;
