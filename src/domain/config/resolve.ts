import type { ProductConfigVersion, ProductDefinition } from "../types";

export type ConfigResolution =
  | { ok: true; config: ProductConfigVersion }
  | { ok: false; errorCode: "CONFIGURATION_UNAVAILABLE" | "CONFIGURATION_EXPIRED" | "CONFIGURATION_INTEGRITY"; message: string };

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Select the single ACTIVE configuration effective on the given date (spec 12).
 * - No active version -> CONFIGURATION_UNAVAILABLE
 * - Only expired active versions -> CONFIGURATION_EXPIRED (never silently used)
 * - More than one effective active version -> CONFIGURATION_INTEGRITY (blocked)
 */
export function resolveActiveConfig(product: ProductDefinition, at: Date): ConfigResolution {
  const day = isoDate(at);
  const active = product.versions.filter((v) => v.status === "ACTIVE");
  const effective = active.filter(
    (v) => v.effectiveFrom <= day && (v.effectiveTo === null || day < v.effectiveTo),
  );

  if (effective.length > 1) {
    return {
      ok: false,
      errorCode: "CONFIGURATION_INTEGRITY",
      message: `Multiple active configurations overlap on ${day} (${effective.map((v) => v.id).join(", ")}). Calculation blocked.`,
    };
  }
  if (effective.length === 1) return { ok: true, config: effective[0] };

  const expired = active.filter((v) => v.effectiveTo !== null && v.effectiveTo <= day);
  if (expired.length > 0) {
    return {
      ok: false,
      errorCode: "CONFIGURATION_EXPIRED",
      message: `The active configuration (${expired.map((v) => `${v.id} expired ${v.effectiveTo}`).join(", ")}) is no longer effective. A refreshed configuration is required.`,
    };
  }
  return {
    ok: false,
    errorCode: "CONFIGURATION_UNAVAILABLE",
    message: "No approved active configuration is available for this product.",
  };
}
