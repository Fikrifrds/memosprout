import type { OkResponse } from "../lib/response.js";
import type { Invoice, RequestContext } from "../lib/types.js";
import type { InvoiceRepository } from "../repositories/invoice-repository.js";

/**
 * List invoices for the authenticated tenant.
 *
 * Supports the same paging query parameters as the other list endpoints.
 */
export function listInvoices(
  _repository: InvoiceRepository,
  _context: RequestContext,
  _query: Record<string, unknown> = {},
): OkResponse<Invoice[]> {
  throw new Error("not implemented");
}
