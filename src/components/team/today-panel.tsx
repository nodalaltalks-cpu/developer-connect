import Link from "next/link";
import { StatusBadge, TemperatureBadge } from "@/components/admin/leads/lead-badges";
import { FollowUpQuickActions } from "@/components/team/follow-up-quick-actions";
import { TeamCallButton } from "@/components/team/team-call-button";
import { WhatsAppOpenLink } from "@/components/leads/whatsapp-open-link";
import { whatsappHref } from "@/lib/leads/contact-links";
import { formatBudget } from "@/lib/leads/format";
import type { MyToday } from "@/lib/leads/my-today";

/**
 * TODAY, first: seven real numbers and ONE next best action with the reason it is on top. Every tile opens the list it counts.
 * Nothing here is computed in the browser, and nothing is estimated: the numbers come from the employee's own records.
 */

const KIND_TITLE = {
  RESOLVE_MISSED: "Resolve this first",
  FOLLOW_UP_DUE: "Due now",
  SITE_VISIT: "Site visit",
  NEXT_CALL: "Next call",
  NEW_LEAD: "New lead",
  HOT_QUIET: "Hot lead gone quiet",
  FOLLOW_UP_TODAY: "Later today",
} as const;

const OPEN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Tile({ label, value, href, alert = false }: { label: string; value: number; href: string; alert?: boolean }) {
  return (
    <li>
      <Link href={href} className={`flex min-h-16 flex-col justify-center rounded-lg border px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${alert && value > 0 ? "border-red-200 bg-red-50" : "border-border"}`}>
        <span className={`text-xl font-semibold ${alert && value > 0 ? "text-red-700" : "text-foreground"}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </Link>
    </li>
  );
}

export function TodayPanel({ today }: { today: MyToday }) {
  const { tiles, next } = today;
  return (
    <section aria-label="Today" className="mb-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Today</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Calls remaining" value={tiles.callsRemaining} href="/team/queue" />
        <Tile label="Follow-ups due" value={tiles.followUpsDue} href="/team/follow-ups" />
        <Tile label="Missed" value={tiles.missed} href="/team/follow-ups?tab=missed" alert />
        <Tile label="New leads" value={tiles.newLeads} href="/team?view=new" />
        <Tile label="Hot leads" value={tiles.hotLeads} href="/team?view=hot" />
        <Tile label="Site visits today" value={tiles.siteVisitsToday} href="/team/visits" />
        <Tile label="Need a requirement" value={tiles.requirementsNeeded} href="/team" />
      </ul>

      {next ? (
        <article aria-label="Next best action" className="mt-4 rounded-xl border border-accent p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-hover">Next best action · {KIND_TITLE[next.kind]}</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{next.lead.name ?? "Unnamed lead"}</p>
            <TemperatureBadge temperature={next.lead.temperature} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={next.lead.status} />
            {next.lead.location && <span className="text-xs text-muted-foreground">{next.lead.location}</span>}
            {formatBudget(next.lead.budgetMin, next.lead.budgetMax, next.lead.budgetCurrency) && <span className="text-xs text-muted-foreground">{formatBudget(next.lead.budgetMin, next.lead.budgetMax, next.lead.budgetCurrency)}</span>}
          </div>
          <p className="mt-2 text-sm text-foreground">{next.reason}</p>
          <div className="mt-3">
            <TeamCallButton key={next.lead.id} leadId={next.lead.id} phoneE164={next.lead.phoneE164} batchId={next.batchId ?? null} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {whatsappHref(next.lead.phoneE164) ? <WhatsAppOpenLink href={whatsappHref(next.lead.phoneE164)!} leadId={next.lead.id} scope="team" className={OPEN} /> : <span />}
            <Link href={`/team/leads/${next.lead.id}`} className={OPEN}>
              View lead
            </Link>
          </div>
          {next.followUpId && <FollowUpQuickActions leadId={next.lead.id} followUpId={next.followUpId} whatsappHref={null} />}
        </article>
      ) : (
        <p role="status" className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
          Nothing is waiting for you right now. New leads and follow-ups appear here the moment they arrive.
        </p>
      )}
    </section>
  );
}
