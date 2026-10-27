"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductCategory } from "@/domain/types";
import type { ProductSummary } from "@/lib/catalogue-types";
import { formatMoneyMaybe } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "./status-badge";

function amountRange(p: ProductSummary): string {
  if (!p.minimumPrincipal && !p.maximumPrincipal) return "Unconfirmed";
  if (p.minimumPrincipal && p.maximumPrincipal) return `${formatMoneyMaybe(p.minimumPrincipal)} – ${formatMoneyMaybe(p.maximumPrincipal)}`;
  return p.minimumPrincipal ? `From ${formatMoneyMaybe(p.minimumPrincipal)}` : `Up to ${formatMoneyMaybe(p.maximumPrincipal!)}`;
}

export function ProductCard({ product: p }: { product: ProductSummary }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{p.name}</CardTitle>
            <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
          </div>
          <StatusBadge status={p.status} />
        </div>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="tabular-nums">{amountRange(p)}</dd>
          <dt className="text-muted-foreground">Tenor</dt>
          <dd>{p.tenorLabel}</dd>
          <dt className="text-muted-foreground">Interest</dt>
          <dd>{p.interestLabel}</dd>
          <dt className="text-muted-foreground">Config</dt>
          <dd className="font-mono text-xs">{p.configVersionId ?? "—"}</dd>
        </dl>
        {(p.statusReason || p.configError) && <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{p.configError?.message ?? p.statusReason}</p>}
      </CardContent>
      <CardFooter>
        <Link
          href={`/calculators/${p.code}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {p.status === "ACTIVE" ? "Open calculator" : p.status === "VALIDATION_ONLY" ? "Validate inputs" : "View status"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardFooter>
    </Card>
  );
}

export function useProducts() {
  return useApi<{ products: ProductSummary[] }>("/api/products");
}

export function ProductCatalogue({ category }: { category?: ProductCategory }) {
  const { data, error, loading } = useProducts();
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load products: {error.message} ({error.code})
        </AlertDescription>
      </Alert>
    );
  }
  if (loading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }
  const groups: ProductCategory[] = category ? [category] : ["LOAN", "INVESTMENT"];
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g} aria-labelledby={`cat-${g}`}>
          {!category && (
            <h2 id={`cat-${g}`} className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {g === "LOAN" ? "Loan calculators" : "Investment calculators"}
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.products
              .filter((p) => p.category === g)
              .map((p) => (
                <ProductCard key={p.code} product={p} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
