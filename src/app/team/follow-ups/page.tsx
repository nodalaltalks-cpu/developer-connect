import { LiveRefresh } from "@/components/live-refresh";
import Link from "next/link";
import { requireTab } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { StatusBadge, TemperatureBadge } from "@/components/admin/leads/lead-badges";
import { FollowUpQuickActions } from "@/components/team/follow-up-quick-actions";
import { TeamCallButton } from "@/components/team/team-call-button";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { whatsappHref } from "@/lib/leads/contact-links";
import { formatDateTimeWithDay, formatDuration, formatEnumLabel, formatOverdue } from "@/lib/leads/format";
import { getMyFollowUpBoard, parseFollowUpTab, type FollowUpTab } from "@/lib/leads/follow-up-board";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";

export const metadata = {
  title: "Follow-ups | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

// A follow-up that slipped today and one from an earlier day are one thing to the person doing the work: a missed lead. One list, one name.
const LABEL: Record<FollowUpTab, string> = { today: "Today", overdue: "Missed leads", upcoming: "Upcoming", missed: "Missed leads" };
const SHOWN_TABS: readonly FollowUpTab[] = ["today", "upcoming", "missed"];
const HELP: Record<FollowUpTab, string> = {
  today: "Due for the rest of today, including calls due right now.",
  overdue: "The follow-up time has passed and it is not resolved yet.",
  upcoming: "Scheduled after today, in the next two weeks.",
  missed: "The follow-up time has passed. Resolve these first: until you do, other leads are closed.",
};
const EMPTY: Record<FollowUpTab, { title: string; description: string }> = {
  today: { title: "Nothing left for today", description: "No follow-ups are waiting for the rest of today." },
  overdue: { title: "No missed leads", description: "You have no missed leads. Your leads are open." },
  upcoming: { title: "Nothing coming up", description: "No follow-ups are scheduled in the next two weeks." },
  missed: { title: "No missed leads", description: "You have no missed leads. Your leads are open." },
};

export default async function TeamFollowUpsPage({ searchParams }: PageProps<"/team/follow-ups">) {
  // The scope (my own) comes from the verified session, never from the URL.
  const { actor, member } = await requireTab("follow-ups");
  const params = await searchParams;
  // The old "overdue" address opens the same single list.
  const tab: FollowUpTab = parseFollowUpTab(params.tab) === "overdue" ? "missed" : parseFollowUpTab(params.tab);
  const now = new Date();
  const repos = createPostgresLeadRepositories();
  const notifier = createLeadNotifier(createPostgresNotificationRepository());
  const board = await getMyFollowUpBoard(repos, actor, tab, now, notifier);
  // The missed list is both kinds together (an earlier day first, then what slipped today).
  if (tab === "missed") {
    const slipped = await getMyFollowUpBoard(repos, actor, "overdue", now, notifier);
    board.items = [...board.items, ...slipped.items];
  }
  const unresolved = board.counts.overdue + board.counts.missed;
  board.counts.missed = unresolved;

  return (
    <div>
      <LiveRefresh />
      <SectionHeading title="Follow-ups" description="What to do, in time order. One tap to call, WhatsApp, finish or move it." />

      {unresolved > 0 && tab !== "missed" && (
        <p role="status" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {unresolved} missed {unresolved === 1 ? "lead needs" : "leads need"} resolving.{" "}
          <Link href="/team/follow-ups?tab=missed" className="underline">
            Open missed leads
          </Link>
        </p>
      )}

      <nav aria-label="Follow-up lists">
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {SHOWN_TABS.map((t) => (
            <li key={t} className="shrink-0">
              <Link
                href={t === "today" ? "/team/follow-ups" : `/team/follow-ups?tab=${t}`}
                aria-current={t === tab ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${t === tab ? "border-accent bg-accent-soft font-medium text-accent-hover" : "border-border text-foreground hover:bg-muted"}`}
              >
                {LABEL[t]}
                <span className={`rounded-full px-2 py-0.5 text-xs ${t === "missed" && board.counts[t] > 0 ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"}`}>{board.counts[t]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mb-3 text-xs text-muted-foreground">{HELP[tab]}</p>

      {board.items.length === 0 ? (
        <EmptyState title={EMPTY[tab].title} description={EMPTY[tab].description} />
      ) : (
        <ul className="grid gap-3">
          {board.items.map(({ followUp, lead }) => {
            const late = followUp.scheduledAt.getTime() < now.getTime();
            return (
              <li key={followUp.id} className={`rounded-lg border p-4 ${late ? "border-red-200" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/team/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-base font-semibold text-foreground hover:underline">
                    {lead.name ?? "Unnamed lead"}
                  </Link>
                  <TemperatureBadge temperature={lead.temperature} />
                </div>
                <p className="mt-1 text-sm text-foreground">
                  {formatEnumLabel(followUp.type)} · {formatDateTimeWithDay(followUp.scheduledAt)}
                </p>
                {late && <p className="text-sm font-medium text-red-700">Late by {formatOverdue(now.getTime() - followUp.scheduledAt.getTime())}</p>}
                {followUp.note && <p className="mt-1 text-sm text-muted-foreground">{followUp.note}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={lead.status} />
                  <span className="text-xs text-muted-foreground">Owner: {member.employeeId} · {member.displayName}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Last activity {formatDuration(now.getTime() - lead.lastActivityAt.getTime())} ago</p>
                <div className="mt-3">
                  <TeamCallButton compact leadId={lead.id} phoneE164={lead.phoneE164} />
                </div>
                <FollowUpQuickActions leadId={lead.id} followUpId={followUp.id} whatsappHref={whatsappHref(lead.phoneE164)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
