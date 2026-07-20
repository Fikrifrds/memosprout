import { ApiError } from "./errors.js";

/**
 * Minimal validation helpers. Routes validate input through these so that failures surface
 * as `validation_failed` with a `field` detail rather than as a generic 500.
 */
export function requireString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw ApiError.validation(field, `${field} is required`);
  }
  return value.trim();
}

export function optionalPositiveInteger(
  input: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = input[field];
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw ApiError.validation(field, `${field} must be a positive integer`);
  }
  return parsed;
}
