import Link from "next/link";
import {
  getDeveloperIntelligence,
  getHighPriorityVerificationOpportunities,
} from "@/lib/admin-analytics/queries";
import { SectionHeading } from "@/components/admin/empty-state";
import { DeveloperManagementTable } from "@/components/admin/developer-management-table";
import { buttonClassName } from "@/components/ui/button";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminDevelopersPage({
  searchParams,
}: PageProps<"/admin/developers">) {
  const resolvedSearchParams = await searchParams;
  const search = firstParam(resolvedSearchParams.q);
  const status = firstParam(resolvedSearchParams.status);
  const pageParam = Number(firstParam(resolvedSearchParams.page));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const [{ developers, totalCount, pageSize }, opportunities] = await Promise.all([
    getDeveloperIntelligence({ search, status, page }),
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
      <DeveloperManagementTable
        developers={developers}
        needsAttentionIds={needsAttentionIds}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        initialSearch={search ?? ""}
        initialStatus={status ?? "ALL"}
      />
    </div>
  );
}
