import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { EngagementStatusSelect } from "@/components/admin/engagement-status-select";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { updateInaccuracyReportStatusAction } from "@/app/admin/_actions/engagement-actions";
import type { InaccuracyReportStatus } from "@/lib/engagement/types";

export const metadata = {
  title: "Inaccuracy Reports | Developer Connects",
  robots: { index: false, follow: false },
};

const STATUS_OPTIONS: readonly InaccuracyReportStatus[] = ["NEW", "IN_REVIEW", "RESOLVED", "DISMISSED"];

const CATEGORY_LABELS: Record<string, string> = {
  OFFICIAL_WEBSITE: "Official website",
  DEVELOPER_NAME: "Developer name",
  HEADQUARTERS: "Headquarters",
  OTHER: "Other",
};

/**
 * Founder-only queue of "Report inaccurate information" submissions
 * (Part 25) — real-time via the same mechanism as the rest of the admin
 * area: a fresh database read on every page load/refresh, no separate
 * push infrastructure (Part 30).
 */
export default async function AdminReportsPage() {
  const engagement = createEngagementRepositories();
  const developerRepos = createPostgresRepositories();

  const reports = await engagement.reports.list(200);
  const developers = await developerRepos.developers.getManyByIds(reports.map((r) => r.developerId));
  const developerNameById = new Map(developers.map((d) => [d.id, d.displayName]));

  return (
    <div>
      <SectionHeading
        title="Inaccuracy Reports"
        description="What visitors flagged as wrong on a developer's page — official website, name, headquarters, or something else."
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="A report will appear here the moment a visitor uses 'Report inaccurate information' on a developer page."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {developerNameById.get(report.developerId) ?? "Unknown developer"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {CATEGORY_LABELS[report.category] ?? report.category}
                  </span>
                </p>
                <p className="mt-1 text-foreground">{report.details}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.createdAt.toLocaleString()}
                  {report.reporterEmail && (
                    <>
                      {" · "}
                      <a href={`mailto:${report.reporterEmail}`} className="text-accent-hover hover:underline">
                        {report.reporterEmail}
                      </a>
                    </>
                  )}
                </p>
              </div>
              <EngagementStatusSelect
                id={report.id}
                status={report.status}
                options={STATUS_OPTIONS}
                action={updateInaccuracyReportStatusAction}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
