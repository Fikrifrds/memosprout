/**
 * Every route failure must be expressed as an ApiError. The HTTP layer turns these into a
 * stable error envelope; throwing a bare Error produces a 500 and leaks internals.
 */
export type ApiErrorCode =
  | "not_found"
  | "forbidden"
  | "validation_failed"
  | "conflict"
  | "internal";

const statusByCode: Record<ApiErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  validation_failed: 422,
  conflict: 409,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, string>;

  constructor(code: ApiErrorCode, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = statusByCode[code];
    this.details = details;
  }

  static notFound(resource: string): ApiError {
    return new ApiError("not_found", `${resource} not found`, { resource });
  }

  static validation(field: string, message: string): ApiError {
    return new ApiError("validation_failed", message, { field });
  }
}
