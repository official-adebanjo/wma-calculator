"use client";

import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CalculationResult, CalculationWarning, SecondaryAnalysis, SummaryEntry } from "@/domain/types";
import { displayValue, formatMoneyMaybe } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

const SEVERITY_ICON = { CRITICAL: ShieldAlert, WARNING: AlertTriangle, INFO: Info } as const;

export function WarningList({ warnings }: { warnings: CalculationWarning[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-2" aria-label="Warnings">
      {warnings.map((w, i) => {
        const Icon = SEVERITY_ICON[w.severity];
        return (
          <li
            key={`${w.code}-${i}`}
            className={cn(
              "flex gap-2 rounded-md border px-3 py-2 text-sm",
              w.severity === "CRITICAL" && "border-destructive/40 bg-destructive/10 text-destructive",
              w.severity === "WARNING" && "border-warning/50 bg-warning/10",
              w.severity === "INFO" && "bg-muted/50",
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{w.severity}</span> · {w.message}
              <span className="ml-1 font-mono text-xs opacity-70">[{w.code}]</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SummaryGrid({ entries }: { entries: SummaryEntry[] }) {
  const headline = entries.filter((e) => e.emphasis);
  const rest = entries.filter((e) => !e.emphasis);
  return (
    <div className="space-y-3">
      {headline.map((e) => (
        <div key={e.key} className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{e.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl" data-testid={`summary-${e.key}`}>
            {displayValue(e.value, e.kind)}
          </div>
        </div>
      ))}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rest.map((e) => (
          <div key={e.key} className="flex items-baseline justify-between gap-3 border-b border-dashed py-1.5">
            <dt className="text-sm text-muted-foreground">{e.label}</dt>
            <dd className="text-right text-sm font-medium tabular-nums" data-testid={`summary-${e.key}`}>
              {displayValue(e.value, e.kind)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StepsTable({ steps }: { steps: CalculationResult["steps"] }) {
  return (
    <>
      <ol className="divide-y sm:hidden">
        {steps.map((s, i) => (
          <li key={i} className="space-y-1 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{s.label}</span>
              <span className="shrink-0 text-right text-sm font-medium tabular-nums">{formatMoneyMaybe(s.result)}</span>
            </div>
            <p className="font-mono text-xs break-words text-muted-foreground">{s.expression}</p>
          </li>
        ))}
      </ol>
      <div className="hidden sm:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-48">Step</TableHead>
          <TableHead>Expression</TableHead>
          <TableHead className="text-right">Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {steps.map((s, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium">{s.label}</TableCell>
            <TableCell className="font-mono text-xs whitespace-normal break-words">{s.expression}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoneyMaybe(s.result)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
      </div>
    </>
  );
}

function LineItemsTable({ items }: { items: CalculationResult["lineItems"] }) {
  return (
    <>
      <ol className="divide-y sm:hidden">
        {items.map((l) => (
          <li key={l.sequence} className="space-y-0.5 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">
                <span className="mr-1.5 text-muted-foreground">{l.sequence}.</span>
                {l.label}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoneyMaybe(l.amount)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{l.type}</span> · {l.explanation}
            </p>
          </li>
        ))}
      </ol>
      <div className="hidden sm:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Item</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden md:table-cell">Explanation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((l) => (
          <TableRow key={l.sequence}>
            <TableCell className="text-muted-foreground">{l.sequence}</TableCell>
            <TableCell className="font-medium">{l.label}</TableCell>
            <TableCell className="font-mono text-xs">{l.type}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoneyMaybe(l.amount)}</TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">{l.explanation}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
      </div>
    </>
  );
}

function ScheduleTable({ rows, labels = {} }: { rows: CalculationResult["schedule"]; labels?: CalculationResult["scheduleLabels"] }) {
  const l = { period: "Period", dueDate: "Due date", principal: "Principal", interest: "Interest", installment: "Installment", ...labels };
  const hasDates = rows.some((r) => r.dueDate);
  return (
    <>
      <ol className="space-y-2 md:hidden" aria-label="Schedule">
        {rows.map((r) => (
          <li key={r.period} className="rounded-md border px-3 py-2.5 text-sm tabular-nums">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">
                {l.period === "Period" ? "Installment" : l.period} {r.period}
                {r.dueDate && <span className="block text-xs font-normal whitespace-nowrap text-muted-foreground">{l.dueDate === "Due date" ? "due" : l.dueDate.toLowerCase()} {r.dueDate}</span>}
              </span>
              <span className="text-base font-semibold">{formatMoneyMaybe(r.installment)}</span>
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <dt>{l.principal}</dt>
              <dd className="text-right text-foreground">{formatMoneyMaybe(r.principal)}</dd>
              <dt>{l.interest}</dt>
              <dd className="text-right text-foreground">{formatMoneyMaybe(r.interest)}</dd>
              <dt>Opening balance</dt>
              <dd className="text-right">{formatMoneyMaybe(r.openingBalance)}</dd>
              <dt>Closing balance</dt>
              <dd className="text-right">{formatMoneyMaybe(r.closingBalance)}</dd>
            </dl>
          </li>
        ))}
      </ol>
      <div className="hidden md:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{l.period}</TableHead>
          {hasDates && <TableHead>{l.dueDate}</TableHead>}
          <TableHead className="text-right">Opening</TableHead>
          <TableHead className="text-right">{l.principal}</TableHead>
          <TableHead className="text-right">{l.interest}</TableHead>
          <TableHead className="text-right">{l.installment}</TableHead>
          <TableHead className="text-right">Closing</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {rows.map((r) => (
          <TableRow key={r.period}>
            <TableCell>{r.period}</TableCell>
            {hasDates && <TableCell>{r.dueDate}</TableCell>}
            <TableCell className="text-right">{formatMoneyMaybe(r.openingBalance)}</TableCell>
            <TableCell className="text-right">{formatMoneyMaybe(r.principal)}</TableCell>
            <TableCell className="text-right">{formatMoneyMaybe(r.interest)}</TableCell>
            <TableCell className="text-right font-medium">{formatMoneyMaybe(r.installment)}</TableCell>
            <TableCell className="text-right">{formatMoneyMaybe(r.closingBalance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
      </div>
    </>
  );
}

function SecondaryCard({ analysis }: { analysis: SecondaryAnalysis }) {
  return (
    <Card className="border-warning/50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{analysis.title}</CardTitle>
          <StatusBadge status={analysis.status} />
          <StatusBadge status={analysis.ruleStatus} />
        </div>
        {analysis.message && <CardDescription>{analysis.message}</CardDescription>}
      </CardHeader>
      {(analysis.summary.length > 0 || analysis.steps.length > 0) && (
        <CardContent className="space-y-4">
          {analysis.ruleStatus !== "CONFIRMED" && analysis.status === "CALCULATED" && (
            <p className="text-xs font-semibold tracking-wide text-warning-foreground uppercase">
              Provisional preview — not a confirmed product rule
            </p>
          )}
          <SummaryGrid entries={analysis.summary} />
          {analysis.steps.length > 0 && <StepsTable steps={analysis.steps} />}
        </CardContent>
      )}
    </Card>
  );
}

export function ResultView({ result }: { result: CalculationResult }) {
  const calculated = result.status === "CALCULATED";
  return (
    <div className="space-y-4" data-testid="result-view">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={result.status} />
        {result.rateSource === "QA_OVERRIDE" && <StatusBadge status="QA_OVERRIDE" />}
        {result.configVersionId && (
          <span className="font-mono text-xs text-muted-foreground">
            config {result.configVersionId} · formula {result.formulaVersion} · rounding {result.roundingMode}
          </span>
        )}
      </div>

      {!calculated && (
        <Alert variant={result.status === "VALIDATION_ONLY" ? "default" : "destructive"}>
          <AlertTriangle aria-hidden />
          <AlertTitle>
            {result.status === "VALIDATION_ONLY" ? "Inputs valid — numerical calculation unavailable" : result.status === "BLOCKED" ? "Calculation blocked" : "Calculation failed"}
          </AlertTitle>
          <AlertDescription>
            <p>{result.message}</p>
            {result.errorCode && <p className="font-mono text-xs">{result.errorCode}</p>}
            {result.fieldErrors.length > 0 && (
              <ul className="list-disc pl-4">
                {result.fieldErrors.map((e) => (
                  <li key={e.field}>
                    <span className="font-mono">{e.field}</span>: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <WarningList warnings={result.warnings} />

      {result.summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <SummaryGrid entries={result.summary} />
          </CardContent>
        </Card>
      )}

      {calculated && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detailed breakdown</CardTitle>
            {result.formula && <CardDescription className="font-mono text-xs break-words">{result.formula}</CardDescription>}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="steps">
              <TabsList className="flex-wrap">
                <TabsTrigger value="steps">Formula steps</TabsTrigger>
                <TabsTrigger value="lines">Line items</TabsTrigger>
                {result.schedule.length > 0 && <TabsTrigger value="schedule">Schedule</TabsTrigger>}
              </TabsList>
              <TabsContent value="steps" className="overflow-x-auto">
                <StepsTable steps={result.steps} />
              </TabsContent>
              <TabsContent value="lines" className="overflow-x-auto">
                <LineItemsTable items={result.lineItems} />
              </TabsContent>
              {result.schedule.length > 0 && (
                <TabsContent value="schedule" className="overflow-x-auto">
                  <ScheduleTable rows={result.schedule} labels={result.scheduleLabels} />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {result.secondary.map((s) => (
        <SecondaryCard key={s.key} analysis={s} />
      ))}

      {result.assumptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assumptions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {result.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
