import { assertPhase4V2Design } from "@/lib/eval/v2/design";
import {
  assertPhase4V1Immutable,
  assertPhase4V2FrozenInputs,
} from "@/lib/eval/v2/freeze";
import { assertPhase4V2RepositoryIsolation } from "@/lib/eval/v2/isolation";

const [design, manifest, isolation] = await Promise.all([
  assertPhase4V2Design(),
  assertPhase4V2FrozenInputs(),
  assertPhase4V2RepositoryIsolation(),
]);
await assertPhase4V1Immutable();

process.stdout.write(
  `Phase 4 v2 design verified without live execution: ${design.trials.length} scored trials, ${design.controls.controls.length} controls, frozen manifest ${manifest.version}, neutral repository ${isolation.neutralInitialRepositorySha256}.\n`,
);
