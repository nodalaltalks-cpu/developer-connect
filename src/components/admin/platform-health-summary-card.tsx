import Link from "next/link";
import { getPlatformHealth } from "@/lib/platform-health/health-checks";
import { formatRelativeTime } from "@/lib/platform-health/format";
import { PlatformHealthStatusBadge } from "./platform-health-status-badge";

/**
 * Compact, non-dominant summary for the main Founder Dashboard — every
 * line comes from the same real getPlatformHealth() the full page uses,
 * never a hardcoded "HEALTHY". Deliberately small: this is a glance, not
 * a replacement for the North Star metric above it.
 *
 * Infrastructure-only, same as the full page: no developer verification
 * or data-quality fact is ever shown here — see /admin/data-quality and
 * /admin/developers for that.
 */
export async function PlatformHealthSummaryCard() {
  const health = await getPlatformHealth();

  const facts: string[] = [
    health.database.connectionOk ? "Database connected" : "Database connection issue",
    health.authentication.clerkReachable === false ? "Sign-in provider unreachable" : "Sign-in working normally",
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
      <p className="mt-2 text-sm text-foreground">{health.overallMessage}</p>
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
