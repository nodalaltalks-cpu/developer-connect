import Link from "next/link";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { parseInsightFilters } from "@/lib/leads/call-analytics";
import { recommend } from "@/lib/social/insights";
import { socialSummary } from "@/lib/social/db/postgres-social";
import type { SocialSummary } from "@/lib/social/types";

export const metadata = { title: "Social analytics | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "all", label: "Since the start" },
] as const;
const CHIP = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm hover:bg-muted";
const SOURCE_LABEL: Record<string, string> = { ig: "Instagram", instagram: "Instagram", fb: "Facebook", facebook: "Facebook", links: "Links page", direct: "Direct / none" };
const FOUND_LABEL: Record<string, string> = { INSTAGRAM: "Instagram", YOUTUBE: "YouTube", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn", GOOGLE: "Google", FRIEND: "Friend or family", OTHER: "Somewhere else", UNKNOWN: "Not said" };
const sourceName = (s: string) => SOURCE_LABEL[s.toLowerCase()] ?? s;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[26rem] text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j > 0 ? "text-right" : "font-medium text-foreground"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const KIND_STYLE: Record<string, string> = { double_down: "border-green-600 bg-green-50", fix: "border-red-500 bg-red-50", timing: "border-amber-500 bg-amber-50", format: "border-blue-500 bg-blue-50", funnel: "border-purple-500 bg-purple-50", data: "border-border bg-muted" };

export default async function SocialAnalyticsPage({ searchParams }: PageProps<"/admin/social">) {
  const params = await searchParams;
  const range = parseInsightFilters({ range: first(params.range) ?? "last30" }, new Date()).range;
  const rangeKey = RANGES.find((r) => r.label === range.label)?.key ?? "last30";
  let summary: SocialSummary | null = null;
  try {
    summary = await socialSummary(range.from, range.to);
  } catch {
    summary = null;
  }

  return (
    <div>
      <SectionHeading title={`Social analytics — ${range.label}`} description="What visitors do with your videos, links and enquiry form, and what to make next. Everything is counted from real visits; nothing is estimated." />
      <nav aria-label="Date range" className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/admin/social?range=${r.key}`} aria-current={rangeKey === r.key ? "page" : undefined} className={`${CHIP} ${rangeKey === r.key ? "border-accent bg-accent-soft text-accent-hover" : "border-border text-foreground"}`}>
            {r.label}
          </Link>
        ))}
      </nav>
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link href="/admin/social/videos" className="inline-flex min-h-11 items-center font-semibold text-accent-hover hover:underline">Manage landing-page videos →</Link>
        <Link href="/admin/enquiries" className="inline-flex min-h-11 items-center font-semibold text-accent-hover hover:underline">Enquiry form submissions →</Link>
        <Link href="/admin/social/playbook" className="inline-flex min-h-11 items-center font-semibold text-accent-hover hover:underline">Growth playbook →</Link>
      </div>

      {!summary ? (
        <EmptyState title="Social analytics are not available yet" description="The database did not answer, or the latest database update has not been applied. Reload in a moment." />
      ) : (
        <>
          <section aria-label="Recommendations">
            <h2 className="text-lg font-semibold text-foreground">What to do next</h2>
            <ul className="mt-3 space-y-2">
              {recommend(summary).map((r) => (
                <li key={r.title} className={`rounded-lg border-l-4 px-4 py-3 ${KIND_STYLE[r.kind]}`}>
                  <p className="text-sm font-bold text-foreground">{r.title}</p>
                  <p className="mt-0.5 text-sm text-foreground/80">{r.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8" aria-label="From watching to enquiring">
            <h2 className="text-lg font-semibold text-foreground">From watching to enquiring</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Saw a video" value={summary.funnel.sawVideo} />
              <Tile label="Clicked through" value={summary.funnel.clicked} sub={`${pct(summary.funnel.clicked, summary.funnel.sawVideo)} of viewers`} />
              <Tile label="Started the form" value={summary.funnel.startedForm} />
              <Tile label="Sent an enquiry" value={summary.funnel.submittedForm} sub={`${pct(summary.funnel.submittedForm, summary.funnel.startedForm)} of starters`} />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-foreground">Which videos work</h2>
            {summary.videos.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No videos added yet. Add some under Manage landing-page videos.</p>
            ) : (
              <div className="mt-3">
                <Table head={["Video", "Viewers", "Plays", "Avg watch", "Clicks", "Click rate"]} rows={summary.videos.map((v) => [`${v.title} (${v.platform === "INSTAGRAM" ? "IG" : "YT"}, ${v.orientation === "VERTICAL" ? "vertical" : "horizontal"})`, v.viewers, v.plays, `${(v.avgWatchMs / 1000).toFixed(1)}s`, v.clicks, pct(v.clicks, v.plays)])} />
              </div>
            )}
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Which type of content works</h2>
              <div className="mt-3">
                <Table head={["Topic", "Plays", "Clicks", "Click rate"]} rows={summary.topics.map((t) => [t.topic, t.plays, t.clicks, pct(t.clicks, t.plays)])} />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Links page taps</h2>
              <div className="mt-3">
                <Table head={["Link", "Taps"]} rows={summary.links.length ? summary.links.map((l) => [l.key, l.clicks]) : [["No taps yet", 0]]} />
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Where visitors come from</h2>
              <div className="mt-3">
                <Table head={["Source", "Visitors", "Clicks", "Enquiries"]} rows={summary.sources.length ? summary.sources.map((s) => [sourceName(s.source), s.visitors, s.clicks, s.enquiries]) : [["No visits yet", 0, 0, 0]]} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Add <span className="font-mono">?utm_source=instagram</span> (or facebook, linkedin, youtube) to the link in each bio and caption so this table can tell the platforms apart.</p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">What enquirers say found them</h2>
              <div className="mt-3">
                <Table head={["Found via", "Enquiries"]} rows={summary.enquiriesByFoundVia.length ? summary.enquiriesByFoundVia.map((r) => [FOUND_LABEL[r.howFound] ?? r.howFound, r.enquiries]) : [["No enquiries yet", 0]]} />
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Busiest hours (India time)</h2>
              <div className="mt-3">
                <Table head={["Hour", "Plays", "Clicks"]} rows={summary.hours.length ? summary.hours.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.plays, h.clicks]) : [["No activity yet", 0, 0]]} />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Phone or computer</h2>
              <div className="mt-3">
                <Table head={["Device", "Visitors"]} rows={summary.devices.length ? summary.devices.map((d) => [d.device, d.visitors]) : [["No visits yet", 0]]} />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
