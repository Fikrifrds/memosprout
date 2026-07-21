import { randomBytes } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";

/**
 * Write via a temp file in the same directory, then rename. Rename is
 * atomic on POSIX, so readers never observe a partially written file.
 */
export async function atomicWriteFile(path: string, data: string): Promise<void> {
  const tmpPath = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmpPath, data, "utf8");
    await rename(tmpPath, path);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}

/** Serializes async operations so concurrent writes cannot interleave. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(
      () => fn(),
      () => fn(),
    );
    this.tail = result.catch(() => {});
    return result;
  }
}
