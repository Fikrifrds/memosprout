import { verifyConvergenceDesign } from "@/lib/eval/v3/contract";

async function main(): Promise<void> {
  const design = await verifyConvergenceDesign(process.cwd());
  console.log("Convergence experiment design verified (model-free).");
  console.log(`scenario: ${design.contract.scenario}`);
  console.log(`conditions: ${design.contract.conditions.join(", ")}`);
  console.log(`caseIds: ${design.contract.caseIds.join(", ")}`);
  console.log(`trialsPerCase: ${design.contract.trialsPerCase}`);
  console.log(`cheapModel: ${design.contract.worker.cheapModel}`);
  console.log(`frontierModel: ${design.contract.worker.frontierModel}`);
  console.log(`rubricSha256: ${design.contract.rubricSha256}`);
  console.log(`executionAuthorized: ${design.contract.executionAuthorized}`);
  console.log(`frozenInputs: ${design.manifest.files.length} files`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
