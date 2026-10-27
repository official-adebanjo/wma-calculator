"use client";

import { useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Groups the integer part with commas as the user types ("1234567.5" →
 * "1,234,567.5"). At most two decimals are kept. Commas are display-only; the
 * input schema strips them before validation and calculation.
 */
export function formatGrouped(raw: string): string {
  const s = raw.replace(/[^\d.]/g, "");
  const hasDot = s.includes(".");
  const [intRaw, ...rest] = s.split(".");
  const frac = rest.join("").slice(0, 2);
  const int = intRaw.replace(/^0+(?=\d)/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return hasDot ? `${grouped || "0"}.${frac}` : grouped;
}

export function stripGrouping(value: string): string {
  return value.replace(/,/g, "");
}

/** Index in `formatted` just after the n-th significant (digit or dot) character. */
function caretAfter(formatted: string, significant: number): number {
  if (significant <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.]/.test(formatted[i]) && ++seen === significant) return i + 1;
  }
  return formatted.length;
}

export function MoneyInput({
  value,
  onChange,
  className,
  prefix = "₦",
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (formatted: string) => void;
  prefix?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = formatGrouped(value ?? "");

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn("tabular-nums", prefix && "pl-7", className)}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          const caret = e.target.selectionStart ?? raw.length;
          const significant = raw.slice(0, caret).replace(/[^\d.]/g, "").length;
          const next = formatGrouped(raw);
          pendingCaret.current = caretAfter(next, significant);
          onChange(next);
        }}
      />
    </div>
  );
}
