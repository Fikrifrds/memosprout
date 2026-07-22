import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "@/lib/index";
import {
  assertDeterministicReleaseThresholds,
  runDeterministicReadinessEvaluation,
} from "@/lib/eval/knowledge-drift/readiness";

const directory = await mkdtemp(join(tmpdir(), "memosprout-readiness-"));

try {
  const report = await runDeterministicReadinessEvaluation(
    new MemoSprout(directory),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  assertDeterministicReleaseThresholds(report);
  process.stdout.write("\nDeterministic release thresholds passed.\n");
} finally {
  await rm(directory, { recursive: true, force: true });
}
