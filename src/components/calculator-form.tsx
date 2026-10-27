"use client";

import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, type FieldErrors, type Resolver, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildInputSchema, qaOptionsSchema, type QaOptions } from "@/domain/inputs";
import type { CalculationResult, InputFieldDef } from "@/domain/types";
import { api, ApiRequestError } from "@/lib/api-client";
import type { ProductView } from "@/lib/catalogue-types";
import { cn } from "@/lib/utils";
import { DatePicker } from "./date-picker";
import { MoneyInput, stripGrouping } from "./money-input";

type FormValues = Record<string, string>;

export interface CalculationRequestPayload {
  productCode: string;
  inputs: Record<string, string>;
  qaOptions: QaOptions;
}

function fieldHint(f: InputFieldDef): string | undefined {
  const parts: string[] = [];
  if (f.kind === "money" && (f.min || f.max)) {
    const fmt = (v: string) => `₦${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
    parts.push(f.min && f.max ? `${fmt(f.min)} – ${fmt(f.max)}` : f.min ? `Min ${fmt(f.min)}` : `Max ${fmt(f.max!)}`);
  }
  if (f.kind === "integer" && (f.min !== undefined || f.max !== undefined)) {
    parts.push(`${f.min ?? 0}–${f.max ?? "∞"}${f.unit ? ` ${f.unit}` : ""}`);
  }
  if (f.help) parts.push(f.help);
  return parts.join(" · ") || undefined;
}

/** Drops blanks and removes display-only thousands separators from money fields. */
function cleanInputs(values: FormValues, fields: InputFieldDef[]): Record<string, string> {
  const money = new Set(fields.filter((f) => f.kind === "money").map((f) => f.name));
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, v]) => v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => [k, money.has(k) ? stripGrouping(String(v)) : String(v)]),
  );
}

export function CalculatorForm({
  product,
  initialValues,
  onResult,
  onRequest,
}: {
  product: ProductView;
  initialValues?: FormValues;
  onResult: (result: CalculationResult | null) => void;
  onRequest?: (payload: CalculationRequestPayload) => void;
}) {
  const schema = useMemo(() => buildInputSchema(product), [product]);
  const emptyValues = useMemo(() => Object.fromEntries(product.fields.map((f) => [f.name, ""])), [product]);
  const [qa, setQa] = useState<{ rateOverridePercent: string; roundingMode: string }>({ rateOverridePercent: "", roundingMode: "" });
  const [qaError, setQaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Same schema as the server; raw strings are submitted and revalidated server-side.
  const resolver: Resolver<FormValues> = async (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return { values, errors: {} };
    const errors: FieldErrors<FormValues> = {};
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0]);
      if (!errors[name]) errors[name] = { type: "validate", message: issue.message };
    }
    return { values: {}, errors };
  };

  const form = useForm<FormValues>({ resolver, defaultValues: { ...emptyValues, ...initialValues }, mode: "onTouched" });
  const { register, control, handleSubmit, formState, setError, reset } = form;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const qaParsed = qaOptionsSchema.safeParse({
      rateOverridePercent: qa.rateOverridePercent.trim() || undefined,
      roundingMode: qa.roundingMode || undefined,
    });
    if (!qaParsed.success) {
      setQaError(qaParsed.error.issues[0]?.message ?? "Invalid QA option.");
      return;
    }
    setQaError(null);
    const payload: CalculationRequestPayload = { productCode: product.code, inputs: cleanInputs(values, product.fields), qaOptions: qaParsed.data };
    try {
      const { data } = await api<CalculationResult>("/api/calculations", { method: "POST", body: JSON.stringify(payload) });
      for (const e of data.fieldErrors) setError(e.field, { type: "server", message: e.message });
      onResult(data);
      onRequest?.(payload);
    } catch (err) {
      onResult(null);
      setSubmitError(err instanceof ApiRequestError ? `${err.message} (${err.code})` : "Request failed. Check your connection.");
    }
  });

  const canOverride = product.status === "ACTIVE";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label={`${product.name} inputs`}>
      {product.fields.map((f) => {
        const id = `field-${f.name}`;
        const error = formState.errors[f.name]?.message;
        const hint = fieldHint(f);
        const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
        return (
          <div key={f.name} className="space-y-1.5">
            <Label htmlFor={id}>
              {f.label}
              {f.required ? <span aria-hidden className="text-destructive">*</span> : <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
            </Label>
            {f.kind === "select" ? (
              <Controller
                control={control}
                name={f.name}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)} aria-describedby={describedBy} onBlur={field.onBlur}>
                      <SelectValue placeholder={`Select ${f.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            ) : f.kind === "money" ? (
              <Controller
                control={control}
                name={f.name}
                render={({ field }) => (
                  <MoneyInput
                    id={id}
                    name={field.name}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={Boolean(error)}
                    aria-describedby={describedBy}
                  />
                )}
              />
            ) : f.kind === "date" ? (
              <Controller
                control={control}
                name={f.name}
                render={({ field }) => (
                  <DatePicker id={id} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} invalid={Boolean(error)} describedBy={describedBy} />
                )}
              />
            ) : (
              <div className="relative">
                <Input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className={cn("tabular-nums", f.unit && "pr-16")}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  {...register(f.name)}
                />
                {f.unit && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{f.unit}</span>}
              </div>
            )}
            {hint && (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                {hint}
              </p>
            )}
            {error && (
              <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}

      <details className="group rounded-md border px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
          Advanced QA options
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qa-rate">Rate override (%)</Label>
            <Input
              id="qa-rate"
              inputMode="decimal"
              disabled={!canOverride}
              value={qa.rateOverridePercent}
              onChange={(e) => setQa((s) => ({ ...s, rateOverridePercent: e.target.value }))}
              placeholder={canOverride ? "Uses approved configuration when blank" : "Not available for this product"}
            />
            <p className="text-xs text-muted-foreground">
              Same unit as the configured rate (per day, per month or p.a.). Results are labelled QA OVERRIDE.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-rounding">Rounding mode</Label>
            <Select value={qa.roundingMode || "CONFIG"} onValueChange={(v) => setQa((s) => ({ ...s, roundingMode: v === "CONFIG" ? "" : v }))}>
              <SelectTrigger id="qa-rounding" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIG">Use configuration</SelectItem>
                <SelectItem value="COMPONENT">Component (round each line)</SelectItem>
                <SelectItem value="FINAL">Final only (full precision)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {qaError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {qaError}
            </p>
          )}
        </div>
      </details>

      {submitError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          {product.status === "ACTIVE" ? "Calculate" : "Validate"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset(emptyValues);
            setQa({ rateOverridePercent: "", roundingMode: "" });
            setSubmitError(null);
            onResult(null);
          }}
        >
          <RotateCcw aria-hidden />
          Reset
        </Button>
      </div>
    </form>
  );
}
