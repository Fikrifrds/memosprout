import {
  phase4V2TaskIdSchema,
  phase4V2TrialIdSchema,
  phase4V2WorkerOutputSchema,
} from "@/lib/eval/v2/contract";

export function validateWorkerOutputBinding(options: {
  output: unknown;
  launchedTaskId: string;
  launchedTrialId: string;
}) {
  const launchedTaskId = phase4V2TaskIdSchema.parse(options.launchedTaskId);
  const launchedTrialId = phase4V2TrialIdSchema.parse(options.launchedTrialId);
  const output = phase4V2WorkerOutputSchema.parse(options.output);
  if (output.taskId !== launchedTaskId) {
    throw new Error(
      `Worker output taskId does not match launched task: expected ${launchedTaskId}, received ${output.taskId}.`,
    );
  }
  if (output.trialId !== launchedTrialId) {
    throw new Error(
      `Worker output trialId does not match launched trial: expected ${launchedTrialId}, received ${output.trialId}.`,
    );
  }
  return output;
}
