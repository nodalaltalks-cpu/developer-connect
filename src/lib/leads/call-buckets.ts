import type { CallGroupBy } from "./repository.ts";

/**
 * The bucket a call falls in, cut in the business time zone — the pure twin of the SQL the PostgreSQL adapter runs
 * (an integration test asserts they agree). Keys sort correctly as text.
 */

const ZONE_RE = /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/;

/** The adapter puts the zone into SQL as a literal (so GROUP BY sees one expression); only plain IANA names pass. */
export function assertSafeTimeZone(timeZone: string): string {
  if (!ZONE_RE.test(timeZone)) throw new Error("Unsafe time zone name.");
  return timeZone;
}

export function localParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric" }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: n("year"), month: n("month"), day: n("day"), hour: n("hour") };
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export function bucketKey(date: Date, groupBy: Exclude<CallGroupBy, "EMPLOYEE">, timeZone: string): string {
  const { year, month, day, hour } = localParts(date, timeZone);
  switch (groupBy) {
    case "HOUR_OF_DAY":
      return pad(hour);
    case "HOUR":
      return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}`;
    case "DAY":
      return `${year}-${pad(month)}-${pad(day)}`;
    case "WEEK": {
      // ISO weeks start on Monday: the key is that Monday's date.
      const local = new Date(Date.UTC(year, month - 1, day));
      const back = (local.getUTCDay() + 6) % 7;
      const monday = new Date(local.getTime() - back * 86_400_000);
      return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
    }
    case "MONTH":
      return `${year}-${pad(month)}`;
    case "QUARTER":
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    case "YEAR":
      return String(year);
  }
}
