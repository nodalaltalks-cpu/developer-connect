import { getDataQuality, getVerificationOperations } from "@/lib/admin-analytics/queries";
import { parseDateRangeKey, resolveDateRange } from "@/lib/admin-analytics/date-range";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading } from "@/components/admin/empty-state";

export default async function AdminDataQualityPage({
  searchParams,
}: PageProps<"/admin/data-quality">) {
  const resolvedSearchParams = await searchParams;
  const range = resolveDateRange(parseDateRangeKey(resolvedSearchParams.range));
  const [quality, ops] = await Promise.all([getDataQuality(), getVerificationOperations(range)]);

  return (
    <div>
      <SectionHeading
        title="Data Quality"
        description="Structural signals worth attention, beyond the raw verification-status counts — always the current, live state, not date-filtered."
      />

      <StatGrid>
        <StatTile
          label="Active developers, no verified site"
          value={quality.developersWithoutVerifiedWebsite}
        />
        <StatTile label="Candidates with no evidence" value={quality.candidatesWithNoEvidence} />
        <StatTile label="Verified, never re-checked" value={quality.verifiedNeverReChecked} />
        <StatTile
          label="Avg. verification turnaround"
          value={ops.averageTurnaroundHours === null ? "—" : `${ops.averageTurnaroundHours}h`}
          hint={`For candidates decided during ${range.label}`}
        />
      </StatGrid>

      <h2 className="mt-8 text-base font-semibold text-foreground">Candidates by status</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Current, live counts — not date-filtered. See Verification for how many candidates were
        verified/rejected/flagged during {range.label}.
      </p>
      <div className="mt-3">
        <StatGrid>
          <StatTile label="Discovered" value={ops.discovered} />
          <StatTile label="Pending verification" value={ops.pendingVerification} />
          <StatTile label="Verified" value={ops.verified} />
          <StatTile label="Rejected" value={ops.rejected} />
          <StatTile label="Needs re-verification" value={ops.needsReverification} />
          <StatTile label="Inactive" value={ops.inactive} />
        </StatGrid>
      </div>
    </div>
  );
}
