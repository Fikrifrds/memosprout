// Smoke test: import the BUILT package (dist/) with plain node and exercise it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "../dist/index.js";

const dir = await mkdtemp(join(tmpdir(), "memosprout-smoke-"));

try {
  const ms = new MemoSprout(dir);

  const correction = await ms.correct({
    wrong: "Annual leave is 12 days",
    correct: "Annual leave is 15 days since January 2026",
    keywords: ["leave", "annual"],
    source: "HR Policy v3.2",
  });
  console.log("✓ correct():", correction.correctionId, correction.status);

  const { context, corrections } = await ms.context("How many leave days do I get?");
  console.log("✓ context(): matched", corrections.length, "correction(s)");
  if (!context.includes("15 days")) throw new Error("context missing correction");

  const badCheck = await ms.check("Annual leave is 12 days for everyone");
  console.log("✓ check() wrong answer blocked:", !badCheck.ok);
  if (badCheck.ok) throw new Error("should have blocked wrong answer");

  const goodCheck = await ms.check("Annual leave is 15 days for everyone");
  console.log("✓ check() correct answer allowed:", goodCheck.ok);

  const report = await ms.report();
  console.log("✓ report():", report.correctionsServed, "served,", report.blocksTriggered, "blocked");

  console.log("\nSMOKE TEST PASSED — built package is importable and functional.");
} finally {
  await rm(dir, { recursive: true, force: true });
}
