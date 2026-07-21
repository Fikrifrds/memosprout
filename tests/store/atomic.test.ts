import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { atomicWriteFile, Mutex } from "@/lib/store/atomic";

describe("atomicWriteFile", () => {
  it("writes the file content and leaves no temp files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-atomic-"));
    const target = join(dir, "out.json");
    await atomicWriteFile(target, "hello");
    expect(await readFile(target, "utf8")).toBe("hello");
    const files = await readdir(dir);
    expect(files).toEqual(["out.json"]);
  });

  it("survives concurrent writes to the same path without corruption", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-atomic-"));
    const target = join(dir, "out.json");
    const payloads = Array.from({ length: 20 }, (_, i) => JSON.stringify({ i, pad: "x".repeat(500) }));
    await Promise.all(payloads.map((p) => atomicWriteFile(target, p)));
    const content = await readFile(target, "utf8");
    // Last-writer-wins is fine; a torn/interleaved file is not.
    expect(payloads).toContain(content);
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

describe("Mutex", () => {
  it("serializes async operations in order", async () => {
    const mutex = new Mutex();
    const order: number[] = [];
    await Promise.all([
      mutex.run(async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
      }),
      mutex.run(async () => {
        order.push(2);
      }),
      mutex.run(async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("keeps running after a task throws", async () => {
    const mutex = new Mutex();
    await expect(mutex.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(mutex.run(async () => "ok")).resolves.toBe("ok");
  });
});
