import Link from "next/link";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { parseInsightFilters } from "@/lib/leads/call-analytics";
import { loadBehaviourReport } from "@/lib/behaviour/db/queries";
import { buildChannels, buildDevices, buildFindings, buildFunnel, MIN_SAMPLE, summarisePages, type Severity } from "@/lib/behaviour/report";

export const metadata = {
  title: "Visitor behaviour | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
] as const;

const CTA_LABEL: Record<string, string> = {
  connect_developer: "Connect (developer page)",
  connect_sticky: "Connect (phone sticky bar)",
  hero_market_dubai: "Homepage: chose Dubai",
  hero_market_mumbai: "Homepage: chose Mumbai",
  connect_card: "Connect (directory card)",
  whatsapp_share: "Share on WhatsApp",
  email_share: "Share by email",
  copy_link: "Copy link",
  native_share: "Share (phone menu)",
  sign_in: "Sign in",
  newsletter_submit: "Newsletter sign-up",
  contact_submit: "Contact form",
  advisor_open: "Talk to an Advisor (opened)",
  advisor_whatsapp: "Advisor: WhatsApp",
  advisor_email: "Advisor: Email",
  advisor_call: "Advisor: Call",
  advisor_linkedin: "Founder: LinkedIn",
};

const TONE: Record<Severity, { label: string; box: string; pill: string }> = {
  fix: { label: "Fix", box: "border-red-200", pill: "bg-red-50 text-red-800" },
  look: { label: "Look at", box: "border-amber-200", pill: "bg-amber-50 text-amber-800" },
  good: { label: "Working", box: "border-green-200", pill: "bg-green-50 text-green-800" },
  info: { label: "Note", box: "border-border", pill: "bg-muted text-foreground" },
};

const show = (value: number | null, suffix = "%") => (value === null ? "-" : `${value}${suffix}`);

export default async function BehaviourPage({ searchParams }: PageProps<"/admin/behaviour">) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const params = await searchParams;
  const now = new Date();
  const range = parseInsightFilters({ range: first(params.range) ?? "last30", from: first(params.from), to: first(params.to) }, now).range;
  const report = await loadBehaviourReport(range.from, range.to);

  const findings = buildFindings(report);
  const funnel = buildFunnel(report.sessions);
  const channels = buildChannels(report.sessions);
  const devices = buildDevices(report.sessions);
  const pages = summarisePages(report.pages).slice(0, 10);
  const ctaTotals = [...report.ctas.reduce((m, c) => m.set(c.ctaId, (m.get(c.ctaId) ?? 0) + c.clicks), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const chip = "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium";
  const card = "rounded-xl border border-border p-4";

  return (
    <div>
      <SectionHeading title={`Visitor behaviour — ${range.label}`} description="What visitors do before they ever become a lead, in plain language. Counted from real recorded visits; nothing is estimated." />

      <nav aria-label="Range" className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/admin/behaviour?range=${r.key}`} aria-current={range.label === r.label ? "page" : undefined} className={chip}>
            {r.label}
          </Link>
        ))}
      </nav>

      {report.truncated && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          This range has more visitor sessions than the report reads at once, so it covers the most recent ones only. Choose a shorter range for the full picture.
        </p>
      )}

      <section aria-labelledby="fix-heading">
        <h2 id="fix-heading" className="text-base font-semibold text-foreground">
          What to fix first
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {findings.map((f) => (
            <li key={f.key} className={`min-w-0 rounded-xl border p-4 ${TONE[f.severity].box}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold text-foreground">{f.title}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${TONE[f.severity].pill}`}>{TONE[f.severity].label}</span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.detail}</p>
              {f.href && (
                <Link href={f.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
                  See where leads came from
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {report.sessions.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No visitor sessions recorded yet" description="Visits appear here as people use the public site. Private areas (admin, profile, team) are never recorded, and visitors who decline analytics or send a privacy signal are not counted." />
        </div>
      ) : (
        <>
          <section aria-labelledby="funnel-heading" className="mt-8">
            <h2 id="funnel-heading" className="text-base font-semibold text-foreground">
              From visit to enquiry
            </h2>
            <ol className="mt-3 grid grid-cols-1 gap-2">
              {funnel.map((step) => (
                <li key={step.key} className={`${card} min-w-0`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-foreground">{step.label}</p>
                    <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">{step.count}</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${show(step.ofVisitorsPercent ?? 100)} of visitors`}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, step.ofVisitorsPercent ?? 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {step.continuedPercent === null ? "Everyone who visited" : `${show(step.continuedPercent)} of the previous step · ${show(step.ofVisitorsPercent)} of all visitors`}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="sources-heading" className="mt-8">
            <h2 id="sources-heading" className="text-base font-semibold text-foreground">
              Where visitors come from
            </h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {channels.map((c) => (
                <li key={c.channel} className={`${card} min-w-0`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-foreground">{c.label}</p>
                    <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {c.sessions} · {show(c.sharePercent)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pressed Connect: {show(c.connectPercent)} · Sent an enquiry: {show(c.leadPercent)} ({c.leads})
                    {c.sessions < MIN_SAMPLE ? ` · rates appear from ${MIN_SAMPLE} visitors` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              “Direct / unknown” means no ad click, campaign tag or referring site was seen. For leads from cold calling, imports and your own lists, see{" "}
              <Link href="/admin/acquisition" className="inline-flex min-h-11 items-center text-accent-hover underline underline-offset-2">
                Acquisition
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby="devices-heading" className="mt-8">
            <h2 id="devices-heading" className="text-base font-semibold text-foreground">
              Phone or desktop
            </h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {devices.map((d) => (
                <li key={d.device} className={`${card} min-w-0`}>
                  <p className="text-sm font-semibold capitalize text-foreground">{d.device === "unknown" ? "Not recorded" : d.device}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.sessions} visitors · Pressed Connect {show(d.connectPercent)} · Sent an enquiry {show(d.leadPercent)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="pages-heading" className="mt-8">
            <h2 id="pages-heading" className="text-base font-semibold text-foreground">
              Pages people open
            </h2>
            {pages.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Page-level numbers appear once visitors have browsed pages with tracking switched on.</p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {pages.map((p) => (
                  <li key={p.path} className={`${card} min-w-0`}>
                    <p className="break-all text-sm font-semibold text-foreground">{p.path}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.views} views · reads for {show(p.avgEngagedSeconds, "s")} · scrolls {show(p.avgScrollPercent)} of the page · leaves quickly {show(p.bouncePercent)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="cta-heading" className="mt-8">
            <h2 id="cta-heading" className="text-base font-semibold text-foreground">
              Buttons people press
            </h2>
            {ctaTotals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No tracked button presses yet.</p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ctaTotals.map(([id, clicks]) => (
                  <li key={id} className={`${card} flex min-w-0 items-baseline justify-between gap-3`}>
                    <span className="min-w-0 text-sm text-foreground">{CTA_LABEL[id] ?? id}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{clicks}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        How this is collected: anonymous, no names, phone numbers or emails, path only (never the full web address), bots ignored, and visitors who choose “only essentials” or send a Do Not Track / Global Privacy Control signal are not counted.
      </p>
    </div>
  );
}
