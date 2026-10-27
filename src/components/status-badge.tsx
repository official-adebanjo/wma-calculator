import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, FlaskConical, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CalculationStatus, ProductStatus, RuleStatus } from "@/domain/types";
import { cn } from "@/lib/utils";

type AnyStatus = ProductStatus | CalculationStatus | RuleStatus | "QA_OVERRIDE";

/** Status is conveyed by icon + text, never by colour alone. */
const STYLES: Record<AnyStatus, { label: string; icon: React.ElementType; className: string }> = {
  ACTIVE: { label: "Active", icon: CheckCircle2, className: "border-success/40 bg-success/10 text-success" },
  CALCULATED: { label: "Calculated", icon: CheckCircle2, className: "border-success/40 bg-success/10 text-success" },
  CONFIRMED: { label: "Confirmed", icon: CheckCircle2, className: "border-success/40 bg-success/10 text-success" },
  VALIDATION_ONLY: { label: "Validation only", icon: CircleDashed, className: "border-warning/50 bg-warning/10 text-warning-foreground" },
  PROVISIONAL: { label: "Provisional", icon: FlaskConical, className: "border-warning/50 bg-warning/10 text-warning-foreground" },
  OPEN: { label: "Open", icon: Clock, className: "border-warning/50 bg-warning/10 text-warning-foreground" },
  NOT_SPECIFIED: { label: "Not specified", icon: CircleDashed, className: "border-border bg-muted text-muted-foreground" },
  BLOCKED: { label: "Blocked", icon: Ban, className: "border-destructive/40 bg-destructive/10 text-destructive" },
  ERROR: { label: "Error", icon: XCircle, className: "border-destructive/40 bg-destructive/10 text-destructive" },
  DEPRECATED: { label: "Deprecated", icon: AlertTriangle, className: "border-border bg-muted text-muted-foreground" },
  QA_OVERRIDE: { label: "QA override", icon: ShieldAlert, className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const s = STYLES[status];
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", s.className, className)}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </Badge>
  );
}
