"use client";

import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { personLabel } from "@/lib/profile";
import { useApi } from "@/lib/use-api";

interface AuditEvent {
  id: string;
  userEmail: string | null;
  userName?: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: string;
}

export default function AuditPage() {
  const { role } = useAuth();
  const { data, error, loading } = useApi<{ events: AuditEvent[] }>(role === "ADMIN" ? "/api/audit" : null);

  if (role !== "ADMIN") {
    return (
      <Alert variant="destructive">
        <AlertDescription>The audit log is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <PageHeader eyebrow="Admin" title="Audit log" description="Scenario creation and QA note changes, newest first." />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      {loading && <Skeleton className="h-96" />}
      {data && (
        <Card className="py-0">
          <CardContent className="overflow-x-auto px-0">
            <ul className="divide-y md:hidden" aria-label="Audit events">
              {data.events.map((e) => (
                <li key={e.id} className="space-y-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs font-medium break-all">{e.action}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <p className="text-sm" title={e.userEmail ?? undefined}>
                    {personLabel(e)}
                  </p>
                  <p className="font-mono text-xs break-all text-muted-foreground">
                    {e.entityType}/{e.entityId}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs">View change</summary>
                    <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify({ before: e.beforeSnapshot, after: e.afterSnapshot }, null, 2)}</pre>
                  </details>
                </li>
              ))}
              {data.events.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">No audit events yet.</li>}
            </ul>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((e) => (
                  <TableRow key={e.id} className="align-top">
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell className="text-xs" title={e.userEmail ?? undefined}>
                      {personLabel(e)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.action}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.entityType}/{e.entityId}
                    </TableCell>
                    <TableCell>
                      <details>
                        <summary className="cursor-pointer text-xs">View</summary>
                        <pre className="mt-1 max-w-xl overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify({ before: e.beforeSnapshot, after: e.afterSnapshot }, null, 2)}</pre>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
                {data.events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No audit events yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
