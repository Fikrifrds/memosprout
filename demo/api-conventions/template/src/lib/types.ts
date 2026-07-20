export interface RequestContext {
  /** Authenticated tenant. Never taken from request input. */
  tenantId: string;
  userId: string;
  requestId: string;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  ownerId: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  projectId: string;
  amountCents: number;
  status: "draft" | "issued" | "paid" | "void";
  archivedAt: string | null;
  createdAt: string;
}

export interface ListOptions {
  limit?: number;
  cursor?: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
