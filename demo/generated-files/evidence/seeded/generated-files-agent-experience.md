---
type: Agent Experience
title: Generated files must not be edited directly
description: A Candidate Sprout derived from generated-files evidence and Human Correction.
version: "0.1"
created_at: 2026-07-18T09:05:00.000Z
memosprout:
  sprout_id: sprout_07325232023799c9
  status: candidate
  source: seeded
  prompt_version: candidate-sprout-v1
  model_requested: gpt-5.6-sol
  model_returned: null
  response_id: null
  evidence_ids:
    failedAgentRunId: run_seeded_generated_files_001
    humanCorrectionId: correction_seeded_generated_files_001
    correctedOutcomeId: outcome_seeded_generated_files_001
    deterministicEvidenceId: evidence_seeded_generated_files_001
---

# Generated files must not be edited directly

## Trigger

A task requests a change to the generated API client under generated/**.

## Validated Procedure

1. Modify the source schema in api/openapi.yaml.
2. Run pnpm generate:api to regenerate generated/api-client.ts.
3. Run the client tests and generated-files evidence oracle.

## Prohibited Action

- Do not edit generated/api-client.ts directly.

## Scope

- `api/openapi.yaml`
- `generated/**`
- `scripts/generate-client.ts`

## Evidence

- Failed Agent Run: `run_seeded_generated_files_001`
- Human Correction: `correction_seeded_generated_files_001`
- Corrected outcome: `outcome_seeded_generated_files_001`
- Deterministic evidence: `evidence_seeded_generated_files_001`

## Uncertainties

- Revalidate the generator command and schema location if project configuration changes.

## Recommended Artifact

`ci_and_hook`
