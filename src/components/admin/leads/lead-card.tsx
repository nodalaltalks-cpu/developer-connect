import type { ReactNode } from "react";
import Link from "next/link";
import { telHref, whatsappHref } from "@/lib/leads/contact-links";
import { formatBudget, formatDateTime, formatDuration, formatEnumLabel } from "@/lib/leads/format";
import type { LeadListItem } from "@/lib/leads/lead-reads";
import { leadSourceLabel } from "@/lib/leads/lead-source";
import { StatusBadge, TemperatureBadge } from "./lead-badges";

const ACTION =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ACTION_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The one line that answers "what do I do with this lead?" */
export function nextActionLine(item: LeadListItem): { text: string; tone: "alert" | "soon" | "plain" } {
  const { lead, followUp, attention } = item;
  if (followUp === "OVERDUE" && lead.nextFollowUpAt) return { text: `Follow-up overdue — was due ${formatDateTime(lead.nextFollowUpAt)}`, tone: "alert" };
  if (followUp === "TODAY" && lead.nextFollowUpAt) return { text: `Follow-up today at ${formatDateTime(lead.nextFollowUpAt)}`, tone: "soon" };
  if (attention) return { text: attention.summary, tone: "soon" };
  if (followUp === "UPCOMING" && lead.nextFollowUpAt) return { text: `Follow-up ${formatDateTime(lead.nextFollowUpAt)}`, tone: "plain" };
  return { text: "No follow-up set", tone: "plain" };
}

const TONE_CLASS = { alert: "text-red-700", soon: "text-amber-700", plain: "text-muted-foreground" } as const;

/**
 * One lead, mobile first: name, temperature, status and the next action up
 * top; Call and WhatsApp as large buttons underneath. The whole top block is
 * one link to the lead's page; the buttons are separate so a tap on Call can
 * never open the lead by accident. Pure — `now` is passed in.
 */
export function LeadCard({
  item,
  now,
  ownerName,
  basePath = "/admin/leads",
  showOwner = true,
  callSlot,
}: {
  item: LeadListItem;
  now: Date;
  ownerName?: string;
  /** Where the card links to: the Founder's CRM by default, /team/leads for a team member's own workspace. */
  basePath?: string;
  showOwner?: boolean;
  /** The tracked Call control; replaces the plain Call link when given. */
  callSlot?: ReactNode;
}) {
  const { lead, developerName, summary } = item;
  const next = nextActionLine(item);
  const tel = telHref(lead.phoneE164);
  const wa = whatsappHref(lead.phoneE164);
  const prefersWhatsApp = lead.contactPreference === "WHATSAPP";
  const budget = formatBudget(lead.budgetMin, lead.budgetMax, lead.budgetCurrency);
  const lastActivity = formatDuration(now.getTime() - lead.lastActivityAt.getTime());

  const details = [developerName, lead.location, budget, lead.sourceCta ? formatEnumLabel(lead.sourceCta) : null].filter(Boolean);

  return (
    <li className="rounded-lg border border-border p-4">
      <Link
        href={`${basePath}/${lead.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{lead.name ?? "Unnamed lead"}</p>
          <TemperatureBadge temperature={lead.temperature} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={lead.status} />
          {showOwner && (
            <span className="text-xs text-muted-foreground">Owner: {lead.ownerId ? (ownerName ?? "Team member") : "Founder"}</span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{leadSourceLabel(lead)}</p>
        <p className={`mt-1.5 text-sm font-medium ${TONE_CLASS[next.tone]}`}>{next.text}</p>
        {details.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{details.join(" · ")}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Last activity {lastActivity} ago
          {summary && summary.contactAttempts > 0 ? ` · ${summary.contactAttempts} contact ${summary.contactAttempts === 1 ? "attempt" : "attempts"}` : ""}
        </p>
      </Link>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={prefersWhatsApp ? ACTION_PRIMARY : ACTION}>
            WhatsApp
          </a>
        ) : null}
        {callSlot ? callSlot : tel ? (
          <a href={tel} className={prefersWhatsApp ? ACTION : ACTION_PRIMARY}>
            Call
          </a>
        ) : null}
      </div>
    </li>
  );
}
