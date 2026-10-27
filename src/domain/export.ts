import type { CalculationResult } from "./types";

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection and quote as needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function rows(rs: unknown[][]): string {
  return rs.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** CSV export of a single calculation (spec 7.5). Same values as UI/API. */
export function resultToCsv(r: CalculationResult, scenarioName?: string): string {
  const out: unknown[][] = [
    ["Section", "Key", "Label", "Value", "Detail"],
    ["meta", "scenarioName", "Scenario", scenarioName ?? "", ""],
    ["meta", "calculationId", "Calculation ID", r.calculationId, ""],
    ["meta", "status", "Status", r.status, r.errorCode ?? ""],
    ["meta", "product", "Product", r.productCode, r.productName],
    ["meta", "configVersion", "Config version", r.configVersionId ?? "", ""],
    ["meta", "formulaVersion", "Formula version", r.formulaVersion ?? "", ""],
    ["meta", "rateSource", "Rate source", r.rateSource, ""],
    ["meta", "roundingMode", "Rounding mode", r.roundingMode ?? "", ""],
    ["meta", "calculatedAt", "Calculated at", r.calculatedAt, ""],
  ];
  if (r.message) out.push(["meta", "message", "Message", r.message, ""]);
  for (const [k, v] of Object.entries(r.inputs)) out.push(["input", k, k, v, ""]);
  for (const s of r.summary) out.push(["summary", s.key, s.label, s.value, s.kind]);
  for (const l of r.lineItems) out.push(["lineItem", `${l.sequence}`, l.label, l.amount, `${l.type}: ${l.explanation}`]);
  for (const s of r.steps) out.push(["step", "", s.label, s.result, s.expression]);
  for (const row of r.schedule) {
    out.push([
      "schedule",
      `${row.period}`,
      `Period ${row.period}${row.dueDate ? ` (${row.dueDate})` : ""}`,
      row.installment,
      `opening=${row.openingBalance}; principal=${row.principal}; interest=${row.interest}; closing=${row.closingBalance}`,
    ]);
  }
  for (const sec of r.secondary) {
    out.push([sec.key, "status", sec.title, sec.status, `${sec.ruleStatus}${sec.message ? `: ${sec.message}` : ""}`]);
    for (const s of sec.summary) out.push([sec.key, s.key, s.label, s.value, s.kind]);
  }
  if (r.formula) out.push(["formula", "", "Formula", r.formula, ""]);
  for (const a of r.assumptions) out.push(["assumption", "", "", a, ""]);
  for (const w of r.warnings) out.push(["warning", w.code, w.severity, w.message, ""]);
  for (const e of r.fieldErrors) out.push(["fieldError", e.field, "", e.message, ""]);
  return rows(out);
}

export function scenariosToCsv(
  items: {
    id: string;
    name: string;
    createdAt: string;
    result: CalculationResult;
    qaNotes?: { outcome?: string; observedValue?: string; defectId?: string } | null;
  }[],
): string {
  const keys = [...new Set(items.flatMap((i) => i.result.summary.map((s) => s.key)))];
  const header = ["Scenario ID", "Name", "Created", "Product", "Status", "Config version", "Rate source", ...keys, "QA outcome", "Observed value", "Defect ID"];
  const body = items.map((i) => [
    i.id,
    i.name,
    i.createdAt,
    i.result.productCode,
    i.result.status,
    i.result.configVersionId,
    i.result.rateSource,
    ...keys.map((k) => i.result.summary.find((s) => s.key === k)?.value ?? ""),
    i.qaNotes?.outcome ?? "",
    i.qaNotes?.observedValue ?? "",
    i.qaNotes?.defectId ?? "",
  ]);
  return rows([header, ...body]);
}
