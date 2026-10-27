import { cn } from "@/lib/utils";

/** App mark (Naira sign); matches src/app/icon.svg. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#1B6B53" />
      <path d="M21 47V17l22 30V17" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 28h38M13 37h38" stroke="#F2C14E" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
