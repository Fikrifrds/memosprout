import { readFile, stat, writeFile } from "node:fs/promises";

import { z } from "zod";

import {
  auditEntrySchema,
  sproutReleaseSchema,
  type AuditAction,
  type AuditEntry,
  type SproutRelease,
  type SproutStatus,
} from "@/lib/control-plane/schema";
import { createDeterministicId } from "@/lib/domain/ids";

export class ControlPlaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

interface ControlPlaneState {
  releases: SproutRelease[];
  auditLog: AuditEntry[];
}

const controlPlaneStateSchema = z
  .object({
    releases: z.array(sproutReleaseSchema),
    auditLog: z.array(auditEntrySchema),
  })
  .strict();

export interface TransitionOptions {
  canaryPercent?: number;
  note?: string;
}

export class ControlPlane {
  private readonly releases = new Map<string, SproutRelease>();
  private readonly auditLog: AuditEntry[] = [];

  static fromState(state: ControlPlaneState): ControlPlane {
    const validated = controlPlaneStateSchema.parse(state);
    const plane = new ControlPlane();
    for (const release of validated.releases) {
      plane.releases.set(release.sproutId, release);
    }
    for (const entry of validated.auditLog) {
      plane.auditLog.push(entry);
    }
    return plane;
  }

  register(
    sproutId: string,
    scenario: string,
    actor: string,
    recordedAt: string,
  ): SproutRelease {
    if (this.releases.has(sproutId)) {
      throw new ControlPlaneError(`Sprout ${sproutId} is already registered.`);
    }
    const release = sproutReleaseSchema.parse({
      sproutId,
      scenario,
      status: "candidate",
      version: 1,
      canaryPercent: null,
      updatedAt: recordedAt,
    });
    this.releases.set(sproutId, release);
    this.recordAudit(sproutId, "registered", actor, recordedAt);
    return release;
  }

  markValidated(
    sproutId: string,
    actor: string,
    recordedAt: string,
    note?: string,
  ): SproutRelease {
    this.requireStatus(sproutId, "candidate");
    const next = this.transition(sproutId, "validated", recordedAt);
    this.recordAudit(sproutId, "validated", actor, recordedAt, note);
    return next;
  }

  release(
    sproutId: string,
    actor: string,
    recordedAt: string,
    options: TransitionOptions = {},
  ): SproutRelease {
    this.requireStatus(sproutId, "validated");
    const canaryPercent = options.canaryPercent ?? 100;
    const next = this.transition(sproutId, "released", recordedAt, canaryPercent);
    this.recordAudit(sproutId, "released", actor, recordedAt, options.note);
    return next;
  }

  rollback(
    sproutId: string,
    actor: string,
    recordedAt: string,
    note?: string,
  ): SproutRelease {
    this.requireStatus(sproutId, "released");
    const next = this.transition(sproutId, "deprecated", recordedAt);
    this.recordAudit(sproutId, "rolled_back", actor, recordedAt, note);
    return next;
  }

  deprecate(
    sproutId: string,
    actor: string,
    recordedAt: string,
    note?: string,
  ): SproutRelease {
    this.requireRelease(sproutId);
    const next = this.transition(sproutId, "deprecated", recordedAt);
    this.recordAudit(sproutId, "deprecated", actor, recordedAt, note);
    return next;
  }

  getRelease(sproutId: string): SproutRelease | undefined {
    return this.releases.get(sproutId);
  }

  listReleases(): SproutRelease[] {
    return [...this.releases.values()];
  }

  auditTrail(sproutId?: string): AuditEntry[] {
    return sproutId
      ? this.auditLog.filter((entry) => entry.sproutId === sproutId)
      : [...this.auditLog];
  }

  private recordAudit(
    sproutId: string,
    action: AuditAction,
    actor: string,
    recordedAt: string,
    note?: string,
  ): AuditEntry {
    const auditId = createDeterministicId(
      "audit",
      `${sproutId}:${action}:${actor}:${recordedAt}:${this.auditLog.length}`,
    );
    const entry = auditEntrySchema.parse({ auditId, sproutId, action, actor, note, recordedAt });
    this.auditLog.push(entry);
    return entry;
  }

  private requireRelease(sproutId: string): SproutRelease {
    const release = this.releases.get(sproutId);
    if (!release) {
      throw new ControlPlaneError(`Sprout ${sproutId} is not registered.`);
    }
    return release;
  }

  private requireStatus(sproutId: string, expected: SproutStatus): SproutRelease {
    const release = this.requireRelease(sproutId);
    if (release.status !== expected) {
      throw new ControlPlaneError(
        `Sprout ${sproutId} must be ${expected} but is ${release.status}.`,
      );
    }
    return release;
  }

  private transition(
    sproutId: string,
    status: SproutStatus,
    updatedAt: string,
    canaryPercent: number | null = null,
  ): SproutRelease {
    const current = this.requireRelease(sproutId);
    const next = sproutReleaseSchema.parse({
      ...current,
      status,
      updatedAt,
      canaryPercent: status === "released" ? canaryPercent : null,
    });
    this.releases.set(sproutId, next);
    return next;
  }
}

export async function loadControlPlane(path: string): Promise<ControlPlane> {
  try {
    await stat(path);
  } catch {
    return new ControlPlane();
  }
  const state = controlPlaneStateSchema.parse(JSON.parse(await readFile(path, "utf8")));
  return ControlPlane.fromState(state);
}

export async function saveControlPlane(plane: ControlPlane, path: string): Promise<void> {
  const state: ControlPlaneState = {
    releases: plane.listReleases(),
    auditLog: plane.auditTrail(),
  };
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
