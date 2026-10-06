import type { ReactNode } from "react";
import Link from "next/link";
import { StatusBadge, TemperatureBadge } from "@/components/admin/leads/lead-badges";
import { telHref } from "@/lib/leads/contact-links";
import { formatDateTimeFull, formatEnumLabel, formatOverdue } from "@/lib/leads/format";
import type { MissedFollowUpItem, ReturnedLeadItem } from "@/lib/leads/follow-up-reads";

/**
 * One missed follow-up, or one returned lead, as a card. Pure and server-rendered. Shared by the team member's
 * "Missed follow-ups" and the Founder's "Missed leads" / "Returned leads" — the same facts, the same words.
 */

const CALL =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const OPEN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function lastContactLine(summary: { lastContactAt: Date | null; contactAttempts: number } | null): string {
  if (!summary || !summary.lastContactAt) return "No contact attempt yet";
  return `Last contact ${formatDateTimeFull(summary.lastContactAt)} · ${summary.contactAttempts} ${summary.contactAttempts === 1 ? "attempt" : "attempts"}`;
}

export function MissedCard({ item, href, ownerName, callSlot }: { item: MissedFollowUpItem; href: string; ownerName?: string; callSlot?: ReactNode }) {
  const { followUp, lead } = item;
  const tel = telHref(lead.phoneE164);
  return (
    <li className="rounded-lg border border-red-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Missed follow-up</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{lead.name ?? "Unnamed lead"}</p>
        <TemperatureBadge temperature={lead.temperature} />
      </div>
      <p className="mt-1 text-sm text-foreground">
        {formatEnumLabel(followUp.type)} · {formatDateTimeFull(followUp.scheduledAt)}
      </p>
      <p className="text-sm font-medium text-red-700">Missed by {formatOverdue(item.overdueMs)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <StatusBadge status={lead.status} />
        {ownerName && <span className="text-xs text-muted-foreground">Employee: {ownerName}</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{lastContactLine(item.summary)}</p>
      {item.requirement && <p className="mt-1 text-sm text-muted-foreground">{item.requirement}</p>}
      {item.developerName && <p className="mt-1 text-xs text-muted-foreground">{item.developerName}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {callSlot ? callSlot : tel ? (
          <a href={tel} className={CALL}>
            Call
          </a>
        ) : (
          <span />
        )}
        <Link href={href} className={OPEN}>
          Resolve
        </Link>
      </div>
    </li>
  );
}

export function ReturnedCard({ item, href, returnedByName, callSlot }: { item: ReturnedLeadItem; href: string; returnedByName?: string; callSlot?: ReactNode }) {
  const { lead } = item;
  const tel = telHref(lead.phoneE164);
  return (
    <li className="rounded-lg border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Returned lead</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{lead.name ?? "Unnamed lead"}</p>
        <TemperatureBadge temperature={lead.temperature} />
      </div>
      <p className="mt-1 text-sm text-foreground">
        Returned by {returnedByName ?? "a team member"} · {formatDateTimeFull(item.returnedAt)}
      </p>
      <p className="text-sm font-medium text-foreground">Reason: {item.reason ? formatEnumLabel(item.reason) : "Not recorded"}</p>
      {item.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.note}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <StatusBadge status={lead.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.lastContactAt ? `Last contact ${formatDateTimeFull(item.lastContactAt)} · ${item.contactAttempts} ${item.contactAttempts === 1 ? "attempt" : "attempts"}` : "No contact attempt recorded"}
      </p>
      {item.lastFollowUp && (
        <p className="text-sm text-muted-foreground">
          Last follow-up: {formatEnumLabel(item.lastFollowUp.type)} · {formatDateTimeFull(item.lastFollowUp.scheduledAt)} · {formatEnumLabel(item.lastFollowUp.status)}
        </p>
      )}
      {item.requirement && <p className="mt-1 text-sm text-muted-foreground">{item.requirement}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {callSlot ? callSlot : tel ? (
          <a href={tel} className={CALL}>
            Call
          </a>
        ) : (
          <span />
        )}
        <Link href={href} className={OPEN}>
          Open &amp; reassign
        </Link>
      </div>
    </li>
  );
}
