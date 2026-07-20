import { ApiError } from "./errors.js";

/**
 * Stable response envelope. Every route returns `ok(...)`; failures are thrown as ApiError
 * and converted by `toErrorResponse` at the HTTP boundary. Routes never build these objects
 * by hand — clients depend on the exact shape.
 */
export interface OkResponse<T> {
  status: number;
  body: { data: T; meta?: Record<string, unknown> };
}

export interface ErrorResponse {
  status: number;
  body: { error: { code: string; message: string; details: Record<string, string> } };
}

export function ok<T>(data: T, meta?: Record<string, unknown>): OkResponse<T> {
  return { status: 200, body: meta === undefined ? { data } : { data, meta } };
}

export function created<T>(data: T): OkResponse<T> {
  return { status: 201, body: { data } };
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }
  return {
    status: 500,
    body: { error: { code: "internal", message: "internal error", details: {} } },
  };
}
