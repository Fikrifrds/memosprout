import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ControlPlane,
  ControlPlaneError,
  loadControlPlane,
  saveControlPlane,
} from "@/lib/control-plane/control-plane";

const sproutId = "sprout_3f7c9a21b8e04d65";
const actor = "reviewer@example.com";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ControlPlane lifecycle", () => {
  it("registers a sprout as a candidate", () => {
    const plane = new ControlPlane();
    const release = plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    expect(release.status).toBe("candidate");
    expect(release.version).toBe(1);
  });

  it("rejects registering the same sprout twice", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    expect(() =>
      plane.register(sproutId, "idempotency", actor, "2026-07-20T00:01:00.000Z"),
    ).toThrow(ControlPlaneError);
  });

  it("moves a sprout through candidate -> validated -> released", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    plane.markValidated(sproutId, actor, "2026-07-20T00:01:00.000Z");
    const released = plane.release(sproutId, actor, "2026-07-20T00:02:00.000Z");
    expect(released.status).toBe("released");
    expect(released.canaryPercent).toBe(100);
  });

  it("supports a canary release percentage", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    plane.markValidated(sproutId, actor, "2026-07-20T00:01:00.000Z");
    const released = plane.release(sproutId, actor, "2026-07-20T00:02:00.000Z", {
      canaryPercent: 10,
    });
    expect(released.canaryPercent).toBe(10);
  });

  it("guards releasing a sprout that is not validated", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    expect(() => plane.release(sproutId, actor, "2026-07-20T00:02:00.000Z")).toThrow(
      ControlPlaneError,
    );
  });

  it("guards validating a sprout that is not a candidate", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    plane.markValidated(sproutId, actor, "2026-07-20T00:01:00.000Z");
    expect(() => plane.markValidated(sproutId, actor, "2026-07-20T00:02:00.000Z")).toThrow(
      ControlPlaneError,
    );
  });

  it("rolls back a released sprout to deprecated", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    plane.markValidated(sproutId, actor, "2026-07-20T00:01:00.000Z");
    plane.release(sproutId, actor, "2026-07-20T00:02:00.000Z");
    const rolledBack = plane.rollback(sproutId, actor, "2026-07-20T00:03:00.000Z", "bad rollout");
    expect(rolledBack.status).toBe("deprecated");
  });

  it("guards rolling back a sprout that is not released", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    expect(() => plane.rollback(sproutId, actor, "2026-07-20T00:03:00.000Z")).toThrow(
      ControlPlaneError,
    );
  });

  it("records the full audit trail in order", () => {
    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    plane.markValidated(sproutId, actor, "2026-07-20T00:01:00.000Z");
    plane.release(sproutId, actor, "2026-07-20T00:02:00.000Z");
    plane.rollback(sproutId, actor, "2026-07-20T00:03:00.000Z");

    const trail = plane.auditTrail(sproutId);
    expect(trail.map((entry) => entry.action)).toEqual([
      "registered",
      "validated",
      "released",
      "rolled_back",
    ]);
    expect(trail.every((entry) => entry.actor === actor)).toBe(true);
  });
});

describe("control plane persistence", () => {
  it("round-trips releases and the audit log through save and load", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-control-plane-"));
    tempDirs.push(dir);
    const path = join(dir, "control-plane.json");

    const plane = new ControlPlane();
    plane.register(sproutId, "idempotency", actor, "2026-07-20T00:00:00.000Z");
    plane.markValidated(sproutId, actor, "2026-07-20T00:01:00.000Z");
    plane.release(sproutId, actor, "2026-07-20T00:02:00.000Z", { canaryPercent: 25 });
    await saveControlPlane(plane, path);

    const loaded = await loadControlPlane(path);
    expect(loaded.getRelease(sproutId)?.status).toBe("released");
    expect(loaded.getRelease(sproutId)?.canaryPercent).toBe(25);
    expect(loaded.auditTrail(sproutId)).toHaveLength(3);
  });

  it("loads an empty control plane when the file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-control-plane-"));
    tempDirs.push(dir);
    const loaded = await loadControlPlane(join(dir, "missing.json"));
    expect(loaded.listReleases()).toEqual([]);
  });
});
