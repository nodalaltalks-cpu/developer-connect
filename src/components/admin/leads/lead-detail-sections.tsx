import type { ReactNode } from "react";
import { ExternalDomainLink } from "@/components/external-domain-link";
import { formatBudget, formatDateTime, formatDateTimeFull, formatDateTimeWithDay, formatEnumLabel, formatMoney } from "@/lib/leads/format";
import { describeTimeline } from "@/lib/leads/timeline";
import type { Booking, Lead, LeadConsent, LeadEvent, MarketingTouch } from "@/lib/leads/types";

/** Read-only sections of the lead detail screen. Pure and server-rendered; every value is escaped by React, nothing is injected as HTML. */

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
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
        The website is internal: buyers are never sent to it. Share it with a buyer yourself when it is the right next step. Projects are
        not captured yet — only developers.
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
