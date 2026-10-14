import { SectionBar } from "@/components/leads/section-bar";
import type { ReactNode } from "react";
import { ExternalDomainLink } from "@/components/external-domain-link";
import { formatBudget, formatDateTime, formatDateTimeWithDay, formatEnumLabel, formatMoney } from "@/lib/leads/format";
import { describeTimeline } from "@/lib/leads/timeline";
import type { Booking, Lead, LeadConsent, LeadEvent, MarketingTouch } from "@/lib/leads/types";

/** Read-only sections of the lead detail screen. Pure and server-rendered; every value is escaped by React, nothing is injected as HTML. */

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <SectionBar title={title} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: Array<[string, ReactNode]> }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RequirementCard({ lead }: { lead: Lead }) {
  return (
    <Card title="Requirement">
      <Rows
        rows={[
          ["Location", lead.location],
          ["Budget", formatBudget(lead.budgetMin, lead.budgetMax, lead.budgetCurrency)?.replace(/ budget$/, "") ?? null],
          ["Configuration", lead.configuration],
          ["Property type", lead.propertyType],
          ["Purpose", lead.purpose ? formatEnumLabel(lead.purpose) : null],
          ["Buying timeline", lead.timeline ? formatEnumLabel(lead.timeline) : null],
        ]}
      />
    </Card>
  );
}

export function InterestCard({
  developerName,
  developersViewed,
  developerWebsite,
}: {
  developerName: string | null;
  developersViewed: string[];
  /** The developer's verified website. Founder-only: it is internal data and is never shown to buyers. */
  developerWebsite?: { url: string; domain: string } | null;
}) {
  return (
    <Card title="Developer interest">
      <Rows
        rows={[
          ["Asked about", developerName],
          ["All requests", developersViewed.length ? developersViewed.join(", ") : null],
          [
            "Verified website",
            developerWebsite ? <ExternalDomainLink key="site" url={developerWebsite.url} domain={developerWebsite.domain} /> : null,
          ],
        ]}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        The website is internal: buyers are never sent to it. Share it with a buyer yourself when it is the right next step.
      </p>
    </Card>
  );
}

function TouchRows({ touch }: { touch: MarketingTouch | null }) {
  if (!touch) return <p className="text-sm text-muted-foreground">Not recorded.</p>;
  return (
    <Rows
      rows={[
        ["When", formatDateTime(touch.occurredAt)],
        ["Source", touch.utmSource],
        ["Medium", touch.utmMedium],
        ["Campaign", touch.utmCampaign],
        ["Referrer", touch.referrer],
        ["Landing page", touch.landingPath],
        ["Google click ID", touch.gclid],
        ["Facebook click ID", touch.fbclid],
      ]}
    />
  );
}

/** First and latest touch are separate rows and are never merged: the first is how they originally found us, and is never overwritten. */
export function AttributionCard({ firstTouch, lastTouch, sourceCta }: { firstTouch: MarketingTouch | null; lastTouch: MarketingTouch | null; sourceCta: string | null }) {
  const same = firstTouch !== null && lastTouch !== null && firstTouch.id === lastTouch.id;
  return (
    <Card title="Source & attribution">
      <Rows rows={[["Captured from", sourceCta ? formatEnumLabel(sourceCta) : null]]} />
      <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">First touch</h3>
      <div className="mt-1">
        <TouchRows touch={firstTouch} />
      </div>
      <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest touch</h3>
      <div className="mt-1">{same ? <p className="text-sm text-muted-foreground">Same as the first touch.</p> : <TouchRows touch={lastTouch} />}</div>
    </Card>
  );
}

export function ConsentCard({ consents }: { consents: LeadConsent[] }) {
  return (
    <Card title="Consent">
      {consents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No consent on record.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {consents.map((consent) => (
            <li key={consent.id}>
              <span className="text-foreground">
                {formatEnumLabel(consent.channel)} — given {formatDateTime(consent.givenAt)}
              </span>
              <span className="block text-xs text-muted-foreground">
                Wording version {consent.textVersion}
                {consent.withdrawnAt ? ` · withdrawn ${formatDateTime(consent.withdrawnAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function BookingsCard({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) return null;
  return (
    <Card title="Bookings">
      <ul className="space-y-2 text-sm">
        {bookings.map((booking) => (
          <li key={booking.id}>
            {booking.projectName ?? "Booking"} — {formatMoney(booking.bookingValue, booking.currency)} · {formatEnumLabel(booking.status)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AuditCard({ lead, ownerName }: { lead: Lead; ownerName?: string }) {
  return (
    <Card title="Record">
      <Rows
        rows={[
          ["Created", formatDateTime(lead.createdAt)],
          ["Last activity", formatDateTime(lead.lastActivityAt)],
          ["Owner", lead.ownerId ? (ownerName ?? "Team member") : "Founder (unassigned)"],
          ["Erased", lead.erasedAt ? formatDateTime(lead.erasedAt) : null],
        ]}
      />
      <p className="mt-2 text-xs text-muted-foreground">History is append-only: changes are added, never edited or deleted.</p>
    </Card>
  );
}

/** What the trail leaves out: system bookkeeping that says nothing a person did or decided. The full log keeps all of it. */
const TRAIL_HIDDEN = new Set<LeadEvent["eventType"]>([
  "CONSENT_GIVEN",
  "CONTACT_PREFERENCE_SELECTED",
  "OFFICIAL_WEBSITE_CLICKED",
  "DEVELOPER_WEBSITE_REDIRECTED",
  "WHATSAPP_OPENED",
  "CALL_PLACED",
  "CONTACT_DETAILS_UPDATED",
]);

/** Changes by one person within this long of each other are ONE save: a lead is recorded once, not field by field. */
const SAVE_WINDOW_MS = 3 * 60_000;

interface TrailEntry {
  key: string;
  at: Date;
  by: string;
  comment: string | null;
  changes: string[];
}

/**
 * THE history of a lead, one entry per save. Everything one person did within a few minutes (their comment, the requirement, the
 * projects, the lead status) reads as ONE entry with the comment on top and the changes beneath, newest first, with the day, date, time
 * and year. System bookkeeping is left out; the complete append-only log is on the Founder's details page. It is folded away until it
 * is tapped, so it never lengthens the screen a lead is made or updated on.
 */
export function TrailCard({ events, names, projectNames, defaultOpen = false }: { events: LeadEvent[]; names?: Record<string, string>; projectNames?: Record<string, string>; defaultOpen?: boolean }) {
  const visible = events.filter((event) => !TRAIL_HIDDEN.has(event.eventType));
  const lines = describeTimeline(visible, names, projectNames);
  const byId = new Map(visible.map((event) => [event.id, event]));
  const entries: TrailEntry[] = [];
  let last: { actor: string; at: number; entry: TrailEntry } | null = null;
  for (const line of lines) {
    const event = byId.get(line.id)!;
    const actor = `${event.actorType}:${event.actorId ?? ""}`;
    const at = line.at.getTime();
    const sameSave = last !== null && last.actor === actor && Math.abs(at - last.at) <= SAVE_WINDOW_MS && event.actorType !== "BUYER" && event.actorType !== "SYSTEM";
    const entry: TrailEntry = sameSave ? last!.entry : { key: line.id, at: line.at, by: line.by, comment: null, changes: [] };
    if (event.eventType === "NOTE_ADDED") entry.comment = entry.comment ? `${entry.comment}\n${line.detail ?? ""}` : (line.detail ?? "");
    else entry.changes.push(line.detail ? `${line.headline}: ${line.detail}` : line.headline);
    if (!sameSave) entries.push(entry);
    last = { actor, at, entry };
  }
  entries.reverse();
  return (
    <section className="rounded-lg border border-border p-4">
      <details open={defaultOpen}>
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold text-foreground">
          History <span className="font-normal text-muted-foreground">({entries.length}) · India time</span>
        </summary>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ol className="mt-3 space-y-4">
            {entries.map((entry) => (
              <li key={entry.key} className="border-l-2 border-border pl-3">
                <p className="text-xs font-medium text-muted-foreground">{formatDateTimeWithDay(entry.at)}</p>
                {entry.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-foreground">&ldquo;{entry.comment}&rdquo;</p>}
                {entry.changes.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground marker:text-muted-foreground">
                    {entry.changes.map((change, i) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-muted-foreground">by {entry.by}</p>
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}

/** Chronological, oldest first: the single source of truth for who did what, and when (India time). */
export function TimelineCard({ events, names }: { events: LeadEvent[]; names?: Record<string, string> }) {
  const lines = describeTimeline(events, names);
  return (
    <Card title="Activity">
      <ol className="space-y-3">
        {lines.map((line) => (
          <li key={line.id} className="border-l-2 border-border pl-3">
            <p className="text-sm text-foreground">{line.headline}</p>
            {line.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{line.detail}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {line.by} · {formatDateTimeWithDay(line.at)}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
