# Submission Summary

Name: **MemoSprout — Correct Once. Improve Every Agent.**

Track: **Developer Tools**.

Submission thesis:

> MemoSprout turns agent outcomes and human corrections into verified, portable knowledge that improves future AI-agent runs. It turns one coding Agent Run and its Human Correction into an executable regression check, then proves that a fresh Codex session performs better.

Build Week is not the place to build a full control plane. The judged project must be a working, coherent, and easy-to-test vertical slice.

Rules snapshot: the deadline is **July 21, 2026, at 5:00 p.m. PDT**; the submission period began on July 13, 2026. Pre-existing projects are allowed if they are meaningfully extended after the submission period begins and the new work is clearly distinguished. [BW1][BW2]

This `BUILD_WEEK_PRD.md` document is authoritative for the current implementation scope. The accepted Build Week architecture and scope defined here must be preserved unless this document is explicitly revised.

# 1. Objective

## Primary Objective

Build an end-to-end demo:

```text
Codex makes a project-specific mistake
        ↓
Human Correction is captured
        ↓
GPT-5.6 creates a Candidate Sprout
        ↓
MemoSprout exports an Open Knowledge Format (OKF) artifact
        ↓
Codex creates an executable regression check
        ↓
Baseline Run vs Protected Run replay is measured
        ↓
Fresh Codex session avoids the same class of mistake
```

## Secondary Objective

Create a submission that meets every requirement:

- working project;
- public YouTube video < 3 minutes;
- repository accessible to judges;
- README describing Codex collaboration;
- `/feedback` Codex Session ID;
- installation/test instructions for a developer tool;
- all submission materials in English. [BW1][BW2]

# 2. Repository Strategy

MemoSprout was previously a game. The accepted Build Week decision is to use the existing repository:

```text
Repository: Fikrifrds/memosprout
Use the MemoSprout brand and domain
Document prior MemoSprout history in README
Clearly state that all agent-learning functionality is new Build Week work
```

The earlier new-repository recommendation is superseded by accepted decision BW-001 in `docs/DECISIONS.md`. Dated commits and the Build Week changelog distinguish new work for judges without moving the implementation.

Required evidence:

- dated commits after July 13;
- one primary Codex thread;
- `/feedback` session ID;
- `BUILD_WEEK_CHANGELOG.md`;
- README section “What existed before vs what was built during Build Week”.

# 3. Demo Scenario

## Scenario: Generated Files

Repository contains:

```text
api/openapi.yaml
scripts/generate-client.ts
generated/api-client.ts
tests/generated-policy.test.ts
```

Task given to baseline Codex:

> Add the new `phone_number` field to the generated client.

During the Baseline Run, Codex directly edits `generated/api-client.ts`. Tests or the policy check fail.

Human Correction:

> Generated files must not be edited directly. Change `api/openapi.yaml`, run `npm run generate:api`, and run tests.

MemoSprout generates:

- Candidate Sprout;
- Open Knowledge Format (OKF) Markdown;
- artifact plan;
- pre-tool/CI check;
- test fixtures.

Fresh Codex task:

> Add `preferred_language` to the generated client.

With MemoSprout active, Codex changes the schema, runs the generator, and passes tests.

## Why This Scenario

- easy to understand in under 30 seconds;
- deterministic ground truth;
- no external financial or sensitive systems;
- visibly different before/after behavior;
- showcases context, knowledge, code generation, testing, and agent integration;
- small enough to make reliable before deadline.

# 4. Product Scope for Build Week

## Must Build

1. Web UI with four states: Run, Candidate Sprout, Eval, Published.
2. Synthetic demo repository.
3. Evidence input: Human Correction + diff/test result.
4. GPT-5.6 structured Candidate Sprout extraction.
5. Open Knowledge Format (OKF) export.
6. Codex-driven artifact generation.
7. Baseline Run and Protected Run replay harness.
8. Result comparison.
9. Fresh Codex run or deterministic simulation linked to Codex session.
10. Download/view generated artifact.
11. Judge mode with seeded data and one-click progression.

## Nice to Have

- MCP tool for `get_task_context`.
- Codex plugin/hooks package.
- export preview for Claude Code/OpenCode.
- shareable result page.

## Do Not Build

- team billing;
- full GitHub App;
- enterprise auth;
- cloud multi-tenant permissions;
- broad knowledge graph;
- automatic cross-company Reflex Mesh;
- multiple complex demo scenarios;
- complete self-hosted infrastructure.

# 5. OpenAI Usage

## 5.1 GPT-5.6 Inside the Product

Use the Responses API with structured output for:

- evidence interpretation;
- Candidate Sprout title/type;
- trigger and scope;
- procedure and prohibited action;
- uncertainty identification;
- artifact recommendation;
- short human explanation.

Example output contract:

```json
{
  "title": "Generated files must not be edited directly",
  "type": "Agent Experience",
  "trigger": "Task modifies generated API client",
  "procedure": [
    "Modify api/openapi.yaml",
    "Run npm run generate:api",
    "Run tests"
  ],
  "prohibited": ["Direct edit in generated/**"],
  "scope": {"paths": ["generated/**"]},
  "uncertainties": [],
  "artifact": "ci_and_hook"
}
```

GPT-5.6 supports structured outputs and tool-enabled Responses API workflows. [BW3]

## 5.2 Codex Inside the Product/Demo

Codex must be more than the tool used to build UI. Use Codex to:

- perform the Baseline Run coding task;
- generate the regression check and tests from Candidate Sprout knowledge;
- run/fix the check in the sandbox repository;
- perform the fresh task using the published Validated Sprout;
- provide traceable sessions for the demo.

## 5.3 Codex Used to Build the Project

Use one primary Codex thread to build most core functionality. In README, document:

- what Codex generated;
- where human product decisions changed the plan;
- where Codex accelerated implementation;
- how GPT-5.6 and Codex differ in the architecture;
- the `/feedback` session ID.

# 6. UX

## Screen 1 — Agent Run

```text
Run #001 — Add phone_number to generated client
Status: Failed

Changed files:
- generated/api-client.ts

Policy result:
- Direct generated-file edit detected

Human Correction:
Generated files must be changed through the source schema.
```

CTA: **Grow a Sprout**.

## Screen 2 — Candidate Sprout

```text
Candidate Sprout
Generated files must not be edited directly

Trigger
Task modifies generated API client

Procedure
1. Edit api/openapi.yaml
2. Run generator
3. Run tests

Evidence
Run #001 · Human Correction · failed policy test
```

CTA: **Generate protection**.

## Screen 3 — Eval

```text
                    Without        With
Correct workflow       2/5          5/5
Policy violations      3            0
Valid changes blocked  —            0/8
```

CTA: **Publish Validated Sprout**.

## Screen 4 — Fresh Run

```text
Fresh Codex Session
Task: Add preferred_language

Relevant Validated Sprout loaded:
✓ Generated files must not be edited directly

Result:
✓ Schema changed
✓ Client regenerated
✓ Tests passed
```

Final card:

```text
1 Human Correction
1 Validated Sprout
A fresh agent improved
```

# 7. Technical Architecture

```text
Next.js demo UI
      │
      ▼
Next.js App Router route handlers
      │
      ├── OpenAI Responses API (GPT-5.6 extraction)
      ├── Open Knowledge Format (OKF) renderer
      ├── Codex execution adapter
      └── Temporary local Git copy of the demo repository
      │
      ▼
Sanitized JSON/Markdown evidence + ephemeral UI state
```

Keep infrastructure local or single-instance. Reliability is more important than scalability.

## Suggested Stack

| Component | Choice |
|---|---|
| UI | Next.js + Tailwind |
| API | Next.js App Router route handlers |
| State | Sanitized JSON/Markdown evidence + ephemeral UI state |
| Schema | Zod |
| Model | GPT-5.6 via Responses API |
| Coding execution | Codex CLI/SDK in controlled repo |
| Sandbox | Temporary local Git copy + Codex workspace-write sandbox |
| Tests | Vitest + repository scripts |
| Hosting | Local proof workflow; optional hosted seeded UI |

# 8. Data Model

```typescript
type RunStatus = "failed" | "corrected" | "passed";
type SproutStatus = "candidate" | "testing" | "validated" | "active";

interface AgentRun {
  id: string;
  task: string;
  changedFiles: string[];
  patch: string;
  testResults: TestResult[];
  correction?: string;
  status: RunStatus;
}

interface Sprout {
  id: string;
  title: string;
  trigger: string;
  procedure: string[];
  prohibited: string[];
  evidenceRunIds: string[];
  status: SproutStatus;
  okfMarkdown: string;
}

interface EvalReport {
  baselinePassed: number;
  candidatePassed: number;
  totalTasks: number;
  falsePositivePassed: number;
  falsePositiveTotal: number;
}
```

# 9. Implementation Plan

## July 18 — Foundation

- join hackathon and create project draft;
- confirm the existing `Fikrifrds/memosprout` repository baseline;
- start primary Codex thread;
- commit baseline and `BUILD_WEEK_CHANGELOG.md`;
- build demo repository;
- run the Baseline Run Codex task;
- implement data schemas;
- call GPT-5.6 and render the Candidate Sprout.

Exit gate:

```text
Failed Agent Run → structured Candidate Sprout → Open Knowledge Format (OKF) preview
```

## July 19 — Artifact and Eval

- Codex artifact generation;
- deterministic policy/test;
- Baseline Run fixture suite;
- Protected Run fixture suite;
- comparison UI;
- approve/publish state;
- save generated artifact.

Exit gate:

```text
Candidate Sprout → executable check → measured improvement
```

## July 20 — Fresh Agent and Polish

- fresh Codex task;
- task-context injection or published instruction;
- reliable passing result;
- judge mode;
- error handling;
- responsive UI;
- README draft;
- start recording rehearsal.

Exit gate:

```text
One Human Correction → fresh Codex session improves
```

## July 21 — Submission

- freeze features;
- run clean-install test;
- collect `/feedback` session ID;
- finalize README and testing instructions;
- record <3-minute English video;
- upload public YouTube video;
- share private repo with required emails or make public;
- complete Devpost form;
- submit well before deadline.

Deadline is 21 July 2026 at 17:00 Pacific Time; in WIB this is early morning on 22 July, so operationally treat the evening of 21 July WIB as the internal cutoff. [BW1]

# 10. Submission Requirements Checklist

Official requirements include: [BW1][BW2]

- [ ] Project built with Codex and GPT-5.6.
- [ ] Developer Tools category selected.
- [ ] Working/runnable project.
- [ ] Text description in English.
- [ ] Public YouTube video under 3 minutes.
- [ ] Audio explains product plus use of Codex and GPT-5.6.
- [ ] Repository URL.
- [ ] If private, shared with `testing@devpost.com` and `build-week-event@openai.com`.
- [ ] README with setup, sample data, and testing instructions.
- [ ] README explains Codex collaboration and human decisions.
- [ ] `/feedback` Codex Session ID.
- [ ] Developer-tool installation instructions.
- [ ] Easy test path without rebuilding everything.
- [ ] New Build Week work clearly separated from old MemoSprout.
- [ ] Third-party licenses and trademarks reviewed.
- [ ] Project available free for judging through judging period.

# 11. Judging Strategy

The four equally weighted judging dimensions are technological implementation, design, potential impact, and quality of idea. [BW2]

## Technological Implementation

Show:

- GPT-5.6 structured Candidate Sprout extraction;
- Codex building core and generating/running executable artifacts;
- sandbox/Historical Replay;
- Open Knowledge Format (OKF) output;
- working code, not static mock.

## Design

Show one coherent story, seeded demo, error states, evidence, and clear before/after. Avoid a generic admin dashboard.

## Potential Impact

Make the audience specific:

> Engineering teams using coding agents that repeatedly spend human review time on the same project-specific corrections.

Demonstrate that a Human Correction becomes durable and reusable.

## Quality of Idea

Differentiate from memory:

> Memory stores a note. MemoSprout attaches evidence, creates an executable check, validates it, and publishes a Validated Sprout as portable knowledge.

# 12. Video Script — 2:30 Target

## 0:00–0:15 — Problem

“Coding agents are powerful, but Human Corrections disappear inside old sessions and review comments. The next agent can repeat the same mistake.”

Show baseline Codex editing generated file and failing.

## 0:15–0:40 — Capture and GPT-5.6

“MemoSprout captures the failed Agent Run and the Human Correction. GPT-5.6 turns that evidence into a structured Candidate Sprout with a narrow trigger, procedure, and scope.”

Show the Candidate Sprout and evidence.

## 0:40–1:15 — Codex Creates Protection

“Codex then converts the Candidate Sprout into an executable project check and test suite.”

Show generated check, test run, and fix.

## 1:15–1:45 — Verification

“MemoSprout never trusts generated memory blindly. Through Historical Replay, it compares a Baseline Run with a Protected Run using the Candidate Sprout.”

Show metrics.

## 1:45–2:15 — Fresh Session

“A fresh Codex session gets a similar task. It edits the source schema, regenerates the client, and passes the tests—without access to the original conversation.”

## 2:15–2:30 — Vision

“MemoSprout publishes the lesson as portable Open Knowledge Format (OKF) knowledge. Correct once. Improve every agent.”

# 13. Devpost Description Draft

## Inspiration

AI coding agents often repeat project-specific mistakes because Human Corrections remain trapped in sessions and review comments.

## What It Does

MemoSprout turns agent outcomes and human corrections into verified, portable knowledge that improves future AI-agent runs. It converts a failed Agent Run and Human Correction into a structured Candidate Sprout. It exports the Candidate Sprout as portable Open Knowledge Format (OKF) knowledge, asks Codex to generate an executable regression check, evaluates the check through Historical Replay with Baseline Run tasks, and publishes it as a Validated Sprout only after it measurably improves results. A fresh Codex session can then use the Validated Sprout without relying on the original conversation.

## How We Built It

GPT-5.6 analyzes evidence and produces structured Candidate Sprouts. Codex was used to build the core application and, inside the product workflow, to create and execute the regression artifact. The demo uses an isolated repository where generated files must be changed through a source schema.

## Challenges

Separating a reusable lesson from a one-off Human Correction, avoiding overgeneralization, and proving improvement without hiding regressions.

## Accomplishments

A full loop from failure to evidence-backed portable knowledge, executable protection, Historical Replay evaluation, and a successful fresh Agent Run.

## What Is Next

Cross-agent compilers for Claude Code and OpenCode, GitHub PR integration, team approval, and outcome-linked Agent Improvement CI/CD.

# 14. README Structure

```text
# MemoSprout
## What It Does
## Demo
## Architecture
## Why This Is Not Agent Memory
## GPT-5.6 Usage
## How Codex Was Used
## Human Product and Engineering Decisions
## Build Week Scope vs Pre-Existing MemoSprout
## Installation
## Judge Quickstart
## Test Scenarios
## Open Knowledge Format (OKF) Output
## Security and Limitations
## License
## Build Week Changelog
## Codex /feedback Session ID
```

# 15. Judge Quickstart

Target command:

```bash
git clone <repo>
cd memosprout
cp .env.example .env
pnpm install --frozen-lockfile
pnpm demo
```

Alternative hosted demo must have a **Reset demo** button.

Provide fallback prerecorded fixtures if live Codex execution is temporarily unavailable, but clearly distinguish fixture playback from live capability. The product depicted in the video must run consistently as described. [BW2]

# 16. Risks and Contingencies

| Risk | Contingency |
|---|---|
| Codex execution nondeterministic | deterministic fixture suite + retry limit |
| API rate/cost issue | cache Candidate Sprout and provide resettable seeded demo |
| Live sandbox unavailable | local judge script and video proof |
| Too much scope | remove cross-agent adapters first |
| Candidate Sprout extraction weak | fixed structured schema and narrow scenario |
| Existing-project eligibility ambiguity | dated commits, timestamped changelog, and explicit pre-existing-vs-new README section |
| Video exceeds time | script 2:30 and hard cut |
| Judge cannot install | hosted judge mode + exact quickstart |

# 17. Definition of Done

Submission is ready only if:

1. a clean environment can run the demo;
2. GPT-5.6 call is visible and meaningful;
3. Codex performs baseline and artifact work;
4. an Open Knowledge Format (OKF) file is generated;
5. before/after comparison is reproducible;
6. fresh task succeeds for the correct reason;
7. README covers every official requirement;
8. video is public, English, and under three minutes;
9. `/feedback` Session ID is recorded;
10. new work is clearly separated from old product;
11. repository/testing access remains available through judging.

# 18. Official Sources

[BW1] OpenAI Build Week overview: https://openai.devpost.com/

[BW2] OpenAI Build Week Official Rules: https://openai.devpost.com/rules

[BW3] GPT-5.6 model documentation: https://developers.openai.com/api/docs/models/gpt-5.6-sol

Important verified facts from the official pages include the July 21 deadline, Developer Tools track, <3-minute public YouTube video, repository/testing access, README requirements, `/feedback` Session ID, and meaningful extension rules for pre-existing projects.
