import Link from "next/link";
import { requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { getDb } from "@/lib/developer-connect/db/client";
import { RANGE_PRESETS, parseInsightFilters } from "@/lib/leads/call-analytics";
import { getRetentionReport, share } from "@/lib/retention/report";

export const metadata = { title: "Retention | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGE_LABEL: Record<(typeof RANGE_PRESETS)[number], string> = { today: "Today", yesterday: "Yesterday", last7: "Last 7 days", last30: "Last 30 days", custom: "Custom" };

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className="rounded-lg border border-border px-3 py-3">
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </li>
  );
}

const pct = (part: number, whole: number) => {
  const value = share(part, whole);
  return value === null ? "n/a" : `${value}%`;
};

export default async function RetentionPage({ searchParams }: PageProps<"/admin/retention">) {
  await requireFounder();
  const params = await searchParams;
  const { range } = parseInsightFilters({ range: first(params.range) ?? "last30", from: first(params.from), to: first(params.to) }, new Date());
  const r = await getRetentionReport(getDb(), range);
  const advisorTotal = r.reachedAdvisor.returning + r.reachedAdvisor.firstVisit;

  return (
    <div>
      <SectionHeading title={`Retention — ${range.label}`} description="Counted from real visits, enquiries and profiles. A measure that is not collected yet says so instead of showing a zero." />

      <nav aria-label="Range" className="mb-5 flex flex-wrap gap-2">
        {RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
          <Link key={p} href={`/admin/retention?range=${p}`} aria-current={range.label === RANGE_LABEL[p] ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium">
            {RANGE_LABEL[p]}
          </Link>
        ))}
      </nav>

      <h2 className="text-sm font-semibold text-foreground">Visitors</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Visitors" value={String(r.visitors)} note="Browsers that opened a public page" />
        <Tile label="Returning visitors" value={String(r.returningVisitors)} note={`${pct(r.returningVisitors, r.visitors)} of visitors`} />
        <Tile label="Repeat researchers" value={String(r.repeatResearchers)} note="Looked at developer pages on 2+ days" />
        <Tile label="Repeat enquiries" value={String(r.repeatEnquiries)} note="Leads that asked to connect more than once" />
      </ul>

      <h2 className="mt-6 text-sm font-semibold text-foreground">Conversion after a return visit</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Reached an advisor: returning" value={String(r.reachedAdvisor.returning)} note={`${pct(r.reachedAdvisor.returning, r.returningVisitors)} of returning visitors`} />
        <Tile label="Reached an advisor: first visit" value={String(r.reachedAdvisor.firstVisit)} note={`${pct(r.reachedAdvisor.firstVisit, r.visitors - r.returningVisitors)} of first-time visitors`} />
        <Tile label="Sent a request: returning" value={String(r.submittedRequest.returning)} />
        <Tile label="Sent a request: first visit" value={String(r.submittedRequest.firstVisit)} />
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">&ldquo;Reached an advisor&rdquo; means pressing WhatsApp, Email or Call. Opening the choices alone does not count. Small numbers are small numbers: read a percentage only when its base is large.</p>

      <h2 className="mt-6 text-sm font-semibold text-foreground">Advisor channels</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Opened Talk to an Advisor" value={String(r.advisorChannels.opened)} />
        <Tile label="WhatsApp" value={String(r.advisorChannels.whatsapp)} />
        <Tile label="Email" value={String(r.advisorChannels.email)} />
        <Tile label="Call" value={String(r.advisorChannels.call)} />
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{advisorTotal} visitor{advisorTotal === 1 ? "" : "s"} reached an advisor. These are taps, not conversations: whether a chat followed is only known from your own phone.</p>

      <h2 className="mt-6 text-sm font-semibold text-foreground">Profiles</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Profiles" value={String(r.profiles.total)} />
        <Tile label="Complete" value={String(r.profiles.complete)} note={`${pct(r.profiles.complete, r.profiles.total)}`} />
        <Tile label="Started" value={String(r.profiles.started)} />
        <Tile label="Nothing filled in" value={String(r.profiles.empty)} />
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Open a person from <Link href="/admin/users" className="text-accent-hover underline">Users</Link> to see what their profile is missing.</p>

      <h2 className="mt-6 text-sm font-semibold text-foreground">Not tracked yet</h2>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li>Saved projects and saved developers: the feature does not exist yet, so there is nothing to count.</li>
        <li>Re-engagement messages sent: none are sent automatically yet.</li>
      </ul>
    </div>
  );
}
