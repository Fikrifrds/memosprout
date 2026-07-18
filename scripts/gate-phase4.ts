import {
  assertPhase4OutcomeGate,
  verifyCommittedPhase4Evidence,
} from "@/lib/eval/verification";

const { liveReport } = await verifyCommittedPhase4Evidence();
assertPhase4OutcomeGate(liveReport);

process.stdout.write("Phase 4 frozen outcome gate passed.\n");
