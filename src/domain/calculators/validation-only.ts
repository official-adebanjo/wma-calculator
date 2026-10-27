import { dec } from "../money";
import { type CalculatorStrategy, emptyOutput, m } from "./shared";

/**
 * REAP / RWIN (spec 8.9, 8.10): inputs are validated against the configured
 * limits, but no return is projected because no approved rate table or
 * formula exists. There is deliberately no fallback/default rate.
 */
export const validationOnly: CalculatorStrategy = (ctx) => {
  const out = emptyOutput();
  out.status = "VALIDATION_ONLY";
  out.errorCode = "RATE_UNAVAILABLE";
  out.message = "No approved rate is available for this combination. Calculation is unavailable.";

  const principal = dec(ctx.inputs.principal as string);
  out.summary.push({ key: "principal", label: "Amount", value: m(principal), kind: "money" });
  for (const field of ctx.product.fields) {
    if (field.name === "principal") continue;
    const v = ctx.inputs[field.name];
    if (v === undefined) continue;
    const label = field.kind === "select" ? field.options.find((o) => o.value === v)?.label ?? String(v) : String(v);
    out.summary.push({ key: field.name, label: field.label, value: field.kind === "integer" && field.unit ? `${label} ${field.unit}` : label, kind: "text" });
  }
  out.summary.push({ key: "projectedReturn", label: "Projected return", value: "UNAVAILABLE — no approved rate", kind: "text", emphasis: true });

  out.assumptions.push(
    `Amount meets the configured minimum of ₦${Number(ctx.config.minimumPrincipal).toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
  );
  for (const note of ctx.config.ruleNotes.filter((n) => n.status === "OPEN")) {
    out.warnings.push({ code: note.id, severity: "WARNING", message: note.note });
  }
  return out;
};
