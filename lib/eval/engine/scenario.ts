export interface ScenarioDefinition {
  /** Stable scenario identifier, for example "idempotency". */
  readonly id: string;
  /** Scenario template directory, relative to the repository root. */
  readonly templateRoot: string;
  /**
   * Files present only in the protected condition (removed in the baseline and
   * frontier-baseline conditions), relative to the template root.
   */
  readonly protectedOnlyPaths: readonly string[];
  /**
   * Provided files the worker must not modify; modifying one is a policy
   * violation, relative to the template root.
   */
  readonly guardedPaths: readonly string[];
  /**
   * Sprout guidance file (for example AGENTS.md), relative to the template
   * root. Injected into the prompt for the protected condition.
   */
  readonly sproutPath: string;
  /**
   * Held-out acceptance test that is the scoring oracle, relative to the
   * template root. Injected before scoring every condition.
   */
  readonly acceptanceTestPath: string;
  /** Worker structured-output schema, relative to the repository root. */
  readonly workerOutputSchemaPath: string;
  /** Shell command (run inside the materialized repository) that runs the ordinary tests. */
  readonly ordinaryTestCommand: string;
  /** Shell command (run inside the materialized repository) that runs the acceptance suite. */
  readonly acceptanceTestCommand: string;
}
