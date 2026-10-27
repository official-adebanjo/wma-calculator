"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { WarningList } from "@/components/result-view";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Comparison, ComparisonRow } from "@/domain/compare";
import { api, ApiRequestError } from "@/lib/api-client";
import { displayValue, humanize } from "@/lib/format";
import type { ScenarioListItem } from "@/lib/scenario-types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

function RowsTable({ title, rows, columns }: { title: string; rows: ComparisonRow[]; columns: Comparison["columns"] }) {
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">{title}</TableHead>
              {columns.map((c, i) => (
                <TableHead key={i} className="min-w-40 text-right">
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="w-12 text-center">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {rows.map((r) => (
              <TableRow key={r.key} className={cn(r.differs && "bg-warning/10")}>
                <TableCell className="font-medium">{title === "Inputs" ? humanize(r.label) : r.label}</TableCell>
                {r.values.map((v, i) => (
                  <TableCell key={i} className="text-right">
                    {displayValue(v, r.kind)}
                  </TableCell>
                ))}
                <TableCell className="text-center" aria-label={r.differs ? "Differs" : "Same"}>
                  {r.differs ? "≠" : "="}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CompareScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const idsParam = useSearchParams().get("ids") ?? "";
  const ids = useMemo(() => idsParam.split(",").filter(Boolean), [idsParam]);
  const { data: list } = useApi<{ scenarios: ScenarioListItem[] }>("/api/scenarios");
  const [loaded, setLoaded] = useState<{ key: string; comparison: Comparison | null; error: string | null } | null>(null);
  const key = ids.length >= 2 ? ids.join(",") : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api<{ comparison: Comparison }>("/api/scenarios/compare", { method: "POST", body: JSON.stringify({ items: key.split(",").map((scenarioId) => ({ scenarioId })) }) })
      .then(({ data }) => !cancelled && setLoaded({ key, comparison: data.comparison, error: null }))
      .catch((e) => !cancelled && setLoaded({ key, comparison: null, error: e instanceof ApiRequestError ? e.message : "Comparison failed." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = key && loaded?.key === key ? loaded : null;
  const comparison = current?.comparison ?? null;
  const error = current?.error ?? null;
  const loading = key !== null && !current;

  const setIds = (next: string[]) => router.replace(next.length ? `${pathname}?ids=${next.join(",")}` : pathname);
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 6));

  return (
    <>
      <PageHeader title="Compare scenarios" description="Select two to six saved scenarios. Rows that differ are marked ≠ and highlighted." />
      <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved scenarios</CardTitle>
            <CardDescription>{ids.length} selected</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[60vh] space-y-1 overflow-y-auto">
            {!list && <Loader2 className="size-4 animate-spin" aria-label="Loading" />}
            {list?.scenarios.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No scenarios saved yet. <Link href="/calculators" className="text-primary underline">Run a calculation</Link>.
              </p>
            )}
            {list?.scenarios.map((s) => (
              <div key={s.id} className="flex items-start gap-2 rounded-md p-1.5 hover:bg-muted/60">
                <Checkbox id={`cmp-${s.id}`} checked={ids.includes(s.id)} onCheckedChange={() => toggle(s.id)} className="mt-0.5" />
                <Label htmlFor={`cmp-${s.id}`} className="flex flex-col items-start gap-0.5 font-normal">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.productCode} · {s.configVersionId ?? s.status}
                  </span>
                </Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading && <Loader2 className="size-5 animate-spin" aria-label="Comparing" />}
          {!loading && !comparison && !error && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">Select at least two scenarios to compare.</CardContent>
            </Card>
          )}
          {comparison && !loading && (
            <>
              <WarningList warnings={comparison.warnings} />
              <Card className="py-0">
                <CardContent className="overflow-x-auto px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-40">Scenario</TableHead>
                        {comparison.columns.map((c, i) => (
                          <TableHead key={i} className="min-w-40 text-right">
                            {c.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        {comparison.columns.map((c, i) => (
                          <TableCell key={i} className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <StatusBadge status={c.status} />
                              {c.rateSource === "QA_OVERRIDE" && <StatusBadge status="QA_OVERRIDE" />}
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                      {(["productName", "configVersionId", "formulaVersion", "roundingMode"] as const).map((k) => (
                        <TableRow key={k}>
                          <TableCell className="font-medium">{humanize(k)}</TableCell>
                          {comparison.columns.map((c, i) => (
                            <TableCell key={i} className="text-right font-mono text-xs">
                              {c[k] ?? "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <RowsTable title="Inputs" rows={comparison.inputRows} columns={comparison.columns} />
              <RowsTable title="Outputs" rows={comparison.outputRows} columns={comparison.columns} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
