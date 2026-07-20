import { ApiError } from "../lib/errors.js";
import type { RequestContext } from "../lib/types.js";

interface Bucket {
  count: number;
  windowStartedAt: number;
}

const windowMs = 60_000;
const maxRequestsPerWindow = 600;
const buckets = new Map<string, Bucket>();

export function enforceRateLimit(context: RequestContext, now: number = Date.now()): void {
  const key = `${context.tenantId}:${context.userId}`;
  const bucket = buckets.get(key);
  if (bucket === undefined || now - bucket.windowStartedAt >= windowMs) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    return;
  }
  bucket.count += 1;
  if (bucket.count > maxRequestsPerWindow) {
    throw new ApiError("conflict", "rate limit exceeded");
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
