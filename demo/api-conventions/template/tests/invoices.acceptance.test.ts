import { describe, expect, it } from "vitest";

import { ApiError } from "../src/lib/errors.js";
import { acmeContext, globexContext, seedDatabase } from "../src/lib/fixtures.js";
import { InvoiceRepository } from "../src/repositories/invoice-repository.js";
import { listInvoices } from "../src/routes/invoices.js";

function listFor(context = acmeContext, query: Record<string, unknown> = {}) {
  const repository = new InvoiceRepository(seedDatabase());
  return listInvoices(repository, context, query);
}

describe("listInvoices acceptance", () => {
  it("returns only the authenticated tenant's invoices", () => {
    const ids = listFor().body.data.map((invoice) => invoice.id);
    expect(ids).not.toContain("invoice_other");
    for (const id of ids) {
      expect(id.startsWith("invoice_")).toBe(true);
    }
    expect(listFor(globexContext).body.data.map((invoice) => invoice.id)).toEqual([
      "invoice_other",
    ]);
  });

  it("excludes archived invoices", () => {
    expect(listFor().body.data.map((invoice) => invoice.id)).not.toContain("invoice_archived");
  });

  it("sorts newest first", () => {
    expect(listFor().body.data.map((invoice) => invoice.id)).toEqual([
      "invoice_1",
      "invoice_2",
      "invoice_3",
    ]);
  });

  it("returns the paging cursor in meta, not in data", () => {
    const response = listFor(acmeContext, { limit: 2 });
    expect(response.body.data.map((invoice) => invoice.id)).toEqual(["invoice_1", "invoice_2"]);
    expect(response.body.meta?.nextCursor).toBe("invoice_2");
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("continues from a cursor", () => {
    const response = listFor(acmeContext, { limit: 2, cursor: "invoice_2" });
    expect(response.body.data.map((invoice) => invoice.id)).toEqual(["invoice_3"]);
    expect(response.body.meta?.nextCursor).toBeNull();
  });

  it("rejects an invalid limit as a validation error", () => {
    try {
      listFor(acmeContext, { limit: 0 });
      throw new Error("expected listInvoices to reject limit 0");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("validation_failed");
      expect((error as ApiError).details.field).toBe("limit");
    }
  });

  it("rejects an unknown cursor as a validation error", () => {
    try {
      listFor(acmeContext, { cursor: "invoice_missing" });
      throw new Error("expected listInvoices to reject an unknown cursor");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("validation_failed");
    }
  });
});
