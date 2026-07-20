import { Database, requireFound, withAudit } from "../lib/db.js";
import type { Invoice, ListOptions, Page, RequestContext } from "../lib/types.js";
import { paginate } from "../lib/pagination.js";

export class InvoiceRepository {
  constructor(private readonly db: Database) {}

  list(context: RequestContext, options: ListOptions = {}): Page<Invoice> {
    const rows = this.db
      .scopedSelect<Invoice>("invoices", context)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return paginate(rows, options);
  }

  get(context: RequestContext, id: string): Invoice {
    const row = this.db
      .scopedSelect<Invoice>("invoices", context)
      .find((invoice) => invoice.id === id);
    return requireFound(row, "invoice");
  }

  void(context: RequestContext, id: string): Invoice {
    const invoice = this.get(context, id);
    return withAudit(
      this.db,
      context,
      { action: "void", resource: "invoice", resourceId: id },
      () => {
        invoice.status = "void";
        return invoice;
      },
    );
  }
}
