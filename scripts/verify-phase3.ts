import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  protectionArtifactPaths,
  protectionRunSchema,
  sha256,
} from "@/lib/codex/artifact";
import {
  assertProtectionAcceptance,
  runProtectionAcceptanceSuite,
} from "@/lib/codex/acceptance";
import { getCodexThreadId, parseCodexJsonl } from "@/lib/codex/jsonl";
import { assertSanitizedEvidence } from "@/lib/codex/sanitize";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "generated-files", "evidence");
const templateRoot = join(root, "demo", "generated-files", "template");
const [liveText, seededText, outputText, trace, patch] = await Promise.all([
  readFile(join(evidenceRoot, "live", "protection-run.json"), "utf8"),
  readFile(join(evidenceRoot, "seeded", "protection-run.json"), "utf8"),
  readFile(join(evidenceRoot, "live", "protection-output.json"), "utf8"),
  readFile(join(evidenceRoot, "live", "protection-trace.jsonl"), "utf8"),
  readFile(join(evidenceRoot, "live", "protection.patch"), "utf8"),
]);
const live = protectionRunSchema.parse(JSON.parse(liveText));
const seeded = protectionRunSchema.parse(JSON.parse(seededText));

if (JSON.stringify(live.output) !== JSON.stringify(JSON.parse(outputText))) {
  throw new Error("Live structured Codex output does not match its run record.");
}
if (seeded.liveSourceRunId !== live.id) {
  throw new Error("Seeded protection evidence does not reference the live run.");
}
if (live.patchSha256 !== sha256(patch)) {
  throw new Error("Protection patch hash does not match the live run record.");
}
assertSanitizedEvidence(trace);
assertSanitizedEvidence(patch);
const events = parseCodexJsonl(trace).events;
if (getCodexThreadId(events) !== live.codex.threadId) {
  throw new Error("Sanitized trace thread ID does not match live provenance.");
}

for (const path of protectionArtifactPaths) {
  const content = await readFile(join(templateRoot, path));
  if (live.artifactHashes[path] !== sha256(content)) {
    throw new Error(`Artifact hash mismatch: ${path}.`);
  }
}

const acceptance = await runProtectionAcceptanceSuite(templateRoot);
assertProtectionAcceptance(acceptance);
if (JSON.stringify(acceptance) !== JSON.stringify(live.acceptance)) {
  throw new Error("Current protection acceptance results differ from live evidence.");
}

process.stdout.write("Phase 3 live and seeded protection evidence verified.\n");
