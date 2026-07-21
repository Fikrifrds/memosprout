import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoSprout } from "@/lib/index";

describe("MemoSprout concurrency", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-conc-"));
    ms = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("does not lose confirmCount increments under concurrent correct()", async () => {
    const options = { wrong: "Refund takes 3 days", correct: "Refund takes 5 days" };
    await ms.correct(options); // create (confirmCount 0)

    await Promise.all(Array.from({ length: 10 }, () => ms.correct(options)));

    const [record] = await ms.list();
    expect(record.confirmCount).toBe(10);
  });

  it("keeps state consistent under concurrent approve/remove", async () => {
    const created = await ms.correct({
      wrong: "Old policy",
      correct: "New policy",
      role: "customer", // suggested
    });

    const results = await Promise.allSettled([
      ms.approve(created.correctionId),
      ms.remove(created.correctionId),
    ]);

    // Both operations ran serialized — final state is a valid record,
    // whichever order they landed in.
    const record = await ms.get(created.correctionId);
    expect(record).toBeDefined();
    expect(["active", "deprecated"]).toContain(record!.status);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });
});
