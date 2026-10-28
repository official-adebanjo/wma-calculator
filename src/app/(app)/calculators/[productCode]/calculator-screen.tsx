"use client";

import { ArrowLeft, Calculator } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type CalculationRequestPayload, CalculatorForm } from "@/components/calculator-form";
import { NotFoundPanel } from "@/components/not-found-panel";
import { PageHeader } from "@/components/page-header";
import { QaPanel } from "@/components/qa-panel";
import { ResultView } from "@/components/result-view";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CalculationResult } from "@/domain/types";
import type { ActiveConfigView, ProductView } from "@/lib/catalogue-types";
import { useApi } from "@/lib/use-api";

function RtnRateGuide({ rtn }: { rtn: NonNullable<ActiveConfigView["rtn"]> }) {
  const tenors = [...new Set(rtn.rates.map((r) => r.tenorDays))].sort((a, b) => a - b);
  const rate = (t: number, band: string, option: string) => rtn.rates.find((r) => r.tenorDays === t && r.band === band && r.option === option)?.annualRatePercent ?? "—";
  return (
    <div className="overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>Tenor</TableHead>
            {rtn.bands.map((b) => (
              <TableHead key={b.code} colSpan={2} className="text-center">
                Band {b.code}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead />
            {rtn.bands.flatMap((b) => [
              <TableHead key={`${b.code}u`} className="text-right">
                Upfront
              </TableHead>,
              <TableHead key={`${b.code}m`} className="text-right">
                Maturity
              </TableHead>,
            ])}
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {tenors.map((t) => (
            <TableRow key={t}>
              <TableCell className="font-medium">{t}d</TableCell>
              {rtn.bands.flatMap((b) => [
                <TableCell key={`${b.code}u`} className="text-right">
                  {rate(t, b.code, "UPFRONT")}%
                </TableCell>,
                <TableCell key={`${b.code}m`} className="text-right">
                  {rate(t, b.code, "MATURITY")}%
                </TableCell>,
              ])}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">
        {rtn.rateGuideVersion} · % p.a. · Bands:{" "}
        {rtn.bands.map((b) => `${b.code} ₦${Number(b.min).toLocaleString("en-NG")}${b.max ? `–₦${Number(b.max).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "+"}`).join("; ")}
      </p>
    </div>
  );
}

function RulesCard({ product }: { product: ProductView }) {
  const c = product.activeConfig;
  const notes = c?.ruleNotes ?? [];
  const features = Object.entries(c?.features ?? {});
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rules &amp; configuration</CardTitle>
        <CardDescription>
          {c ? (
            <>
              <span className="font-mono">{c.id}</span> · effective {c.effectiveFrom}
              {c.effectiveTo ? ` to ${c.effectiveTo}` : ""} · formula {c.formulaVersion}
            </>
          ) : (
            "No active configuration"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {notes.length > 0 && (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                <StatusBadge status={n.status} className="shrink-0" />
                <span>
                  {n.note} <span className="font-mono text-xs text-muted-foreground">[{n.id}]</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {features.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="font-medium">Optional analyses</p>
            {features.map(([key, f]) => (
              <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                <span className="w-36 shrink-0 font-mono text-xs">{key}</span>
                <span className="text-muted-foreground">
                  {f.enabled ? "Enabled" : "Disabled"} · {f.ruleStatus} — {f.note}
                </span>
              </div>
            ))}
          </div>
        )}
        {c?.rtn && (
          <div className="border-t pt-3">
            <p className="mb-2 font-medium">RTN Rate Guide</p>
            <RtnRateGuide rtn={c.rtn} />
          </div>
        )}
        {c && c.sources.length > 0 && (
          <div className="border-t pt-3 text-xs text-muted-foreground">
            Sources: {c.sources.map((s) => `${s.document} (${s.section})`).join("; ")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function parsePrefill(raw: string | null): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return undefined;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));
  } catch {
    return undefined;
  }
}

export function CalculatorScreen({ productCode }: { productCode: string }) {
  const { data, error, loading } = useApi<{ product: ProductView }>(`/api/products/${encodeURIComponent(productCode)}`);
  const prefillRaw = useSearchParams().get("prefill");
  const prefill = useMemo(() => parsePrefill(prefillRaw), [prefillRaw]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [request, setRequest] = useState<CalculationRequestPayload | null>(null);

  if (error?.status === 404) {
    return (
      <NotFoundPanel
        className="py-10"
        title="Product not found"
        description="There is no calculator for this product code. Choose a product from the catalogue."
        lookupLabel="Product code"
        lookupValue={productCode}
      />
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Product unavailable</AlertTitle>
        <AlertDescription>
          {error.message} ({error.code})
        </AlertDescription>
      </Alert>
    );
  }
  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const product = data.product;
  return (
    <>
      <Link href={product.category === "LOAN" ? "/calculators/loans" : "/calculators/investments"} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {product.category === "LOAN" ? "Loan calculators" : "Investment calculators"}
      </Link>
      <PageHeader
        eyebrow={`${product.category === "LOAN" ? "Loan" : "Investment"} · ${product.code}`}
        title={product.name}
        description={product.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={product.status} />
            {product.activeConfig && <span className="rounded-md border px-2 py-0.5 font-mono text-xs">{product.activeConfig.id}</span>}
          </div>
        }
      />

      {(product.statusReason || product.configError) && (
        <Alert className="mb-6" variant={product.status === "BLOCKED" || product.configError ? "destructive" : "default"}>
          <AlertTitle>{product.status === "VALIDATION_ONLY" ? "Validation only" : "Calculation unavailable"}</AlertTitle>
          <AlertDescription>{product.configError?.message ?? product.statusReason}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inputs</CardTitle>
              <CardDescription>Synthetic test data only.</CardDescription>
            </CardHeader>
            <CardContent>
              <CalculatorForm
                key={prefillRaw ?? "blank"}
                product={product}
                initialValues={prefill}
                onResult={(r) => {
                  setResult(r);
                  if (!r) setRequest(null);
                }}
                onRequest={setRequest}
              />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {result ? (
            <>
              <ResultView result={result} />
              <QaPanel result={result} request={request} />
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Calculator className="size-8" aria-hidden />
                <p className="text-sm">Enter inputs and press {product.status === "ACTIVE" ? "Calculate" : "Validate"} to see the breakdown.</p>
              </CardContent>
            </Card>
          )}
          <RulesCard product={product} />
        </div>
      </div>
    </>
  );
}
