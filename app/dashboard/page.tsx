import { SiteNav } from "@/components/SiteNav";
import { buildDashboardData } from "@/lib/demo/dashboard-data";

export const metadata = {
  title: "Dashboard — MemoSprout",
  description: "Scenarios, validated sprouts, measured outcomes, and cost-intelligence routing.",
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function DashboardPage() {
  const data = buildDashboardData();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-slate-600">
          Scenarios, validated sprouts, measured outcomes, and routing decisions.
        </p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Scenarios</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {data.scenarios.map((scenario) => (
              <div key={scenario.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">{scenario.title}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium text-red-600">Trap: </span>
                  {scenario.trap}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium text-emerald-600">Sprout: </span>
                  {scenario.guidance}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Validated sprouts</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Scenario</th>
                  <th className="px-4 py-2 font-medium">Sprout ID</th>
                  <th className="px-4 py-2 font-medium">Scope</th>
                </tr>
              </thead>
              <tbody>
                {data.sprouts.map((sprout) => (
                  <tr key={sprout.sproutId} className="border-b border-slate-100">
                    <td className="px-4 py-2">{sprout.scenario}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{sprout.sproutId}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      {sprout.scopePaths.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Measured outcomes (sprout impact)</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Scenario</th>
                  <th className="px-4 py-2 font-medium">Without</th>
                  <th className="px-4 py-2 font-medium">With</th>
                  <th className="px-4 py-2 font-medium">Lift</th>
                </tr>
              </thead>
              <tbody>
                {data.scenarioSummaries.map((summary) => (
                  <tr key={summary.scenario} className="border-b border-slate-100">
                    <td className="px-4 py-2">{summary.scenario}</td>
                    <td className="px-4 py-2 text-slate-500">{pct(summary.baselineRate)}</td>
                    <td className="px-4 py-2 font-medium text-emerald-600">
                      {pct(summary.protectedRate)}
                    </td>
                    <td className="px-4 py-2 font-semibold">+{pct(summary.lift)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Cost–Intelligence routing</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Scenario</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.routing.decisions.map((decision) => (
                  <tr key={decision.scenario} className="border-b border-slate-100">
                    <td className="px-4 py-2">{decision.scenario}</td>
                    <td className="px-4 py-2 font-mono text-xs">{decision.model}</td>
                    <td className="px-4 py-2 text-slate-600">{decision.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Relative cost {data.routing.totalRelativeCost} versus always-frontier{" "}
            {data.routing.alwaysFrontierCost} — savings {data.routing.savings}.
          </p>
        </section>
      </main>
    </>
  );
}
