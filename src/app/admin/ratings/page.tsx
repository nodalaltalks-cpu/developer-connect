import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { MarkRatingsSeenButton } from "@/components/admin/mark-ratings-seen";
import { createPostgresBuyerEnquiryRepository } from "@/lib/enquiries/db/postgres-repository";
import { STAR_LABELS, type BuyerEnquiry, type RatingSummary } from "@/lib/enquiries/types";
import { formatDateTimeFull } from "@/lib/leads/format";
import { MetricTile } from "@/components/leads/call-metrics";

export const metadata = { title: "Service ratings | Developer Connects", robots: { index: false, follow: false } };
// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const KIND_LABEL: Record<BuyerEnquiry["kind"], string> = {
  DEVELOPER_CONNECT: "Developer connect",
  QUICK_ENQUIRY: "Enquiry form",
  ADVISOR_CONTACT: "Advisor contact",
};

function Stars({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className="text-lg tracking-wide text-gold">
      {"★".repeat(value)}
      <span className="text-field-border">{"★".repeat(5 - value)}</span>
    </span>
  );
}

const EMPTY: RatingSummary = { totalEnquiries: 0, rated: 0, average: null, distribution: [0, 0, 0, 0, 0], unseen: 0, needsAttention: 0 };

export default async function RatingsPage({ searchParams }: PageProps<"/admin/ratings">) {
  await requireFounder();
  const params = await searchParams;
  const onlyLow = first(params.show) === "low";

  let summary = EMPTY;
  let rows: BuyerEnquiry[] = [];
  let unavailable = false;
  try {
    const repo = createPostgresBuyerEnquiryRepository();
    [summary, rows] = await Promise.all([repo.summary(), repo.listRated({ limit: 200, ...(onlyLow ? { maxStars: 3 } : {}) })]);
  } catch {
    unavailable = true;
  }

  const maxBar = Math.max(1, ...summary.distribution);
  const chip = "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium";
  const responseRate = summary.totalEnquiries > 0 ? Math.round((summary.rated / summary.totalEnquiries) * 100) : null;

  return (
    <div>
      <LiveRefresh />
      <SectionHeading
        title="Service ratings"
        description="What buyers say about the service, as they say it. Each rating arrives here the moment it is sent and you are alerted on screen. Ratings of 3 stars or less are the ones worth a call."
      />

      {unavailable ? (
        <EmptyState title="Ratings are not available yet" description="The ratings table could not be read. Try again in a moment." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile label="Average" value={summary.average === null ? "—" : `${summary.average.toFixed(1)} / 5`} hint={`${summary.rated} ${summary.rated === 1 ? "rating" : "ratings"}`} />
            <MetricTile label="New" value={String(summary.unseen)} hint="not yet marked as read" />
            <MetricTile label="Needs attention" value={String(summary.needsAttention)} hint="3 stars or less" />
            <MetricTile label="Rated" value={responseRate === null ? "—" : `${responseRate}%`} hint={`${summary.rated} of ${summary.totalEnquiries} enquiries`} />
          </div>

          <section aria-labelledby="dist-heading" className="mt-6 rounded-lg border border-border p-4">
            <h2 id="dist-heading" className="text-sm font-semibold text-foreground">
              How the ratings are spread
            </h2>
            <ul className="mt-3 space-y-1.5">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = summary.distribution[stars - 1];
                return (
                  <li key={stars} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-foreground">
                      {stars} {stars === 1 ? "star" : "stars"}
                    </span>
                    <span className="h-2 min-w-0 flex-1 rounded bg-muted" aria-hidden="true">
                      <span className={`block h-2 rounded ${stars <= 3 ? "bg-red-400" : "bg-gold"}`} style={{ width: `${(count / maxBar) * 100}%` }} />
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-foreground">{count}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <nav aria-label="Filter" className="flex flex-wrap gap-2">
              <Link href="/admin/ratings" aria-current={!onlyLow ? "page" : undefined} className={chip}>
                All ratings
              </Link>
              <Link href="/admin/ratings?show=low" aria-current={onlyLow ? "page" : undefined} className={chip}>
                Needs attention
              </Link>
            </nav>
            <span className="ml-auto">
              <MarkRatingsSeenButton unseen={summary.unseen} />
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={onlyLow ? "Nothing needs attention" : "No ratings yet"}
                description={onlyLow ? "No buyer has rated the service 3 stars or less." : "When a signed-in buyer rates an enquiry from their profile, it appears here at once."}
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {rows.map((r) => {
                const isNew = r.seenAt === null;
                return (
                  <li key={r.id} className={`rounded-lg border p-4 ${r.rating !== null && r.rating <= 3 ? "border-red-200" : "border-border"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars value={r.rating as number} />
                        <span className="text-sm font-medium text-foreground">{STAR_LABELS[r.rating as number]}</span>
                        {isNew && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">New</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">Rated {formatDateTimeFull(r.ratedAt as Date)}</p>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{r.raterName ?? "A buyer"}</p>
                    <p className="text-sm text-muted-foreground">
                      {KIND_LABEL[r.kind]} · {r.title}
                      {r.detail ? ` · ${r.detail}` : ""} · enquired {formatDateTimeFull(r.createdAt)}
                    </p>
                    {r.comment ? (
                      <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground">&ldquo;{r.comment}&rdquo;</p>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">No comment left.</p>
                    )}
                    {r.leadId && (
                      <Link href={`/admin/leads/${r.leadId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
                        Open this buyer&apos;s lead →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
