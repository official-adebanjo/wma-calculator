import "server-only";
import { ApiError } from "./http";

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

/**
 * Simple per-instance sliding-window limiter for shared endpoints. Adequate
 * for an internal tool; use a shared store if deployed across many instances.
 */
export function rateLimit(key: string, limit = 120): void {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.");
  }
  hits.push(now);
  buckets.set(key, hits);
}
