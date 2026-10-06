import Link from "next/link";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { FounderCallButton } from "@/components/admin/leads/founder-call-button";
import { LeadCard } from "@/components/admin/leads/lead-card";
import { LeadsViewTabs, VIEW_LABELS } from "@/components/admin/leads/leads-view-tabs";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";
import { getAttentionItems, getLeadCounts, getLeadsPage, type LeadListItem } from "@/lib/leads/lead-reads";
import { LEAD_VIEWS, type LeadView } from "@/lib/leads/lead-views";

export const metadata = {
  title: "Leads | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

function parseView(value: string | string[] | undefined): LeadView {
  const raw = Array.isArray(value) ? value[0] : value;
  return (LEAD_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as LeadView) : "attention";
}

function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

const EMPTY_COPY: Record<LeadView, { title: string; description: string }> = {
  attention: { title: "Nothing needs you right now", description: "No overdue follow-ups, new leads or returning buyers waiting. New leads appear here the moment they arrive." },
  all: { title: "No leads yet", description: "Leads appear here when a visitor shares their details to open a developer's official website." },
  new: { title: "No new leads", description: "Every lead has been picked up." },
  hot: { title: "No hot leads", description: "Mark a lead Hot from its page when the buyer is ready to move." },
  warm: { title: "No warm leads", description: "Leads you mark Warm appear here." },
  cold: { title: "No cold leads", description: "Leads you mark Cold appear here." },
  overdue: { title: "No overdue follow-ups", description: "Nothing is past its follow-up time." },
  due_today: { title: "No follow-ups due today", description: "Nothing is scheduled for the rest of today." },
  qualified: { title: "No qualified leads", description: "Leads you move to Qualified appear here." },
};

export default async function AdminLeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  // The layout also gates /admin, but a layout is not re-run on every client
  // navigation — this page reads private lead data, so it checks for itself.
  await requireFounder();

  const params = await searchParams;
  const view = parseView(params.view);
  const page = parsePage(params.page);
  const repos = createPostgresLeadRepositories();
  const now = new Date();

  const owners = staffNameMap(await createPostgresStaffRepository().list());
  const counts = await getLeadCounts(repos, now);
  let items: LeadListItem[];
  let pagination: { page: number; pageCount: number; total: number } | null = null;
  if (view === "attention") {
    items = await getAttentionItems(repos, now);
  } else {
    const result = await getLeadsPage(repos, view, page, now);
    items = result.items;
    pagination = { page: result.page, pageCount: result.pageCount, total: result.total };
  }

  const href = (nextPage: number) => `/admin/leads?view=${view}&page=${nextPage}`;

  return (
    <div>
      <SectionHeading title="Leads" description="Buyers who asked to be helped. Private — visible only to you." />

      <StatGrid>
        <StatTile label="Total leads" value={counts.total} />
        <StatTile label="New" value={counts.new} />
        <StatTile label="Hot" value={counts.hot} />
        <StatTile label="Warm" value={counts.warm} />
        <StatTile label="Cold" value={counts.cold} />
        <StatTile label="Overdue follow-ups" value={counts.overdue} />
        <StatTile label="Due today" value={counts.dueToday} />
        <StatTile label="Qualified" value={counts.qualified} />
        <StatTile label="Site visits scheduled" value={counts.siteVisitScheduled} />
        <StatTile label="Booked" value={counts.booked} />
      </StatGrid>
      <p className="mt-2 text-xs text-muted-foreground">
        Counts only — no conversion rates until there are enough leads to mean something. Hot, warm, cold and follow-up counts exclude closed-out leads.
      </p>

      <div className="mt-6">
        <LeadsViewTabs active={view} />
      </div>

      <h2 className="mt-4 text-sm font-medium text-foreground">
        {VIEW_LABELS[view]}
        {pagination ? ` · ${pagination.total}` : items.length ? ` · ${items.length}` : ""}
      </h2>

      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={EMPTY_COPY[view].title} description={EMPTY_COPY[view].description} />
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <LeadCard key={item.lead.id} item={item} now={now} ownerName={item.lead.ownerId ? owners[item.lead.ownerId] : undefined} callSlot={<FounderCallButton compact leadId={item.lead.id} phoneE164={item.lead.phoneE164} />} />
          ))}
        </ul>
      )}

      {pagination && pagination.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {pagination.page > 1 ? (
            <Link href={href(pagination.page - 1)} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 hover:bg-muted">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.pageCount}
          </span>
          {pagination.page < pagination.pageCount ? (
            <Link href={href(pagination.page + 1)} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 hover:bg-muted">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
