import { isWeekend, weekdayName } from "../dates";
import type { Dec } from "../money";
import { toMoneyString } from "../money";
import type {
  CalculationResult,
  CalculationWarning,
  ProductConfigVersion,
  ProductDefinition,
  RoundingMode,
} from "../types";

export interface CalcContext {
  product: ProductDefinition;
  config: ProductConfigVersion;
  inputs: Record<string, unknown>;
  /** Rate override from QA options, already validated. */
  rateOverridePercent?: string;
  rounding: RoundingMode;
}

/** The part of a result a strategy is responsible for. */
export type StrategyOutput = Pick<
  CalculationResult,
  "status" | "summary" | "lineItems" | "steps" | "schedule" | "secondary" | "formula" | "assumptions" | "warnings" | "fieldErrors"
> & {
  errorCode?: string;
  message?: string;
  rateSource: CalculationResult["rateSource"];
};

export type CalculatorStrategy = (ctx: CalcContext) => StrategyOutput;

export function emptyOutput(): StrategyOutput {
  return {
    status: "CALCULATED",
    summary: [],
    lineItems: [],
    steps: [],
    schedule: [],
    secondary: [],
    formula: null,
    assumptions: [],
    warnings: [],
    fieldErrors: [],
    rateSource: "NONE",
  };
}

export function m(v: Dec): string {
  return toMoneyString(v);
}

/** Rate for the product: QA override if supplied, else the configured rate. */
export function resolveFlatRate(ctx: CalcContext): { percent: string; source: "CONFIGURATION" | "QA_OVERRIDE" } | null {
  if (ctx.rateOverridePercent) return { percent: ctx.rateOverridePercent, source: "QA_OVERRIDE" };
  if (ctx.config.ratePercent) return { percent: ctx.config.ratePercent, source: "CONFIGURATION" };
  return null;
}

export function rateWarnings(ctx: CalcContext, source: "CONFIGURATION" | "QA_OVERRIDE"): CalculationWarning[] {
  const out: CalculationWarning[] = [];
  if (source === "QA_OVERRIDE") {
    out.push({
      code: "QA_RATE_OVERRIDE",
      severity: "CRITICAL",
      message: "QA OVERRIDE: the rate was entered manually and is NOT the approved configuration rate.",
    });
  } else if (ctx.config.rateProvenance === "ILLUSTRATIVE") {
    out.push({
      code: "ILLUSTRATIVE_RATE",
      severity: "WARNING",
      message: "The configured rate comes from the specification's worked example. Confirm the live configured rate before treating this as an expected production value.",
    });
  }
  return out;
}

export function roundingAssumption(mode: RoundingMode): string {
  return mode === "COMPONENT"
    ? "Rounding: each component rounded to 2 dp (half-up); later components derived from rounded values. Approved rounding policy is still open."
    : "Rounding: full precision carried through; values rounded to 2 dp (half-up) only for output. Displayed components may differ from totals by a kobo.";
}

export function dueDateWarning(code: string, label: string, iso: string): CalculationWarning | null {
  if (!isWeekend(iso)) return null;
  return {
    code,
    severity: "INFO",
    message: `${label} ${iso} falls on a ${weekdayName(iso)}. Weekend/public-holiday handling is not approved; the calendar date is shown.`,
  };
}
