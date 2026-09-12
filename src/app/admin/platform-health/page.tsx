import { getPlatformHealth } from "@/lib/platform-health/health-checks";
import { formatBytes, formatPercent } from "@/lib/platform-health/format";
import { DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT } from "@/lib/platform-health/thresholds";
import { PlatformHealthStatusBadge } from "@/components/admin/platform-health-status-badge";
import { PlatformHealthRefresh } from "@/components/admin/platform-health-refresh";
import { PlatformHealthCategoryCard } from "@/components/admin/platform-health-category-card";

export const metadata = {
  title: "Platform Health | Developer Connect",
  robots: { index: false, follow: false },
};

const WARNING_STYLES = {
  ACTION_REQUIRED: "border-red-200 bg-red-50",
  NEEDS_ATTENTION: "border-amber-200 bg-amber-50",
} as const;

export default async function PlatformHealthPage() {
  const health = await getPlatformHealth();
  const { database, authentication, deployment, storage } = health;

  const hasRealDeploymentInfo = deployment.commitSha !== null;

  // "Limits to watch" — only real infrastructure limits, and only ever
  // driven by database.storage (the one capacity this page can
  // potentially measure). Never a developer/product-data condition.
  const limitsToWatch: string[] = [];
  if (database.storage.usagePercent !== null) {
    if (database.storage.usagePercent >= DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT.NEEDS_ATTENTION_ABOVE) {
      limitsToWatch.push(`Database storage is ${formatPercent(database.storage.usagePercent)} used.`);
    }
  } else if (database.storage.measured) {
    limitsToWatch.push("Database capacity information is not exposed by your provider.");
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Platform Health</h1>
          <div className="mt-1">
            <PlatformHealthStatusBadge status={health.overallStatus} />
          </div>
        </div>
        <PlatformHealthRefresh checkedAt={health.checkedAt.toISOString()} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{health.overallMessage}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This page shows infrastructure and capacity only. Developer verification, re-verification, and
        data-quality issues are tracked in Data Quality and Verification instead.
      </p>

      {health.warnings.length > 0 && (
        <div className="mt-6 space-y-3">
          {health.warnings.map((warning) => (
            <div key={warning.id} className={`rounded-lg border p-4 ${WARNING_STYLES[warning.level]}`}>
              <p className="font-medium text-foreground">
                {warning.level === "ACTION_REQUIRED" ? "🔴" : "🟡"} {warning.title}
              </p>
              <p className="mt-1 text-sm text-foreground">{warning.explanation}</p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Recommended action: {warning.recommendedAction}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <PlatformHealthCategoryCard
          title="Database"
          status={database.status}
          summary={database.summary}
          detail={database.detail}
          facts={
            <>
              <p>Connection: {database.connectionOk ? "Connected" : "Unavailable"}</p>
              <p>Response time: {database.latencyMs !== null ? `${database.latencyMs}ms` : "unavailable"}</p>
              <p>
                Used: {database.storage.measured && database.storage.usedBytes !== null
                  ? formatBytes(database.storage.usedBytes)
                  : "Not currently measured"}
              </p>
              <p>
                Capacity:{" "}
                {database.storage.capacityBytes !== null
                  ? formatBytes(database.storage.capacityBytes)
                  : "Not available from provider"}
              </p>
              <p>
                Space left:{" "}
                {database.storage.remainingBytes !== null ? formatBytes(database.storage.remainingBytes) : "Not available"}
              </p>
              <p>
                Usage:{" "}
                {database.storage.usagePercent !== null ? formatPercent(database.storage.usagePercent) : "Not available"}
              </p>
            </>
          }
        >
          {database.storage.capacityUnavailableReason && (
            <p className="mt-2 text-xs text-muted-foreground">{database.storage.capacityUnavailableReason}</p>
          )}
          {database.tableBreakdown.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Storage by table
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {database.tableBreakdown.map((table) => (
                  <li key={table.tableName} className="flex justify-between gap-3">
                    <span>
                      {table.tableName} ({table.rowCount.toLocaleString()} rows)
                    </span>
                    <span>
                      {formatBytes(table.sizeBytes)}
                      {table.percentOfTotal !== null ? ` · ${table.percentOfTotal}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PlatformHealthCategoryCard>

        <PlatformHealthCategoryCard
          title="Storage"
          status={storage.status}
          summary={storage.inUse ? storage.summary : "No application storage currently in use"}
          detail={storage.detail}
        />

        <PlatformHealthCategoryCard
          title="Sign-in (Clerk)"
          status={authentication.status}
          summary={authentication.summary}
          detail={authentication.detail}
          facts={
            authentication.latencyMs !== null ? (
              <>
                <p>Connection: {authentication.clerkReachable ? "Connected" : "Unavailable"}</p>
                <p>Response time: {authentication.latencyMs}ms</p>
              </>
            ) : undefined
          }
        />

        {hasRealDeploymentInfo && (
          <PlatformHealthCategoryCard
            title="Deployment"
            status={deployment.status}
            summary={deployment.summary}
            detail={deployment.detail}
            facts={
              <>
                <p>Current version: {deployment.commitSha!.slice(0, 7)}</p>
                <p>Branch: {deployment.gitBranch ?? "unknown"}</p>
                <p>Environment: {deployment.environment ?? "unknown"}</p>
                <p>Region: {deployment.region ?? "unknown"}</p>
              </>
            }
          />
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limits to watch</p>
        {limitsToWatch.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {limitsToWatch.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No infrastructure limits need attention right now.</p>
        )}
      </div>
    </div>
  );
}
