"use client";

import { ArrowLeft, Calculator, ClipboardList, LayoutDashboard, SearchX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotFoundPanelProps {
  title?: string;
  description?: React.ReactNode;
  /** What was looked up, e.g. "Product code" — shown in the lookup receipt. */
  lookupLabel?: string;
  lookupValue?: string;
  className?: string;
}

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calculators", label: "Calculators", icon: Calculator },
  { href: "/scenarios", label: "Scenarios", icon: ClipboardList },
];

/**
 * 404 content shared by the root not-found page and in-app lookups (unknown
 * product, missing scenario). Mirrors the calculator's blocked-result style:
 * it states clearly that nothing was found and nothing was calculated.
 */
export function NotFoundPanel({
  title = "Page not found",
  description = "The address may be mistyped, or the page may have moved. Nothing was calculated.",
  lookupLabel = "Requested",
  lookupValue,
  className,
}: NotFoundPanelProps) {
  const pathname = usePathname();
  const router = useRouter();
  const value = lookupValue ?? pathname;

  return (
    <div className={cn("mx-auto flex w-full max-w-xl flex-col items-center text-center", className)}>
      <div className="relative select-none" aria-hidden>
        <p className="font-mono text-[7rem] leading-none font-semibold tracking-tighter text-primary/15 sm:text-[9rem]">404</p>
        <span className="absolute inset-x-4 top-[44%] h-1.5 rounded-full bg-warning/70" />
        <span className="absolute inset-x-4 top-[56%] h-1.5 rounded-full bg-warning/70" />
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>

      <dl className="mt-6 w-full rounded-lg border border-dashed bg-card text-left text-sm shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b border-dashed px-4 py-2.5">
          <dt className="text-muted-foreground">{lookupLabel}</dt>
          <dd className="min-w-0 truncate font-mono text-xs" title={value}>
            {value}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-dashed px-4 py-2.5">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            <SearchX className="size-3.5" aria-hidden />
            Not found · 404
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Result</dt>
          <dd className="text-xs font-medium">None — no figures produced</dd>
        </div>
      </dl>

      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}>
          <ArrowLeft aria-hidden />
          Go back
        </Button>
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Button key={href} variant={href === "/dashboard" ? "default" : "outline"} asChild>
            <Link href={href}>
              <Icon aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
