"use client";

import { Check, Copy, Download, GitCompareArrows, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resultToCsv } from "@/domain/export";
import type { CalculationResult } from "@/domain/types";
import { api, ApiRequestError, downloadText } from "@/lib/api-client";
import type { Scenario } from "@/lib/scenario-types";
import type { CalculationRequestPayload } from "./calculator-form";

export function QaPanel({ result, request }: { result: CalculationResult; request: CalculationRequestPayload | null }) {
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Scenario | null>(null);
  const canSave = result.status !== "ERROR" && request !== null;

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!request || !name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api<{ scenario: Scenario }>("/api/scenarios", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), ...request }),
      });
      setSaved(data.scenario);
      toast.success("Scenario saved", { description: `Immutable snapshot ${data.scenario.id}` });
    } catch (err) {
      toast.error("Could not save scenario", { description: err instanceof ApiRequestError ? err.message : "Request failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">QA panel</CardTitle>
        <CardDescription>Reproduce, save and export this result.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Calculation ID</dt>
          <dd className="font-mono text-xs break-all">{result.calculationId}</dd>
          <dt className="text-muted-foreground">Config version</dt>
          <dd className="font-mono text-xs">{result.configVersionId ?? "—"}</dd>
          <dt className="text-muted-foreground">Formula version</dt>
          <dd className="font-mono text-xs">{result.formulaVersion ?? "—"}</dd>
          <dt className="text-muted-foreground">Rate source</dt>
          <dd className="font-mono text-xs">{result.rateSource}</dd>
          <dt className="text-muted-foreground">Calculated at</dt>
          <dd className="font-mono text-xs">{result.calculatedAt}</dd>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyJson}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy JSON"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadText(`${result.productCode}-${result.calculationId.slice(0, 8)}.csv`, resultToCsv(result))}>
            <Download aria-hidden />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={saved ? `/compare?ids=${saved.id}` : "/compare"}>
              <GitCompareArrows aria-hidden />
              Compare
            </Link>
          </Button>
        </div>

        <form onSubmit={save} className="space-y-1.5 border-t pt-4">
          <Label htmlFor="scenario-name">Save as scenario</Label>
          <div className="flex gap-2">
            <Input id="scenario-name" placeholder="e.g. RTN-CAL-001 Band B 90d" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={!canSave} />
            <Button type="submit" size="sm" className="h-9" disabled={!canSave || !name.trim() || saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The server recalculates from these inputs and stores an immutable snapshot with its config version.
          </p>
          {saved && (
            <p className="text-sm">
              Saved:{" "}
              <Link className="font-medium text-primary underline underline-offset-4" href={`/scenarios/${saved.id}`}>
                {saved.name}
              </Link>
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
