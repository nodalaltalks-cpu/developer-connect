import {
  getUserAndProfileIntelligence,
  getUserBehaviorIntelligence,
  getRetentionMetrics,
} from "@/lib/admin-analytics/queries";
import { formatRate } from "@/lib/admin-analytics/rate";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading } from "@/components/admin/empty-state";

const DROP_OFF_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "Very High",
};

const METRIC_LABEL: Record<string, string> = {
  searches: "Searches",
  developerPageViews: "Developer page views",
  officialWebsiteClicks: "Official website clicks",
};

const SEGMENT_LABEL: Record<string, string> = {
  NEW: "New",
  RETURNING: "Returning",
  HIGH_INTENT: "High intent",
  RESEARCHING: "Researching",
  ZERO_RESULT_ONLY: "Zero-result only",
};

export default async function AdminUsersPage() {
  const [intel, behavior, retention] = await Promise.all([
    getUserAndProfileIntelligence(),
    getUserBehaviorIntelligence(),
    getRetentionMetrics(),
  ]);

  return (
    <div>
      <SectionHeading
        title="Users & Profiles"
        description="Aggregate behaviour only — never individual profile answers."
      />

      <h2 className="text-base font-semibold text-foreground">Sessions & accounts</h2>
      <div className="mt-3">
        <StatGrid>
          <StatTile label="Distinct sessions" value={intel.distinctSessions} />
          <StatTile label="Authenticated users seen" value={intel.distinctAuthenticatedUsers} />
          <StatTile
            label="Sessions per user"
            value={intel.sessionsPerUser === null ? "—" : intel.sessionsPerUser}
          />
          <StatTile
            label="Avg. searches / session"
            value={behavior.avgSearchesPerSession ?? "—"}
          />
          <StatTile
            label="Avg. developer pages / session"
            value={behavior.avgDeveloperPageViewsPerSession ?? "—"}
          />
          <StatTile
            label="Avg. official-site clicks / session"
            value={behavior.avgOfficialWebsiteClicksPerSession ?? "—"}
          />
          <StatTile label="Mobile share" value={formatRate(behavior.mobileShare)} />
        </StatGrid>
      </div>

      <h2 className="mt-8 text-base font-semibold text-foreground">User segments</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Deterministic, rule-based tags — never an inferred classification. A session can match
        more than one; these are independent signals, not a strict partition.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 font-medium">Sessions</th>
              <th className="px-4 py-2 font-medium">Rule</th>
            </tr>
          </thead>
          <tbody>
            {behavior.segments.map((s) => (
              <tr key={s.segment} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-medium text-foreground">{SEGMENT_LABEL[s.segment]}</td>
                <td className="px-4 py-2 text-foreground">{s.count}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.definition}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-base font-semibold text-foreground">Retention</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        &ldquo;Returned within N days&rdquo; — a session is only counted once its first-ever visit
        is at least N days old, so there&apos;s been time to actually observe a return.
      </p>
      <div className="mt-3">
        <StatGrid>
          {retention.windows.map((w) => (
            <StatTile
              key={w.windowDays}
              label={`D${w.windowDays} return rate`}
              value={w.eligibleSessions > 0 ? formatRate(w.rate) : "Insufficient data"}
              hint={w.eligibleSessions > 0 ? undefined : `only ${w.eligibleSessions} eligible sessions so far`}
            />
          ))}
        </StatGrid>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        7-day return rate — reached an official-website click vs. didn&apos;t:{" "}
        {retention.returnByOfficialWebsiteClick.sufficientData ? (
          <>
            {formatRate(retention.returnByOfficialWebsiteClick.clicked)} vs.{" "}
            {formatRate(retention.returnByOfficialWebsiteClick.didNotClick)}
          </>
        ) : (
          "Insufficient data"
        )}
      </p>

      <h2 className="mt-8 text-base font-semibold text-foreground">Profile completion</h2>
      <div className="mt-3">
        <StatGrid>
          <StatTile label="Profiles started" value={intel.profilesStarted} />
          <StatTile label="New (last 7 days)" value={intel.newProfilesLast7Days} />
          <StatTile label="Active (last 7 days)" value={intel.activeProfilesLast7Days} />
          <StatTile label="Fields configured" value={intel.profileFieldsConfigured} />
          <StatTile
            label="Average completion"
            value={intel.averageCompletionPercent === null ? "N/A" : `${intel.averageCompletionPercent}%`}
          />
        </StatGrid>
      </div>

      {intel.profileFieldsConfigured === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Completion tracking will activate the moment product defines the first profile field
          (see PROFILE_FIELD_CONFIG) — everything downstream (this page, the profile page, the
          analytics events) already reads that single source of truth, so no further work is
          needed here when that happens.
        </p>
      ) : (
        <>
          <h3 className="mt-8 text-sm font-semibold text-foreground">Completion distribution</h3>
          <div className="mt-3">
            <StatGrid>
              {intel.completionDistribution.map((bucket) => (
                <StatTile key={bucket.label} label={bucket.label} value={bucket.count} />
              ))}
            </StatGrid>
          </div>

          <h3 className="mt-8 text-sm font-semibold text-foreground">
            Section completion & drop-off
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop-off is a fixed, documented banding of the completion rate (≥80% Low, 60–79%
            Medium, 40–59% High, &lt;40% Very High) — shown only once enough profiles exist to be
            meaningful.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Section</th>
                  <th className="px-4 py-2 font-medium">Completion</th>
                  <th className="px-4 py-2 font-medium">Drop-off</th>
                </tr>
              </thead>
              <tbody>
                {intel.sectionCompletion.map((section) => (
                  <tr key={section.sectionId} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-foreground">{section.title}</td>
                    <td className="px-4 py-2 text-foreground">{formatRate(section.completionRate)}</td>
                    <td className="px-4 py-2 text-foreground">
                      {section.dropOff ? DROP_OFF_LABEL[section.dropOff] : "Insufficient data"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-8 text-sm font-semibold text-foreground">
            Profile completion vs. engagement
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            OBSERVATION, not causation: a correlation here does not mean completing a profile
            causes more engagement — the same users may simply be more engaged in general. Shown
            only once both groups (≥50% complete vs &lt;50%) reach a meaningful sample size.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Metric</th>
                  <th className="px-4 py-2 font-medium">Avg. for ≥50% complete</th>
                  <th className="px-4 py-2 font-medium">Avg. for &lt;50% complete</th>
                </tr>
              </thead>
              <tbody>
                {intel.engagementByCompletion.map((row) => (
                  <tr key={row.metric} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-foreground">{METRIC_LABEL[row.metric]}</td>
                    <td className="px-4 py-2 text-foreground">
                      {row.sufficientData ? row.higherCompletionAverage : "Insufficient data"}
                      {row.sufficientData && (
                        <span className="text-muted-foreground"> (n={row.higherGroupSize})</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-foreground">
                      {row.sufficientData ? row.lowerCompletionAverage : "Insufficient data"}
                      {row.sufficientData && (
                        <span className="text-muted-foreground"> (n={row.lowerGroupSize})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
