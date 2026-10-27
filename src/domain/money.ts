import Decimal from "decimal.js";
import type { RoundingMode } from "./types";

/**
 * Decimal-safe money helpers. Binary floating point is never used for money
 * (spec 8.1); all monetary and rate values travel as decimal strings.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const MONEY_PATTERN = /^\d{1,15}(\.\d{1,2})?$/;

export function dec(value: string | number | Dec): Dec {
  const d = new D(value);
  if (!d.isFinite()) throw new Error(`Non-finite decimal: ${String(value)}`);
  return d;
}

/** Round to 2dp, half-up. */
export function round2(value: Dec): Dec {
  return value.toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Returns a rounder for intermediate components under the given policy. */
export function componentRounder(mode: RoundingMode): (v: Dec) => Dec {
  return mode === "COMPONENT" ? round2 : (v) => v;
}

/** Raw 2dp string for API/export values. */
export function toMoneyString(value: Dec): string {
  return round2(value).toFixed(2);
}

/** Percent string with up to 6 significant decimals, trailing zeros trimmed. */
export function toPercentString(value: Dec): string {
  return value.toDecimalPlaces(6).toString();
}

const ngn = new Intl.NumberFormat("en-NG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display format: ₦ with thousands separators and 2 decimal places. */
export function formatNgn(value: string): string {
  // Format from a decimal string without passing through float math for the
  // integer part; Intl is only used on an already-rounded 2dp value.
  const fixed = round2(dec(value)).toFixed(2);
  const [intPart, frac] = fixed.replace("-", "").split(".");
  const grouped = ngn.format(Number(intPart)).split(".")[0];
  return `${fixed.startsWith("-") ? "-" : ""}₦${grouped}.${frac}`;
}

export function percentOf(value: Dec, percent: string | Dec): Dec {
  return value.times(dec(percent)).dividedBy(100);
}
