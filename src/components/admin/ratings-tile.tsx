import Link from "next/link";
import { createPostgresBuyerEnquiryRepository } from "@/lib/enquiries/db/postgres-repository";
import { raterLabel } from "@/lib/enquiries/service";
import type { BuyerEnquiry, RatingSummary } from "@/lib/enquiries/types";

/**
 * The Founder's "how are buyers rating us" block, on the command centre where decisions are made: the average, how many are new,
 * how many need a call, and the latest few. Everything links to /admin/ratings. Best effort: if the ratings cannot be read the
 * block says nothing rather than breaking the page.
 */
export async function RatingsTile() {
  let summary: RatingSummary;
  let latest: BuyerEnquiry[];
  try {
    const repo = createPostgresBuyerEnquiryRepository();
    [summary, latest] = await Promise.all([repo.summary(), repo.listRated({ limit: 3 })]);
  } catch {
    return null;
  }

  return (
    <section aria-labelledby="ratings-heading" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ratings-heading" className="text-base font-semibold text-foreground">
          What buyers say about the service
        </h2>
        <Link href="/admin/ratings" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
          All ratings{summary.unseen > 0 ? ` (${summary.unseen} new)` : ""} →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Average</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{summary.average === null ? "—" : `${summary.average.toFixed(1)} / 5`}</p>
          <p className="text-xs text-muted-foreground">{summary.rated} rated</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">New</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{summary.unseen}</p>
          <p className="text-xs text-muted-foreground">not yet read</p>
        </div>
        <div className={`rounded-lg border p-3 ${summary.needsAttention > 0 ? "border-red-200" : "border-border"}`}>
          <p className="text-xs text-muted-foreground">Needs attention</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{summary.needsAttention}</p>
          <p className="text-xs text-muted-foreground">3 stars or less</p>
        </div>
      </div>
      {latest.length > 0 && (
        <ul className="mt-3 space-y-2">
          {latest.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium text-foreground">
                <span className="text-gold" aria-hidden="true">
                  {"★".repeat(r.rating as number)}
                </span>
                <span className="sr-only">{r.rating} out of 5 stars, </span> {raterLabel(r.raterName)} · {r.title}
              </p>
              {r.comment && <p className="mt-1 text-muted-foreground">&ldquo;{r.comment.length > 140 ? `${r.comment.slice(0, 137)}...` : r.comment}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
