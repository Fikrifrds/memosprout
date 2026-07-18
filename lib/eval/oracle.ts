import { createHash } from "node:crypto";

import {
  readCommittedGeneratedClient,
  renderExpectedGeneratedClient,
} from "@/lib/scenario/generated-files";

export type EvidenceOracleResult =
  | {
      passed: true;
      reason: "generated-client-consistent";
      expectedSha256: string;
      actualSha256: string;
    }
  | {
      passed: false;
      reason: "generated-client-diverged";
      expectedSha256: string;
      actualSha256: string;
    };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function evaluateGeneratedFilesEvidence(
  repositoryRoot: string,
): Promise<EvidenceOracleResult> {
  const [expectedClient, actualClient] = await Promise.all([
    renderExpectedGeneratedClient(repositoryRoot),
    readCommittedGeneratedClient(repositoryRoot),
  ]);
  const expectedSha256 = sha256(expectedClient);
  const actualSha256 = sha256(actualClient);

  if (expectedClient === actualClient) {
    return {
      passed: true,
      reason: "generated-client-consistent",
      expectedSha256,
      actualSha256,
    };
  }

  return {
    passed: false,
    reason: "generated-client-diverged",
    expectedSha256,
    actualSha256,
  };
}
