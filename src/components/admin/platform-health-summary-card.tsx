import Link from "next/link";
import { getPlatformHealth } from "@/lib/platform-health/health-checks";
import { formatRelativeTime } from "@/lib/platform-health/format";
import { PlatformHealthStatusBadge } from "./platform-health-status-badge";

/**
 * Compact, non-dominant summary for the main Founder Dashboard — every
 * line comes from the same real getPlatformHealth() the full page uses,
 * never a hardcoded "HEALTHY". Deliberately small: this is a glance, not
 * a replacement for the North Star metric above it.
 */
export async function PlatformHealthSummaryCard() {
  const health = await getPlatformHealth();

  const facts: string[] = [
    health.database.connectionOk ? "Database connected" : "Database connection issue",
    health.analytics.totalEventsEver === 0
      ? "No activity recorded yet"
      : health.analytics.status === "HEALTHY"
        ? "Analytics receiving events"
        : "Analytics quiet — check details",
    health.productData.status === "NEEDS_ATTENTION"
      ? "Some data-quality issues to review"
      : "No critical data issues",
  ];

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Platform Health
          </p>
          <div className="mt-1">
            <PlatformHealthStatusBadge status={health.overallStatus} size="sm" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Last checked: {formatRelativeTime(health.checkedAt)}
        </p>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      <Link
        href="/admin/platform-health"
        className="mt-3 inline-block text-sm font-medium text-accent-hover hover:underline"
      >
        View Platform Health →
      </Link>
    </div>
  );
}
