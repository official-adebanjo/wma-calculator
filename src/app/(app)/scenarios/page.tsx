"use client";

import { Download, GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { scenariosToCsv } from "@/domain/export";
import { downloadText } from "@/lib/api-client";
import { displayValue, formatDateTime } from "@/lib/format";
import { personLabel } from "@/lib/profile";
import type { ScenarioListItem } from "@/lib/scenario-types";
import { useApi } from "@/lib/use-api";

function headline(s: ScenarioListItem) {
  const e = s.result.summary.find((x) => x.emphasis) ?? null;
  return e ? `${e.label}: ${displayValue(e.value, e.kind)}` : "—";
}

export default function ScenariosPage() {
  const router = useRouter();
  const { data, error, loading } = useApi<{ scenarios: ScenarioListItem[] }>("/api/scenarios");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("ALL");

  const scenarios = useMemo(() => data?.scenarios ?? [], [data]);
  const products = useMemo(() => [...new Set(scenarios.map((s) => s.productCode))].sort(), [scenarios]);
  const visible = scenarios.filter(
    (s) => (product === "ALL" || s.productCode === product) && (!query || s.name.toLowerCase().includes(query.toLowerCase()) || s.id.includes(query)),
  );
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const exportRows = selected.length ? scenarios.filter((s) => selected.includes(s.id)) : visible;

  return (
    <>
      <PageHeader
        title="Scenarios"
        description="Saved calculations are immutable snapshots. Recalculating after a configuration change creates a new result."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!exportRows.length} onClick={() => downloadText(`scenarios-${new Date().toISOString().slice(0, 10)}.csv`, scenariosToCsv(exportRows))}>
              <Download aria-hidden />
              Export {selected.length ? `${selected.length} selected` : "CSV"}
            </Button>
            <Button size="sm" disabled={selected.length < 2 || selected.length > 6} onClick={() => router.push(`/compare?ids=${selected.join(",")}`)}>
              <GitCompareArrows aria-hidden />
              Compare {selected.length >= 2 ? `(${selected.length})` : ""}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Search scenarios" placeholder="Search by name or ID" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs" />
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger aria-label="Filter by product" className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message} ({error.code})
          </AlertDescription>
        </Alert>
      )}
      {loading && <Skeleton className="h-64" />}
      {!loading && !error && (
        <Card className="py-0">
          <CardContent className="overflow-x-auto px-0">
            {visible.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No scenarios yet. Run a calculation and use <span className="font-medium">Save as scenario</span> in the QA panel.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <span className="sr-only">Select</span>
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Headline</TableHead>
                    <TableHead className="hidden lg:table-cell">QA outcome</TableHead>
                    <TableHead className="hidden lg:table-cell">Config</TableHead>
                    <TableHead>Saved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((s) => (
                    <TableRow key={s.id} data-state={selected.includes(s.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox aria-label={`Select ${s.name}`} checked={selected.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/scenarios/${s.id}`} className="hover:underline">
                          {s.name}
                        </Link>
                        {(s.userName || s.userEmail) && (
                          <div className="text-xs text-muted-foreground" title={s.userEmail ?? undefined}>
                            {personLabel(s)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.productCode}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge status={s.status} />
                          {s.result.rateSource === "QA_OVERRIDE" && <StatusBadge status="QA_OVERRIDE" />}
                        </div>
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{headline(s)}</TableCell>
                      <TableCell className="hidden lg:table-cell">{s.qaNotes?.outcome ?? "—"}</TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">{s.configVersionId ?? "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
