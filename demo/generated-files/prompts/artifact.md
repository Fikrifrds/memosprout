# MemoSprout Artifact Compiler Prompt v2

You are compiling one evidence-backed Candidate Sprout into durable repository guidance and executable enforcement for the generated-files repository in your current working directory.

Use only:

1. the Candidate Sprout below;
2. its Open Knowledge Format (OKF) artifact below;
3. the repository files available in the current working directory;
4. the artifact contract in `.memosprout/codex-artifact.schema.json`.

Do not infer another scenario. Do not inspect external directories, environment variables, credentials, or MemoSprout implementation files. Do not add dependencies or use network access.

Create exactly these changes:

- `AGENTS.md`: concise durable guidance for agents. It must explain the trigger, source-of-truth workflow, prohibited direct edit, verification command, and source Candidate Sprout ID.
- `scripts/check-generated-files.ts`: deterministic, observational, non-mutating executable enforcement. It must derive the expected generated client from the source schema through the existing generator logic, compute that expected output in memory or in an isolated temporary location, compare it byte-for-byte with the committed generated client, exit non-zero on any divergence, and contain the source Candidate Sprout ID. It must never overwrite, regenerate, repair, normalize, or otherwise mutate the committed generated file before deciding. It must leave the repository unchanged on success and failure.
- `tests/generated-policy.test.ts`: focused tests for the repository-owned check, including its source Candidate Sprout ID.
- `package.json`: add only `"check:generated": "tsx scripts/check-generated-files.ts"` to `scripts`.

Do not change any other path. In particular, do not change the schema, generated client, generator, application source, existing client tests, dependencies, or configuration. Keep durable guidance separate from executable enforcement.

Run relevant tests and the new check. Then return only the JSON object required by the output schema. List all four changed paths exactly once.

Set `observational` to `true` to attest that the generated check only observes repository state and does not mutate it.
Set `reusesPureGenerator` to `true` and `comparisonStrategy` to `complete_byte_equality` to attest that the check imports the existing pure generator/rendering logic, renders the complete expected client in memory, reads the complete committed client without modification, and compares the two complete values byte-for-byte.

## Rejected Candidate Protection Feedback

The previous Candidate Protection was rejected and must not be reused:

- Failure case: `direct-generated-append`
- Expected result: reject
- Observed result: allow
- Repository mutation by the check: none
- Conclusion: the check was observational, but its comparison logic did not detect all byte-level divergence.

Correct this by importing the existing pure generator/rendering function. Read the source schema without modifying it, render the complete expected generated client in memory, read the complete committed generated client without modifying it, and compare the complete strings or Buffers for exact byte equality. Exit non-zero for every difference, including appended or removed text, whitespace changes, reordered content, stale schema output, and manual edits that preserve known fields. Never invoke the repository generator entry point or any code path that writes the committed generated file.

## Candidate Sprout

```json
{{CANDIDATE_JSON}}
```

## Open Knowledge Format (OKF) Artifact

```markdown
{{OKF_MARKDOWN}}
```
