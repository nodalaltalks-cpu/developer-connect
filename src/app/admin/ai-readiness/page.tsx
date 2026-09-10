import { getAiReadiness } from "@/lib/admin-analytics/queries";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading } from "@/components/admin/empty-state";

export default async function AdminAiReadinessPage() {
  const readiness = await getAiReadiness();

  return (
    <div>
      <SectionHeading
        title="AI/ML Data Readiness"
        description="No AI is built or claimed here — this is a scorecard of how much structured data exists for future ranking, recommendation, or classification work."
      />

      <StatGrid>
        <StatTile
          label="Labeled verification decisions"
          value={readiness.labeledVerificationDecisions}
          hint="Founder approve/reject calls — real training labels"
        />
        <StatTile label="Search events" value={readiness.totalSearchEvents} />
        <StatTile label="Distinct search queries" value={readiness.distinctSearchQueries} />
        <StatTile label="Zero-result queries" value={readiness.zeroResultQueries} />
        <StatTile label="Total behaviour events" value={readiness.totalBehaviourEvents} />
        <StatTile label="Profile fields configured" value={readiness.profileFieldsConfigured} />
      </StatGrid>

      <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
        These counts are the entire honest answer to &ldquo;are we ready for ranking/recommendations
        yet?&rdquo; — right now, mostly not, because there isn&apos;t much real usage data yet. That&apos;s
        expected at this stage, not a problem to paper over with a fabricated insight.
      </p>
    </div>
  );
}
