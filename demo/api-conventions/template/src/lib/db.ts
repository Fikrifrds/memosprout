import { ApiError } from "./errors.js";
import type { RequestContext } from "./types.js";

export interface Row {
  id: string;
  tenantId: string;
  archivedAt: string | null;
}

/**
 * In-memory stand-in for the real database. Tables are plain arrays; repositories must go
 * through `scopedSelect` rather than reading `table` directly, so that tenant scoping and
 * archive filtering are applied in exactly one place.
 */
export class Database {
  private readonly tables = new Map<string, Row[]>();
  private readonly auditLog: AuditEntry[] = [];

  table<T extends Row>(name: string): T[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows as T[];
  }

  /**
   * The only supported way to read rows. Applies the tenant scope from the authenticated
   * context and excludes archived rows unless explicitly requested.
   */
  scopedSelect<T extends Row>(
    name: string,
    context: RequestContext,
    options: { includeArchived?: boolean } = {},
  ): T[] {
    return this.table<T>(name).filter(
      (row) =>
        row.tenantId === context.tenantId &&
        (options.includeArchived === true || row.archivedAt === null),
    );
  }

  insert<T extends Row>(name: string, row: T): T {
    this.table<T>(name).push(row);
    return row;
  }

  recordAudit(entry: AuditEntry): void {
    this.auditLog.push(entry);
  }

  listAudit(): readonly AuditEntry[] {
    return this.auditLog;
  }
}

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId: string;
  tenantId: string;
  actorId: string;
  requestId: string;
}

/**
 * Every state-changing operation must be wrapped in `withAudit`, which records who changed
 * what. Reviews reject mutations that write to a table without an audit entry.
 */
export function withAudit<T>(
  db: Database,
  context: RequestContext,
  entry: { action: string; resource: string; resourceId: string },
  operation: () => T,
): T {
  const result = operation();
  db.recordAudit({
    ...entry,
    tenantId: context.tenantId,
    actorId: context.userId,
    requestId: context.requestId,
  });
  return result;
}

export function requireFound<T>(row: T | undefined, resource: string): T {
  if (row === undefined) throw ApiError.notFound(resource);
  return row;
}
