"use client";

import { ArrowLeft, Check, Copy, Download, GitCompareArrows, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { MoneyInput } from "@/components/money-input";
import { NotFoundPanel } from "@/components/not-found-panel";
import { PageHeader } from "@/components/page-header";
import { ResultView } from "@/components/result-view";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { resultToCsv } from "@/domain/export";
import { api, ApiRequestError, downloadText } from "@/lib/api-client";
import { displayValue, formatDateTime } from "@/lib/format";
import { QA_OUTCOMES, type QaOutcome, type Scenario } from "@/lib/scenario-types";
import { useApi } from "@/lib/use-api";

function QaNotesForm({ scenario, onSaved }: { scenario: Scenario; onSaved: (s: Scenario) => void }) {
  const { user, role } = useAuth();
  const canEdit = scenario.userId === user?.uid || role === "ADMIN";
  const moneyFields = scenario.result.summary.filter((s) => s.kind === "money");
  const n = scenario.qaNotes;
  const [comparedField, setComparedField] = useState(n?.comparedField ?? moneyFields.find((f) => f.emphasis)?.key ?? moneyFields[0]?.key ?? "");
  const [observedValue, setObservedValue] = useState(n?.observedValue ?? "");
  const [outcome, setOutcome] = useState<QaOutcome>(n?.outcome ?? "NOT_RUN");
  const [defectId, setDefectId] = useState(n?.defectId ?? "");
  const [evidence, setEvidence] = useState(n?.evidence ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data } = await api<{ scenario: Scenario }>(`/api/scenarios/${scenario.id}`, {
        method: "PATCH",
        body: JSON.stringify({ qaNotes: { comparedField: comparedField || undefined, observedValue: observedValue.replace(/,/g, "").trim() || undefined, outcome, defectId: defectId || undefined, evidence: evidence || undefined } }),
      });
      onSaved(data.scenario);
      toast.success("QA notes saved");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save notes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tester notes</CardTitle>
        <CardDescription>Compare against the value observed in the app, API, Admin Portal or ledger. Changes are audited; the snapshot is not altered.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qa-field">Compared field</Label>
              <Select value={comparedField} onValueChange={setComparedField}>
                <SelectTrigger id="qa-field" className="w-full">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {moneyFields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label} ({displayValue(f.value, f.kind)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-observed">Observed value (₦)</Label>
              <MoneyInput id="qa-observed" value={observedValue} onChange={setObservedValue} placeholder="e.g. 1,041,609.59" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-outcome">Outcome</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as QaOutcome)}>
                <SelectTrigger id="qa-outcome" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QA_OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-defect">Defect ID</Label>
              <Input id="qa-defect" value={defectId} onChange={(e) => setDefectId(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qa-evidence">Evidence / notes</Label>
              <Textarea id="qa-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={4000} rows={3} />
            </div>
          </fieldset>
          {n?.difference !== undefined && (
            <p className="text-sm">
              Difference (observed − expected):{" "}
              <span className={Number(n.difference) === 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                {displayValue(n.difference, "money")} {Number(n.difference) === 0 ? "· match" : "· mismatch"}
              </span>
            </p>
          )}
          {n && (
            <p className="text-xs text-muted-foreground">
              Last updated {formatDateTime(n.updatedAt)} by {n.updatedBy}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {canEdit ? (
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Save notes
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Only the scenario owner can edit notes.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function ScenarioDetail({ id }: { id: string }) {
  const { data, error, loading } = useApi<{ scenario: Scenario }>(`/api/scenarios/${encodeURIComponent(id)}`);
  const [updated, setScenario] = useState<Scenario | null>(null);
  const scenario = updated ?? data?.scenario ?? null;
  const [copied, setCopied] = useState(false);

  if (error?.status === 404) {
    return (
      <NotFoundPanel
        className="py-10"
        title="Scenario not found"
        description="This scenario doesn't exist, or it belongs to another tester and isn't shared with your role."
        lookupLabel="Scenario ID"
        lookupValue={id}
      />
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error.message} ({error.code})
        </AlertDescription>
      </Alert>
    );
  }
  if (loading || !scenario) return <Skeleton className="h-96" />;

  const r = scenario.result;
  const prefill = encodeURIComponent(JSON.stringify(r.inputs));
  return (
    <>
      <Link href="/scenarios" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Scenarios
      </Link>
      <PageHeader
        eyebrow={`${r.productName} · saved ${formatDateTime(scenario.createdAt)}`}
        title={scenario.name}
        description={
          <span className="font-mono text-xs">
            scenario {scenario.id} · calculation {r.calculationId}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify(r, null, 2));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              Copy JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadText(`scenario-${scenario.id}.csv`, resultToCsv(r, scenario.name))}>
              <Download aria-hidden />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/compare?ids=${scenario.id}`}>
                <GitCompareArrows aria-hidden />
                Compare
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/calculators/${r.productCode}?prefill=${prefill}`}>
                <RefreshCw aria-hidden />
                Recalculate (current config)
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inputs</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(r.inputs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-dashed py-1">
                    <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <ResultView result={r} />
        </div>
        <div className="space-y-6 xl:sticky xl:top-6">
          <QaNotesForm scenario={scenario} onSaved={setScenario} />
          {scenario.configSnapshot && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuration snapshot</CardTitle>
                <CardDescription>Exact configuration used for this result.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(scenario.configSnapshot, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
