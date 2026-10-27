import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { NotFoundPanel } from "@/components/not-found-panel";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="px-4 py-4 sm:px-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2.5">
          <BrandMark />
          <span className="leading-tight">
            <span className="block text-sm font-semibold">RFS Calculator</span>
            <span className="block text-[11px] text-muted-foreground">QA reference tool</span>
          </span>
        </Link>
      </header>
      <main className="flex flex-1 items-center px-4 pb-16 sm:px-6">
        <NotFoundPanel />
      </main>
    </div>
  );
}
