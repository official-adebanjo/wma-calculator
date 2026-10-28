/** Calendar helpers operating on ISO YYYY-MM-DD strings in UTC. */

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

/** Adds calendar months, clamping to the last day of the target month. */
export function addMonths(iso: string, months: number): string {
  const d = parse(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fmt(target);
}

export function isWeekend(iso: string): boolean {
  const dow = parse(iso).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Next Monday–Friday on or after the date. Public holidays are not modelled. */
export function nextBusinessDay(iso: string): string {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

export function weekdayName(iso: string): string {
  return parse(iso).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}
