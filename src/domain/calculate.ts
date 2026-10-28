import { dailyProratedLoan } from "./calculators/daily";
import { personalLoan } from "./calculators/personal";
import { rtn } from "./calculators/rtn";
import type { CalculatorStrategy } from "./calculators/shared";
import { validationOnly } from "./calculators/validation-only";
import { getProduct } from "./config/products";
import { resolveActiveConfig } from "./config/resolve";
import { buildInputSchema, type QaOptions } from "./inputs";
import type { CalculationResult, FieldError } from "./types";

/** Strategy registry. Products without an entry can never return a numeric result. */
const STRATEGIES: Record<string, CalculatorStrategy> = {
  NANO: dailyProratedLoan,
  PAYDAY: dailyProratedLoan,
  PERSONAL: personalLoan,
  RTN: rtn,
  REAP: validationOnly,
  RWIN: validationOnly,
};

export interface CalculateOptions {
  now?: Date;
  calculationId?: string;
}

/**
 * Calculation orchestrator: product lookup -> input validation -> config
 * resolution -> status gate -> strategy. Pure and deterministic apart from the
 * generated ID and timestamp, which can be injected.
 */
export function calculate(
  productCode: string,
  rawInputs: Record<string, unknown>,
  qaOptions: QaOptions = {},
  opts: CalculateOptions = {},
): CalculationResult {
  const now = opts.now ?? new Date();
  const product = getProduct(productCode);

  const base: CalculationResult = {
    calculationId: opts.calculationId ?? globalThis.crypto.randomUUID(),
    status: "ERROR",
    // Canonical code, so a retired alias (e.g. PERSONAL_PRIVATE) is reported as its current product.
    productCode: product?.code ?? productCode,
    productName: product?.name ?? productCode,
    category: product?.category ?? "LOAN",
    configVersionId: null,
    configVersion: null,
    formulaVersion: null,
    rateSource: "NONE",
    roundingMode: null,
    calculatedAt: now.toISOString(),
    inputs: rawInputs,
    summary: [],
    lineItems: [],
    steps: [],
    schedule: [],
    secondary: [],
    formula: null,
    assumptions: [],
    warnings: [],
    fieldErrors: [],
  };

  if (!product) {
    return { ...base, errorCode: "UNKNOWN_PRODUCT", message: `Unknown product: ${productCode}` };
  }

  const parsed = buildInputSchema(product).safeParse(rawInputs);
  if (!parsed.success) {
    const fieldErrors: FieldError[] = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "inputs"),
      message: i.message,
    }));
    return { ...base, errorCode: "VALIDATION_FAILED", message: "One or more inputs are invalid.", fieldErrors };
  }
  const inputs = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  base.inputs = inputs;

  if (product.status === "DEPRECATED") {
    return { ...base, status: "BLOCKED", errorCode: "PRODUCT_DEPRECATED", message: "This product is deprecated and unavailable for new calculations." };
  }
  if (product.status === "BLOCKED") {
    return {
      ...base,
      status: "BLOCKED",
      errorCode: "RULE_NOT_APPROVED",
      message: product.statusReason ?? "Required rules or configuration are missing.",
      warnings: product.versions.flatMap((v) => v.ruleNotes.filter((n) => n.status === "OPEN").map((n) => ({ code: n.id, severity: "WARNING" as const, message: n.note }))),
    };
  }

  const resolution = resolveActiveConfig(product, now);
  if (!resolution.ok) {
    return { ...base, status: "BLOCKED", errorCode: resolution.errorCode, message: resolution.message };
  }
  const config = resolution.config;
  const strategy = STRATEGIES[product.code];
  if (!strategy) {
    return { ...base, status: "BLOCKED", errorCode: "STRATEGY_UNAVAILABLE", message: "No calculation strategy is implemented for this product." };
  }

  const rounding = qaOptions.roundingMode ?? config.roundingPolicy.mode;
  const allowOverride = product.status === "ACTIVE";
  const result = strategy({
    product,
    config,
    inputs,
    rounding,
    rateOverridePercent: allowOverride ? qaOptions.rateOverridePercent : undefined,
  });

  const warnings = [...result.warnings];
  if (!allowOverride && qaOptions.rateOverridePercent) {
    warnings.unshift({ code: "QA_OVERRIDE_IGNORED", severity: "WARNING", message: "QA rate override ignored: overrides are only applied to products with approved rules." });
  }
  if (qaOptions.roundingMode && qaOptions.roundingMode !== config.roundingPolicy.mode) {
    warnings.push({ code: "QA_ROUNDING_OVERRIDE", severity: "WARNING", message: `QA rounding override: ${qaOptions.roundingMode} used instead of configured ${config.roundingPolicy.mode}.` });
  }

  return {
    ...base,
    ...result,
    warnings,
    configVersionId: config.id,
    configVersion: config.version,
    formulaVersion: config.formulaVersion,
    roundingMode: rounding,
  };
}

/** HTTP status mapping for API responses (spec 10). */
export function httpStatusFor(result: CalculationResult): number {
  switch (result.errorCode) {
    case undefined:
      return 200;
    case "VALIDATION_FAILED":
      return 400;
    case "UNKNOWN_PRODUCT":
      return 404;
    case "CONFIGURATION_UNAVAILABLE":
    case "CONFIGURATION_EXPIRED":
    case "CONFIGURATION_INTEGRITY":
      return 409;
    case "RATE_UNAVAILABLE":
      return result.status === "VALIDATION_ONLY" ? 200 : 422;
    default:
      return result.status === "ERROR" ? 500 : 422;
  }
}
