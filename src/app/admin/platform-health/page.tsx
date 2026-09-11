import { getPlatformHealth } from "@/lib/platform-health/health-checks";
import { formatBytes, formatRelativeTime } from "@/lib/platform-health/format";
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

      <p className="mt-3 text-sm text-muted-foreground">
        Here&apos;s a simple view of whether Developer Connect is working normally. Technical
        detail is available under &ldquo;View technical details&rdquo; on each card below.
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
          title="A. Database"
          status={health.database.status}
          summary={health.database.summary}
          detail={health.database.detail}
          facts={
            <>
              <p>
                Response time:{" "}
                {health.database.latencyMs !== null ? `${health.database.latencyMs}ms` : "unavailable"}
              </p>
              <p>
                Storage used:{" "}
                {health.database.storage.measured && health.database.storage.usedBytes !== null
                  ? formatBytes(health.database.storage.usedBytes)
                  : "⚪ Not currently measured"}
              </p>
              {health.database.storage.measured ? (
                <p>Capacity: Not exposed by provider</p>
              ) : (
                <p className="text-xs">{health.database.storage.reason}</p>
              )}
            </>
          }
        >
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <li>Developers without a verified website: {health.database.dataQuality.developersWithoutVerifiedWebsite}</li>
            <li>Candidates with no evidence: {health.database.dataQuality.candidatesWithNoEvidence}</li>
            <li>Verified, never re-checked: {health.database.dataQuality.verifiedNeverReChecked}</li>
          </ul>

          {health.database.tableBreakdown.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Storage by table
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {health.database.tableBreakdown.map((table) => (
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
          title="B. Application"
          status={health.application.status}
          summary={health.application.summary}
          detail={health.application.detail}
        />

        <PlatformHealthCategoryCard
          title="C. Authentication"
          status={health.authentication.status}
          summary={health.authentication.summary}
          detail={health.authentication.detail}
          facts={
            health.authentication.latencyMs !== null ? (
              <p>Response time: {health.authentication.latencyMs}ms</p>
            ) : undefined
          }
        />

        <PlatformHealthCategoryCard
          title="D. Product Data"
          status={health.productData.status}
          summary={health.productData.summary}
          detail={health.productData.detail}
          facts={
            health.productData.totalDevelopers === 0 ? undefined : (
              <>
                <p>Total developers: {health.productData.totalDevelopers}</p>
                <p>Verified developers: {health.productData.verifiedDevelopers}</p>
                <p>Candidates awaiting review: {health.productData.pendingVerification}</p>
                <p>Developers without a verified website: {health.productData.developersWithoutVerifiedWebsite}</p>
                <p>Candidates with no evidence: {health.productData.candidatesWithNoEvidence}</p>
                <p>Verified, never re-checked: {health.productData.verifiedNeverReChecked}</p>
              </>
            )
          }
        >
          {health.productData.totalDevelopers > 0 && (
            <>
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Developers by verification status
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <li>Discovered: {health.productData.developerStatusBreakdown.discovered}</li>
                  <li>Pending verification: {health.productData.developerStatusBreakdown.pendingVerification}</li>
                  <li>Verified: {health.productData.developerStatusBreakdown.verified}</li>
                  <li>Needs re-verification: {health.productData.developerStatusBreakdown.needsReverification}</li>
                  <li>Rejected: {health.productData.developerStatusBreakdown.rejected}</li>
                  <li>Inactive: {health.productData.developerStatusBreakdown.inactive}</li>
                </ul>
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Other tables
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <li>Website candidates: {health.productData.entityCounts.websiteCandidates}</li>
                  <li>Evidence: {health.productData.entityCounts.evidence}</li>
                  <li>Verification events: {health.productData.entityCounts.verificationEvents}</li>
                  <li>Profiles: {health.productData.entityCounts.profiles}</li>
                  <li>Notifications: {health.productData.entityCounts.notifications}</li>
                  <li>Analytics events: {health.productData.entityCounts.analyticsEvents}</li>
                </ul>
              </div>
            </>
          )}
        </PlatformHealthCategoryCard>

        <PlatformHealthCategoryCard
          title="E. Analytics"
          status={health.analytics.status}
          summary={health.analytics.summary}
          detail={health.analytics.detail}
          facts={
            health.analytics.totalEventsEver > 0 ? (
              <>
                <p>
                  Last event:{" "}
                  {health.analytics.mostRecentEventAt
                    ? formatRelativeTime(health.analytics.mostRecentEventAt)
                    : "—"}
                </p>
                <p>Events today: {health.analytics.eventsToday}</p>
              </>
            ) : undefined
          }
        />

        <PlatformHealthCategoryCard
          title="F. Deployment"
          status={health.deployment.status}
          summary={health.deployment.summary}
          detail={health.deployment.detail}
          facts={
            health.deployment.commitSha ? (
              <>
                <p>Commit: {health.deployment.commitSha.slice(0, 7)}</p>
                <p>Branch: {health.deployment.gitBranch ?? "unknown"}</p>
                <p>Environment: {health.deployment.environment ?? "unknown"}</p>
                <p>Region: {health.deployment.region ?? "unknown"}</p>
              </>
            ) : undefined
          }
        >
          {health.deployment.deploymentUrl && (
            <p className="mt-2 text-xs text-muted-foreground">URL: {health.deployment.deploymentUrl}</p>
          )}
          {health.deployment.deploymentId && (
            <p className="mt-1 text-xs text-muted-foreground">Deployment ID: {health.deployment.deploymentId}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Deployment timestamp: Not available</p>
        </PlatformHealthCategoryCard>

        <PlatformHealthCategoryCard
          title="G. Object Storage"
          status={health.storage.status}
          summary={health.storage.summary}
          detail={health.storage.detail}
        />
      </div>
    </div>
  );
}
