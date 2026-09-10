import { getDataQuality, getVerificationOperations } from "@/lib/admin-analytics/queries";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading } from "@/components/admin/empty-state";

export default async function AdminDataQualityPage() {
  const [quality, ops] = await Promise.all([getDataQuality(), getVerificationOperations()]);

  return (
    <div>
      <SectionHeading
        title="Data Quality"
        description="Structural signals worth attention, beyond the raw verification-status counts."
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
        />
      </StatGrid>

      <h2 className="mt-8 text-base font-semibold text-foreground">Candidates by status</h2>
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
