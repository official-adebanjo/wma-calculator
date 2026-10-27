"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { useProducts } from "@/components/product-catalogue";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductConfigVersion, ProductStatus } from "@/domain/types";
import { canReviewConfig } from "@/lib/roles";
import { useApi } from "@/lib/use-api";

export default function ConfigurationPage() {
  const { role } = useAuth();
  const { data: products } = useProducts();
  const [code, setCode] = useState("RTN");
  const allowed = canReviewConfig(role);
  const { data, error, loading } = useApi<{ productCode: string; productStatus: ProductStatus; versions: ProductConfigVersion[] }>(
    allowed ? `/api/config/versions/${code}` : null,
  );

  if (!allowed) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Configuration review is restricted to Product/Finance reviewers and administrators.</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Configuration versions"
        description="Read-only. In the MVP, configuration is version-controlled in the repository; a change creates a new version and never edits an active one. Draft → approval → activation workflow is planned (Phase 5)."
        actions={
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger aria-label="Product" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(products?.products ?? []).map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      {loading && <Skeleton className="h-96" />}
      {data && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            Product status: <StatusBadge status={data.productStatus} />
          </div>
          {data.versions.map((v) => (
            <Card key={v.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="font-mono text-base">{v.id}</CardTitle>
                  <Badge variant={v.status === "ACTIVE" ? "default" : "outline"}>{v.status}</Badge>
                </div>
                <CardDescription>
                  Effective {v.effectiveFrom}
                  {v.effectiveTo ? ` to ${v.effectiveTo}` : " (open-ended)"} · formula {v.formulaVersion} · created by {v.createdBy} · approved by {v.approvedBy ?? "— (pending sign-off)"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1.5 text-sm">
                  {v.ruleNotes.map((n) => (
                    <li key={n.id} className="flex items-start gap-2">
                      <StatusBadge status={n.status} className="shrink-0" />
                      <span>
                        {n.note} <span className="font-mono text-xs text-muted-foreground">[{n.id}]</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Full configuration JSON</summary>
                  <pre className="mt-2 max-h-[28rem] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(v, null, 2)}</pre>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
