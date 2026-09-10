import {
  getDeveloperIntelligence,
  getHighPriorityVerificationOpportunities,
} from "@/lib/admin-analytics/queries";
import { SectionHeading } from "@/components/admin/empty-state";
import { DeveloperManagementTable } from "@/components/admin/developer-management-table";

export default async function AdminDevelopersPage() {
  const [developers, opportunities] = await Promise.all([
    getDeveloperIntelligence(),
    getHighPriorityVerificationOpportunities(),
  ]);

  const needsAttentionIds = new Set(
    opportunities
      .filter((opportunity) => opportunity.status === "INDEXED_UNVERIFIED" && opportunity.developer)
      .map((opportunity) => opportunity.developer!.id),
  );

  return (
    <div>
      <SectionHeading
        title="Developer Management"
        description="Every developer in the directory, with real search/page-view/click stats and current verification status. Rows marked “Needs attention” have real, unmet search demand and no verified site — see Search Intelligence for the underlying queries."
      />
      <DeveloperManagementTable developers={developers} needsAttentionIds={needsAttentionIds} />
    </div>
  );
}
