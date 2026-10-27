"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { useProducts } from "@/components/product-catalogue";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductStatus } from "@/domain/types";
import { displayValue, formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";
import { QA_OUTCOMES, type ScenarioListItem } from "@/lib/scenario-types";
import { useApi } from "@/lib/use-api";

const STATUS_ORDER: ProductStatus[] = ["ACTIVE", "VALIDATION_ONLY", "BLOCKED", "DEPRECATED"];

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, role } = useAuth();
  const { data: products } = useProducts();
  const { data: scenarios } = useApi<{ scenarios: ScenarioListItem[] }>("/api/scenarios");

  const list = scenarios?.scenarios ?? [];
  const outcomes = Object.fromEntries(QA_OUTCOMES.map((o) => [o, list.filter((s) => (s.qaNotes?.outcome ?? "NOT_RUN") === o).length]));
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, products?.products.filter((p) => p.status === s).length ?? 0]));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            Signed in as {user?.email} · {role ? ROLE_LABELS[role] : "…"}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Calculable products" value={products ? byStatus.ACTIVE : "…"} hint={products && `${byStatus.VALIDATION_ONLY} validation only · ${byStatus.BLOCKED} blocked`} />
        <Stat label="Saved scenarios" value={scenarios ? list.length : "…"} hint={role === "QA_TESTER" ? "Your scenarios" : "All testers"} />
        <Stat label="QA passed" value={scenarios ? outcomes.PASS : "…"} hint={scenarios && `${outcomes.FAIL} failed · ${outcomes.BLOCKED} blocked`} />
        <Stat label="Not yet run" value={scenarios ? outcomes.NOT_RUN : "…"} hint="Scenarios without a recorded outcome" />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Products</CardTitle>
            <CardDescription>Calculation availability under the active configuration.</CardDescription>
          </CardHeader>
          <CardContent>
            {!products ? (
              <Skeleton className="h-48" />
            ) : (
              <ul className="divide-y">
                {products.products.map((p) => (
                  <li key={p.code}>
                    <Link href={`/calculators/${p.code}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                      <span>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{p.configVersionId ?? "no config"}</span>
                      </span>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent scenarios</CardTitle>
              <CardDescription>Latest saved snapshots.</CardDescription>
            </div>
            <Link href="/scenarios" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="size-4" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent>
            {!scenarios ? (
              <Skeleton className="h-48" />
            ) : list.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing saved yet.{" "}
                <Link href="/calculators" className="text-primary underline">
                  Open a calculator
                </Link>
              </p>
            ) : (
              <ul className="divide-y">
                {list.slice(0, 6).map((s) => {
                  const h = s.result.summary.find((x) => x.emphasis);
                  return (
                    <li key={s.id}>
                      <Link href={`/scenarios/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.productCode} · {formatDateTime(s.createdAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm tabular-nums">{h ? displayValue(h.value, h.kind) : <StatusBadge status={s.status} />}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
