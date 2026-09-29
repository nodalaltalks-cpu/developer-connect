"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DATE_RANGE_OPTIONS, parseDateRangeKey, resolveDateRange } from "@/lib/admin-analytics/date-range";

/**
 * The Founder Dashboard's ONE global analytics date filter (Part 2 of the
 * task this implements) — lives once, in admin/layout.tsx's header, so
 * every page underneath shares the exact same selected range via the
 * `?range=` URL parameter. There is deliberately no independent date
 * state anywhere else: every admin/*\/page.tsx reads this same param via
 * `parseDateRangeKey(searchParams.range)` and resolves it with the exact
 * same `resolveDateRange()` this component uses for its own label.
 *
 * A plain client component reading `useSearchParams()` — not something
 * admin/layout.tsx (a Server Component) could do directly, since Next.js
 * only passes `searchParams` to a route's own `page.tsx`, never to a
 * shared layout. Computing the label here (rather than passing it down
 * from a page) means one, single, always-in-sync source: this component
 * and every page resolve the same URL param through the same pure
 * function, so they can never disagree about what "Month" currently means.
 *
 * URL state (not React context/a client store) so the selection survives
 * a refresh, works with the browser back/forward buttons, and is
 * shareable — exactly the "?admin?range=month" architecture the task
 * asked for.
 */
export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = parseDateRangeKey(searchParams.get("range") ?? undefined);
  const resolved = resolveDateRange(selected);

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next);
    // Changing the global range always returns to page 1 of whatever
    // paginated list the current page happens to show — a stale page
    // number from the previous range's total could otherwise point past
    // the end of the newly-filtered result set.
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <label className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Date Range</span>
        <select
          value={selected}
          onChange={(e) => handleChange(e.target.value)}
          aria-label="Founder Dashboard date range"
          className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {DATE_RANGE_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <span className="max-w-[14rem] truncate text-xs text-muted-foreground sm:max-w-none">
        {resolved.label}
      </span>
    </div>
  );
}
