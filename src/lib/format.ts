import { formatNgn } from "@/domain/money";
import type { SummaryValueKind } from "@/domain/types";

export function displayValue(value: string | null | undefined, kind: SummaryValueKind): string {
  if (value === null || value === undefined) return "—";
  if (kind === "money" && /^-?\d+(\.\d+)?$/.test(value)) return formatNgn(value);
  // Money ranges like "1120000.00 → 1020000.00"
  if (/^\d+\.\d{2} → \d+\.\d{2}$/.test(value)) {
    return value
      .split(" → ")
      .map((v) => formatNgn(v))
      .join(" → ");
  }
  return value;
}

export function formatMoneyMaybe(value: string): string {
  return /^-?\d+(\.\d+)?$/.test(value) ? formatNgn(value) : value;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
