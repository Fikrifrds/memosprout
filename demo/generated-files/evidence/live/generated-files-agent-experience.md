---
type: Agent Experience
title: Update the API schema before regenerating the client
description: A Candidate Sprout derived from generated-files evidence and Human Correction.
version: "0.1"
created_at: 2026-07-18T13:58:18.796Z
memosprout:
  sprout_id: sprout_b9fd056e1923a33a
  status: candidate
  source: live
  prompt_version: candidate-sprout-v1
  model_requested: gpt-5.6-sol
  model_returned: gpt-5.6-sol
  response_id: resp_0c484a335536035f016a5b86774a20819ba4643d595cee8f39
  evidence_ids:
    failedAgentRunId: run_seeded_generated_files_001
    humanCorrectionId: correction_seeded_generated_files_001
    correctedOutcomeId: outcome_seeded_generated_files_001
    deterministicEvidenceId: evidence_seeded_generated_files_001
---

# Update the API schema before regenerating the client

## Trigger

When adding or changing fields in the generated API client.

## Validated Procedure

1. Change the source schema in api/openapi.yaml.
2. Run pnpm generate:api to regenerate generated/api-client.ts.
3. Run pnpm test to verify client tests and generation consistency checks pass.

## Prohibited Action

- Do not edit generated/api-client.ts directly.

## Scope

- `api/openapi.yaml`
- `generated/api-client.ts`

## Evidence

- Failed Agent Run: `run_seeded_generated_files_001`
- Human Correction: `correction_seeded_generated_files_001`
- Corrected outcome: `outcome_seeded_generated_files_001`
- Deterministic evidence: `evidence_seeded_generated_files_001`

## Uncertainties

- No unresolved uncertainty recorded.

## Recommended Artifact

`ci_and_hook`
