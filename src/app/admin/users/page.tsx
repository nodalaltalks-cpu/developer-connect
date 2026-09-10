import { getUserAndProfileIntelligence } from "@/lib/admin-analytics/queries";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading } from "@/components/admin/empty-state";

export default async function AdminUsersPage() {
  const intel = await getUserAndProfileIntelligence();

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
        </StatGrid>
      </div>

      <h2 className="mt-8 text-base font-semibold text-foreground">Profile completion</h2>
      <div className="mt-3">
        <StatGrid>
          <StatTile label="Profiles started" value={intel.profilesStarted} />
          <StatTile label="Fields configured" value={intel.profileFieldsConfigured} />
          <StatTile
            label="Average completion"
            value={intel.averageCompletionPercent === null ? "N/A" : `${intel.averageCompletionPercent}%`}
          />
        </StatGrid>
      </div>

      {intel.profileFieldsConfigured === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Completion tracking will activate the moment product defines the first profile field
          (see PROFILE_FIELD_CONFIG) — everything downstream (this page, the profile page, the
          analytics events) already reads that single source of truth, so no further work is
          needed here when that happens.
        </p>
      )}
    </div>
  );
}
