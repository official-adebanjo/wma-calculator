"use client";

import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Parses YYYY-MM-DD as a local calendar date (no timezone shift). */
function fromIso(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  placeholder = "Pick a date",
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);
  const [month, setMonth] = useState<Date>(selected ?? new Date());

  const pick = (d: Date | undefined) => {
    onChange(d ? toIso(d) : "");
    if (d) setMonth(d);
    setOpen(false);
    onBlur?.();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && selected) setMonth(selected);
        if (!o) onBlur?.();
      }}
    >
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cn("w-full justify-start gap-2 pr-9 font-normal tabular-nums", !selected && "text-muted-foreground")}
          >
            <CalendarIcon className="size-4 text-muted-foreground" aria-hidden />
            {selected ? format(selected, "EEE, d MMM yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        {selected && (
          <button
            type="button"
            aria-label="Clear date"
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => pick(undefined)}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align="start" collisionPadding={8}>
        <div className="w-min">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={pick}
          month={month}
          onMonthChange={setMonth}
          captionLayout="dropdown"
          startMonth={new Date(2000, 0)}
          endMonth={new Date(2050, 11)}
          weekStartsOn={1}
          modifiers={{ weekend: { dayOfWeek: [0, 6] } }}
          modifiersClassNames={{
            weekend:
              "after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:z-20 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-warning",
          }}
          className="p-2 [--cell-size:--spacing(8)] sm:p-3 sm:[--cell-size:--spacing(9)]"
          autoFocus
        />
        <div className="flex flex-col gap-1.5 border-t px-3 py-2">
          <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
            Weekend: due/maturity dates are flagged
          </span>
          <div className="flex justify-end gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => pick(undefined)}>
              Clear
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => pick(new Date())}>
              Today
            </Button>
          </div>
        </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
