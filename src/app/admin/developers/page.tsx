import Link from "next/link";
import {
  getDeveloperIntelligence,
  getHighPriorityVerificationOpportunities,
} from "@/lib/admin-analytics/queries";
import { SectionHeading } from "@/components/admin/empty-state";
import { DeveloperManagementTable } from "@/components/admin/developer-management-table";
import { buttonClassName } from "@/components/ui/button";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          title="Developer Management"
          description="Every developer in the directory, with real search/page-view/click stats and current verification status. Rows marked “Needs attention” have real, unmet search demand and no verified site — see Search Intelligence for the underlying queries."
        />
        <Link href="/admin/developers/new" className={buttonClassName("primary")}>
          Add developer
        </Link>
      </div>
      <DeveloperManagementTable developers={developers} needsAttentionIds={needsAttentionIds} />
    </div>
  );
}
