import type { CalculationResult, CalculationWarning, SummaryValueKind } from "./types";

export interface ComparisonColumn {
  label: string;
  calculationId: string;
  productCode: string;
  productName: string;
  status: CalculationResult["status"];
  configVersionId: string | null;
  formulaVersion: string | null;
  rateSource: CalculationResult["rateSource"];
  roundingMode: CalculationResult["roundingMode"];
}

export interface ComparisonRow {
  key: string;
  label: string;
  kind: SummaryValueKind;
  values: (string | null)[];
  differs: boolean;
}

export interface Comparison {
  columns: ComparisonColumn[];
  inputRows: ComparisonRow[];
  outputRows: ComparisonRow[];
  warnings: CalculationWarning[];
}

function differs(values: (string | null)[]): boolean {
  return new Set(values.map((v) => v ?? "∅")).size > 1;
}

/**
 * Normalizes two or more results into side-by-side rows (spec 7.4) and warns
 * when the outputs are not directly comparable.
 */
export function compareResults(items: { label: string; result: CalculationResult }[]): Comparison {
  const columns: ComparisonColumn[] = items.map(({ label, result: r }) => ({
    label,
    calculationId: r.calculationId,
    productCode: r.productCode,
    productName: r.productName,
    status: r.status,
    configVersionId: r.configVersionId,
    formulaVersion: r.formulaVersion,
    rateSource: r.rateSource,
    roundingMode: r.roundingMode,
  }));

  const inputKeys = [...new Set(items.flatMap(({ result }) => Object.keys(result.inputs)))];
  const inputRows: ComparisonRow[] = inputKeys.map((key) => {
    const values = items.map(({ result }) => (result.inputs[key] === undefined ? null : String(result.inputs[key])));
    return { key, label: key, kind: "text", values, differs: differs(values) };
  });

  const outputKeys: { key: string; labels: string[]; kind: SummaryValueKind }[] = [];
  for (const { result } of items) {
    for (const s of result.summary) {
      const existing = outputKeys.find((k) => k.key === s.key);
      if (!existing) outputKeys.push({ key: s.key, labels: [s.label], kind: s.kind });
      else if (!existing.labels.includes(s.label)) existing.labels.push(s.label);
    }
  }
  const outputRows: ComparisonRow[] = outputKeys.map(({ key, labels, kind }) => {
    const values = items.map(({ result }) => result.summary.find((s) => s.key === key)?.value ?? null);
    // Show every label used for this figure so values aren't read under another product's wording.
    return { key, label: labels.join(" / "), kind, values, differs: differs(values) };
  });

  const warnings: CalculationWarning[] = [];
  const distinct = (f: (c: ComparisonColumn) => unknown) => new Set(columns.map(f)).size > 1;
  if (distinct((c) => c.productCode)) {
    warnings.push({ code: "MIXED_PRODUCTS", severity: "INFO", message: "Scenarios use different products; outputs with different meanings are shown side by side." });
  }
  if (distinct((c) => `${c.productCode}:${c.configVersionId}:${c.formulaVersion}`) && !distinct((c) => c.productCode)) {
    warnings.push({ code: "MIXED_CONFIG_VERSIONS", severity: "WARNING", message: "Scenarios were calculated under different configuration or formula versions; differences may reflect rule changes rather than inputs." });
  }
  if (columns.some((c) => c.status !== "CALCULATED")) {
    warnings.push({ code: "NON_CALCULATED", severity: "WARNING", message: "One or more scenarios is not CALCULATED (blocked, validation-only or error) and has no comparable numeric output." });
  }
  if (columns.some((c) => c.rateSource === "QA_OVERRIDE")) {
    warnings.push({ code: "QA_OVERRIDE_PRESENT", severity: "CRITICAL", message: "One or more scenarios uses a QA rate override, not the approved configuration." });
  }
  if (distinct((c) => c.roundingMode)) {
    warnings.push({ code: "MIXED_ROUNDING", severity: "WARNING", message: "Scenarios use different rounding modes." });
  }
  return { columns, inputRows, outputRows, warnings };
}
