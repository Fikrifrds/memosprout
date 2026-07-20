import { Database } from "./db.js";
import { registerSession } from "../middleware/auth.js";
import type { Invoice, Project, RequestContext } from "./types.js";

export const acmeContext: RequestContext = {
  tenantId: "tenant_acme",
  userId: "user_ada",
  requestId: "req_test",
};

export const globexContext: RequestContext = {
  tenantId: "tenant_globex",
  userId: "user_bob",
  requestId: "req_test",
};

function invoice(overrides: Partial<Invoice> & Pick<Invoice, "id" | "tenantId">): Invoice {
  return {
    projectId: "project_1",
    amountCents: 1000,
    status: "issued",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<Project> & Pick<Project, "id" | "tenantId">): Project {
  return {
    name: "Project",
    ownerId: "user_ada",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Seeds two tenants so that tenant-scoping mistakes are visible in tests. */
export function seedDatabase(): Database {
  const db = new Database();
  registerSession("token_ada", { tenantId: "tenant_acme", userId: "user_ada" });
  registerSession("token_bob", { tenantId: "tenant_globex", userId: "user_bob" });

  db.insert("projects", project({ id: "project_1", tenantId: "tenant_acme" }));
  db.insert("projects", project({ id: "project_2", tenantId: "tenant_globex" }));

  db.insert(
    "invoices",
    invoice({ id: "invoice_1", tenantId: "tenant_acme", createdAt: "2026-01-05T00:00:00.000Z" }),
  );
  db.insert(
    "invoices",
    invoice({ id: "invoice_2", tenantId: "tenant_acme", createdAt: "2026-01-04T00:00:00.000Z" }),
  );
  db.insert(
    "invoices",
    invoice({ id: "invoice_3", tenantId: "tenant_acme", createdAt: "2026-01-03T00:00:00.000Z" }),
  );
  db.insert(
    "invoices",
    invoice({
      id: "invoice_archived",
      tenantId: "tenant_acme",
      createdAt: "2026-01-02T00:00:00.000Z",
      archivedAt: "2026-02-01T00:00:00.000Z",
    }),
  );
  db.insert(
    "invoices",
    invoice({ id: "invoice_other", tenantId: "tenant_globex", createdAt: "2026-01-06T00:00:00.000Z" }),
  );
  return db;
}
