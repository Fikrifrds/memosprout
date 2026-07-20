import { describe, expect, it } from "vitest";

import { seedDatabase, acmeContext } from "../src/lib/fixtures.js";
import { InvoiceRepository } from "../src/repositories/invoice-repository.js";
import { listInvoices } from "../src/routes/invoices.js";

describe("listInvoices", () => {
  it("returns invoices for the authenticated tenant", () => {
    const repository = new InvoiceRepository(seedDatabase());
    const response = listInvoices(repository, acmeContext);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });
});
