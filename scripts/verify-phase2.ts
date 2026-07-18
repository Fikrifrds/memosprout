import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  candidateSproutSchema,
  type CandidateSprout,
} from "@/lib/domain/schemas";
import {
  createSeededCandidate,
  loadSeededCandidate,
  loadSeededEvidence,
} from "@/lib/openai/extract-candidate";
import {
  okfDownloadFilename,
  renderCandidateOkf,
} from "@/lib/okf/render";
import { parseAndValidateOkf } from "@/lib/okf/validate";

const evidenceDirectory = join(
  process.cwd(),
  "demo",
  "generated-files",
  "evidence",
  "seeded",
);

const evidence = await loadSeededEvidence();
const candidate = await loadSeededCandidate();
const expectedCandidate = createSeededCandidate(evidence);

if (JSON.stringify(candidate) !== JSON.stringify(expectedCandidate)) {
  throw new Error("Committed seeded Candidate does not match deterministic generation.");
}

const renderedMarkdown = renderCandidateOkf(candidate);
const committedMarkdown = await readFile(
  join(evidenceDirectory, okfDownloadFilename),
  "utf8",
);

if (renderedMarkdown !== committedMarkdown) {
  throw new Error("Committed OKF artifact does not match deterministic rendering.");
}

parseAndValidateOkf(committedMarkdown);

const liveEvidenceDirectory = join(
  process.cwd(),
  "demo",
  "generated-files",
  "evidence",
  "live",
);
const liveCandidate = candidateSproutSchema.parse(
  JSON.parse(await readFile(join(liveEvidenceDirectory, "candidate.json"), "utf8")),
) as CandidateSprout;
const liveMarkdown = await readFile(
  join(liveEvidenceDirectory, okfDownloadFilename),
  "utf8",
);

if (liveCandidate.provenance.source !== "live") {
  throw new Error("Committed live Candidate must be labeled as live.");
}
if (
  liveCandidate.provenance.modelReturned === null ||
  liveCandidate.provenance.responseId === null
) {
  throw new Error("Committed live Candidate must record model and response IDs.");
}
if (renderCandidateOkf(liveCandidate) !== liveMarkdown) {
  throw new Error("Committed live OKF artifact does not match deterministic rendering.");
}

parseAndValidateOkf(liveMarkdown);
process.stdout.write("Phase 2 seeded and live Candidate/OKF artifacts verified.\n");
