"use client";

import {
  Calculator,
  ClipboardList,
  FileClock,
  GitCompareArrows,
  HandCoins,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  PiggyBank,
  Settings2,
  UserPen,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/profile";
import { canReviewConfig, ROLE_LABELS, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";
import { BrandMark } from "./brand-mark";
import { ProfileNameDialog } from "./profile-name-dialog";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  visible?: (role: Role | undefined) => boolean;
}

const NAV: { heading?: string; items: NavItem[] }[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    heading: "Calculators",
    items: [
      { href: "/calculators", label: "All products", icon: Calculator, exact: true },
      { href: "/calculators/loans", label: "Loans", icon: HandCoins },
      { href: "/calculators/investments", label: "Investments", icon: PiggyBank },
    ],
  },
  {
    heading: "QA workflow",
    items: [
      { href: "/scenarios", label: "Scenarios", icon: ClipboardList },
      { href: "/compare", label: "Compare", icon: GitCompareArrows },
    ],
  },
  {
    heading: "Admin",
    items: [
      { href: "/admin/configuration", label: "Configuration", icon: Settings2, visible: canReviewConfig },
      { href: "/admin/audit", label: "Audit log", icon: FileClock, visible: (r) => r === "ADMIN" },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role } = useAuth();
  return (
    <nav className="space-y-5" aria-label="Main">
      {NAV.map((group, gi) => {
        const items = group.items.filter((i) => !i.visible || i.visible(role));
        if (!items.length) return null;
        return (
          <div key={gi}>
            {group.heading && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">{group.heading}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-sm font-semibold">RFS Calculator</span>
        <span className="block text-[11px] text-sidebar-foreground/60">QA reference tool</span>
      </span>
    </Link>
  );
}

function UserBlock({ onEditName }: { onEditName: () => void }) {
  const { profile, role, signOut } = useAuth();
  const name = profile?.displayName ?? "…";
  return (
    <div className="space-y-2 border-t border-sidebar-border pt-4">
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden>
          {profile ? initials(profile.displayName) : "…"}
        </span>
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate text-sm font-medium" title={profile?.email ?? undefined}>
            {name}
          </p>
          <p className="text-sidebar-foreground/60">{role ? ROLE_LABELS[role] : "…"}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Edit your name" title="Edit your name" onClick={onEditName}>
          <UserPen aria-hidden />
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => signOut()}>
          <LogOut aria-hidden />
          Sign out
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  // Users without a stored name (e.g. created before names existed) must add one.
  const nameMissing = Boolean(profile && !profile.firstName);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted-foreground" role="status">
        <Loader2 className="size-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:p-4">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <UserBlock onEditName={() => setEditingName(true)} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
        <Brand />
        <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X /> : <Menu />}
        </Button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[57px] bottom-0 z-20 flex flex-col gap-6 overflow-y-auto bg-sidebar p-4 text-sidebar-foreground lg:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
          <UserBlock onEditName={() => { setOpen(false); setEditingName(true); }} />
        </div>
      )}

      <main className="min-w-0">
        <div className="border-b bg-warning/10 px-4 py-1.5 text-center text-xs text-warning-foreground sm:px-6">
          Estimates for QA reference only — not a customer offer. No loans, investments or money movement are created.
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
      {(nameMissing || editingName) && (
        <ProfileNameDialog
          key={profile?.uid}
          open
          required={nameMissing}
          onOpenChange={(o) => !o && setEditingName(false)}
        />
      )}
    </div>
  );
}
