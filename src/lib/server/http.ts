import "server-only";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Wraps a route handler: maps ApiError to a stable error body and logs
 * unexpected failures server-side without leaking stack traces. A failure is
 * never turned into a plausible-looking zero result.
 */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
      }
      console.error("[api] unexpected error", err);
      return json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred. No result was produced." } }, 500);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "MALFORMED_JSON", "Request body must be valid JSON.");
  }
}
