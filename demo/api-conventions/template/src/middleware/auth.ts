import { ApiError } from "../lib/errors.js";
import type { RequestContext } from "../lib/types.js";

interface Session {
  tenantId: string;
  userId: string;
}

const sessions = new Map<string, Session>();

export function registerSession(token: string, session: Session): void {
  sessions.set(token, session);
}

/**
 * Builds the RequestContext from the session token. The tenant always comes from here —
 * routes must never read a tenant id out of the request body or query string.
 */
export function authenticate(token: string | undefined, requestId: string): RequestContext {
  if (token === undefined) {
    throw new ApiError("forbidden", "missing session token");
  }
  const session = sessions.get(token);
  if (session === undefined) {
    throw new ApiError("forbidden", "invalid session token");
  }
  return { tenantId: session.tenantId, userId: session.userId, requestId };
}
