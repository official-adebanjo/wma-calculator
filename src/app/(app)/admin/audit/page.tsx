"use client";

import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface AuditEvent {
  id: string;
  userEmail: string | null;
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
                    <TableCell className="text-xs">{e.userEmail ?? e.userId}</TableCell>
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
          </CardContent>
        </Card>
      )}
    </>
  );
}
