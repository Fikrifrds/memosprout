import type { CandidateSprout } from "@/lib/domain/schemas";
import {
  type DemoEval,
  type DemoFinalCard,
  type DemoFreshRun,
  type DemoRun,
} from "@/lib/demo/seeded-flow";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>
  );
}

export function RunScreen({ run }: { run: DemoRun }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {run.id} — {run.title}
        </h2>
        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
          {run.status}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <SectionLabel>Changed files</SectionLabel>
          <ul className="list-inside list-disc font-mono text-sm text-slate-700">
            {run.changedFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>

        <div>
          <SectionLabel>Policy result</SectionLabel>
          <p className="text-sm font-medium text-red-600">{run.policyResult}</p>
        </div>

        <div>
          <SectionLabel>Human Correction</SectionLabel>
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{run.humanCorrection}</p>
        </div>
      </div>
    </Card>
  );
}

export function CandidateScreen({ candidate }: { candidate: CandidateSprout }) {
  const { title, trigger, procedure, evidence } = candidate;
  return (
    <Card>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
        Candidate Sprout
      </p>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>

      <div className="space-y-4">
        <div>
          <SectionLabel>Trigger</SectionLabel>
          <p className="text-sm text-slate-700">{trigger}</p>
        </div>

        <div>
          <SectionLabel>Procedure</SectionLabel>
          <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700">
            {procedure.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div>
          <SectionLabel>Evidence</SectionLabel>
          <p className="font-mono text-xs text-slate-500">
            {evidence.failedAgentRunId} · {evidence.humanCorrectionId} · failed policy test
          </p>
        </div>
      </div>
    </Card>
  );
}

export function EvalScreen({ evaluation }: { evaluation: DemoEval }) {
  const rows = [
    {
      label: "Correct workflow",
      without: evaluation.without.correctWorkflow,
      with: evaluation.with.correctWorkflow,
    },
    {
      label: "Policy violations",
      without: String(evaluation.without.policyViolations),
      with: String(evaluation.with.policyViolations),
    },
    {
      label: "Valid changes blocked",
      without: "—",
      with: evaluation.with.validChangesBlocked,
    },
  ];
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">Baseline vs Protected</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 font-medium">Metric</th>
            <th className="py-2 font-medium">Without</th>
            <th className="py-2 font-medium">With</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-100">
              <td className="py-2 text-slate-700">{row.label}</td>
              <td className="py-2 text-slate-500">{row.without}</td>
              <td className="py-2 font-semibold text-emerald-600">{row.with}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function PublishedScreen({
  freshRun,
  finalCard,
}: {
  freshRun: DemoFreshRun;
  finalCard: DemoFinalCard;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Fresh Codex Session
        </p>
        <h2 className="mb-4 text-lg font-semibold">Task: {freshRun.task}</h2>

        <div className="mb-4">
          <SectionLabel>Relevant Validated Sprout loaded</SectionLabel>
          <p className="text-sm text-emerald-700">✓ {freshRun.sproutLoaded}</p>
        </div>

        <div>
          <SectionLabel>Result</SectionLabel>
          <ul className="space-y-1 text-sm text-emerald-700">
            {freshRun.results.map((result) => (
              <li key={result}>✓ {result}</li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="rounded-xl bg-slate-900 p-6 text-center text-white">
        <p className="text-2xl font-semibold">
          {finalCard.humanCorrections} Human Correction · {finalCard.validatedSprouts} Validated
          Sprout
        </p>
        <p className="mt-1 text-slate-300">{finalCard.summary}</p>
      </div>
    </div>
  );
}
