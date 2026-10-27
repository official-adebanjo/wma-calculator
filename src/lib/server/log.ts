import "server-only";
import type { CalculationResult } from "@/domain/types";

/** Structured calculation log (spec 15). Inputs are not logged. */
export function logCalculation(result: CalculationResult, durationMs: number, userId: string) {
  console.info(
    JSON.stringify({
      event: "calculation",
      calculationId: result.calculationId,
      userId,
      productCode: result.productCode,
      configVersionId: result.configVersionId,
      formulaVersion: result.formulaVersion,
      status: result.status,
      errorCode: result.errorCode ?? null,
      rateSource: result.rateSource,
      durationMs: Math.round(durationMs * 100) / 100,
    }),
  );
}
