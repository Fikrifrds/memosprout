import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CandidateExtractionError,
  extractLiveCandidate,
  loadSeededEvidence,
} from "@/lib/openai/extract-candidate";
import {
  okfDownloadFilename,
  renderCandidateOkf,
} from "@/lib/okf/render";
import { parseAndValidateOkf } from "@/lib/okf/validate";

try {
  const candidate = await extractLiveCandidate({
    evidence: await loadSeededEvidence(),
    apiKey: process.env.OPENAI_API_KEY,
  });
  const markdown = renderCandidateOkf(candidate);
  parseAndValidateOkf(markdown);

  const outputDirectory = join(
    process.cwd(),
    "demo",
    "generated-files",
    "evidence",
    "live",
  );
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(outputDirectory, "candidate.json"),
      `${JSON.stringify(candidate, null, 2)}\n`,
      "utf8",
    ),
    writeFile(join(outputDirectory, okfDownloadFilename), markdown, "utf8"),
  ]);

  process.stdout.write("Live Candidate Sprout generated and validated.\n");
  process.stdout.write(`Response ID: ${candidate.provenance.responseId}\n`);
  process.stdout.write(`Returned model: ${candidate.provenance.modelReturned}\n`);
  process.stdout.write("Sanitized live artifacts were written to the live evidence directory.\n");
} catch (error) {
  if (error instanceof CandidateExtractionError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write("internal_error: Live Candidate generation failed safely.\n");
    process.exitCode = 1;
  }
}
