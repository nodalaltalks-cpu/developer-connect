import Link from "next/link";
import { requireEmployee } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { LeadCard } from "@/components/admin/leads/lead-card";
import { MissedCard } from "@/components/leads/missed-card";
import { TeamCallButton } from "@/components/team/team-call-button";
import { MyLeadsTabs, MY_VIEW_LABELS } from "@/components/team/my-leads-tabs";
import { LeadSourceTabs, parseSourceFilter, sourceTypeOf } from "@/components/admin/leads/lead-source-tabs";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getMyWorkState, type MyWorkItem } from "@/lib/leads/follow-up-reads";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";
import { getMyLeadsPage, MY_LEAD_VIEWS, type MyLeadView } from "@/lib/leads/lead-reads";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";

export const metadata = {
  title: "My Leads | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

function parseView(value: string | string[] | undefined): MyLeadView {
  const raw = Array.isArray(value) ? value[0] : value;
  return (MY_LEAD_VIEWS as readonly string[]).includes(raw ?? "") && raw !== "missed" ? (raw as MyLeadView) : "all";
}

function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

const EMPTY_COPY: Record<MyLeadView, { title: string; description: string }> = {
  all: { title: "No leads assigned to you yet", description: "When the Founder assigns you a lead, it appears here." },
  new: { title: "No new leads", description: "Every lead assigned to you has been picked up." },
  follow_up_due: { title: "No follow-ups due", description: "Nothing of yours is overdue or due today." },
  hot: { title: "No hot leads", description: "Leads the Founder marks Hot appear here." },
  missed: { title: "Nothing overdue", description: "You have no missed follow-ups." },
};

function DueRow({ item }: { item: MyWorkItem }) {
  return (
    <li>
      <Link href={`/team/leads/${item.lead.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.lead.name ?? "Unnamed lead"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatEnumLabel(item.followUp.type)} · {formatDateTimeFull(item.followUp.scheduledAt)}
        </span>
      </Link>
    </li>
  );
}

export default async function TeamLeadsPage({ searchParams }: PageProps<"/team">) {
  // The owner id comes from the verified session — never from the URL or the browser.
  const { actor } = await requireEmployee();

  const params = await searchParams;
  const view = parseView(params.view);
  const page = parsePage(params.page);
  const source = parseSourceFilter(params.source);
  const now = new Date();
  const repos = createPostgresLeadRepositories();

  // "What do I need to do now?": loading this records any missed follow-ups and sends due-soon notifications (once each).
  const work = await getMyWorkState(repos, actor, now, createLeadNotifier(createPostgresNotificationRepository()));

  // Missed follow-ups come first, and while any exist the rest of the workspace is closed (enforced by the server reads).
  if (work.blocked) {
    return (
      <div>
        <SectionHeading title="My Leads" description="Resolve your overdue follow-ups first." />
        <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-3 text-sm font-medium text-red-800">
          {work.missed.length === 1 ? "1 follow-up is overdue." : `${work.missed.length} follow-ups are overdue.`} Your other leads are closed until you resolve{" "}
          {work.missed.length === 1 ? "it" : "them"}: complete it, reschedule it, cancel it with a reason, or return the lead.
        </p>
        <ul className="grid gap-3">
          {work.missed.map((item) => (
            <MissedCard key={item.followUp.id} item={item} href={`/team/leads/${item.lead.id}`} callSlot={<TeamCallButton compact leadId={item.lead.id} phoneE164={item.lead.phoneE164} />} />
          ))}
        </ul>
      </div>
    );
  }

  const result = await getMyLeadsPage(repos, actor, view, page, now, undefined, sourceTypeOf(source));
  const href = (nextPage: number) => `/team?view=${view}&page=${nextPage}${source === "all" ? "" : `&source=${source}`}`;

  return (
    <div>
      <SectionHeading title="My Leads" description="Leads assigned to you. Private — visible only to you and the Founder." />
      <p className="-mt-2 mb-2 sm:hidden">
        <Link href="/team/visits" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
          Site visits →
        </Link>
      </p>

      {(work.dueNow.length > 0 || work.dueToday.length > 0) && (
        <section aria-label="What to do now" className="mb-4 space-y-3">
          {work.dueNow.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground">Due now · {work.dueNow.length}</h2>
              <ul className="mt-2 grid gap-2">
                {work.dueNow.map((item) => (
                  <DueRow key={item.followUp.id} item={item} />
                ))}
              </ul>
            </div>
          )}
          {work.dueToday.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground">Later today · {work.dueToday.length}</h2>
              <ul className="mt-2 grid gap-2">
                {work.dueToday.map((item) => (
                  <DueRow key={item.followUp.id} item={item} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="mb-3">
        <LeadSourceTabs active={source} hrefFor={(filter) => `/team?view=${view}${filter === "all" ? "" : `&source=${filter}`}`} />
      </div>
      <MyLeadsTabs active={view} source={source} />

      <h2 className="mt-4 text-sm font-medium text-foreground">
        {MY_VIEW_LABELS[view]} · {result.total}
      </h2>

      {result.items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={EMPTY_COPY[view].title} description={EMPTY_COPY[view].description} />
        </div>
      ) : (
        <ul className="mt-3 grid gap-3">
          {result.items.map((item) => (
            <LeadCard key={item.lead.id} item={item} now={now} basePath="/team/leads" showOwner={false} callSlot={<TeamCallButton compact leadId={item.lead.id} phoneE164={item.lead.phoneE164} />} />
          ))}
        </ul>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {result.page > 1 ? (
            <Link href={href(result.page - 1)} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 hover:bg-muted">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link href={href(result.page + 1)} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 hover:bg-muted">
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
