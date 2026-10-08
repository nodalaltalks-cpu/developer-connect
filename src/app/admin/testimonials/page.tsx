import Link from "next/link";
import { currentUser, requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { RequestForm, RowActions, SeedButton } from "@/components/admin/testimonials/testimonial-controls";
import { FeedbackEntryForm, WordingEditor } from "@/components/admin/testimonials/wording-controls";
import { formatDateTimeFull } from "@/lib/leads/format";
import { DISPLAY_MODE_LABEL, ILLUSTRATIVE_LABEL, TESTIMONIAL_STATUSES, displayName, type TestimonialStatus } from "@/lib/testimonials/model";
import { createPostgresTestimonialRepository } from "@/lib/testimonials/postgres-repository";
import { getTestimonialCounts, listTestimonials } from "@/lib/testimonials/service";

export const metadata = { title: "Testimonials | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const LABEL: Record<TestimonialStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  RECEIVED: "Received",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  REJECTED: "Rejected",
};
const SHOWN_COUNTS: TestimonialStatus[] = ["DRAFT", "SENT", "RECEIVED", "PENDING_APPROVAL", "PUBLISHED"];

export default async function TestimonialsPage({ searchParams }: PageProps<"/admin/testimonials">) {
  await requireFounder();
  const user = await currentUser();
  const actor = { actorType: "FOUNDER" as const, actorId: user!.id };
  const params = await searchParams;
  const requested = first(params.status);
  const view = requested === "templates" ? "templates" : (TESTIMONIAL_STATUSES as readonly string[]).includes(requested ?? "") ? (requested as TestimonialStatus) : "all";

  const repo = createPostgresTestimonialRepository();
  const [counts, rows] = await Promise.all([
    getTestimonialCounts(repo, actor),
    listTestimonials(repo, actor, view === "templates" ? { illustrative: true } : view === "all" ? { illustrative: false } : { status: view, illustrative: false }),
  ]);

  return (
    <div>
      <SectionHeading title="Testimonials" description="Only a real person's words, with their permission, approved by you, ever reach the public site. Nothing here is published automatically." />

      <ul className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Counts">
        {SHOWN_COUNTS.map((s) => (
          <li key={s}>
            <Link href={`/admin/testimonials?status=${s}`} className="flex min-h-16 flex-col justify-center rounded-lg border border-border px-3 py-2 hover:bg-muted">
              <span className="text-xl font-semibold text-foreground">{counts.real[s]}</span>
              <span className="text-xs text-muted-foreground">{LABEL[s]}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="space-y-4">
        <RequestForm />
        <FeedbackEntryForm />
      </div>

      <nav aria-label="Filter" className="mt-6 flex flex-wrap gap-2">
        {(["all", ...TESTIMONIAL_STATUSES, "templates"] as const).map((v) => (
          <Link
            key={v}
            href={v === "all" ? "/admin/testimonials" : `/admin/testimonials?status=${v}`}
            aria-current={view === v ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium"
          >
            {v === "all" ? "All real" : v === "templates" ? `Internal templates (${counts.illustrative})` : LABEL[v]}
          </Link>
        ))}
      </nav>

      {view === "templates" && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{ILLUSTRATIVE_LABEL}</p>
          <p className="mt-1">These are internal examples of the range of buyers a real testimonial might come from. They are never sent, approved or published, never appear on the public site or in structured data, and the database refuses to publish one.</p>
          <div className="mt-3">
            <SeedButton />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          {view === "all" ? "No real testimonials yet. Create a request above and share it with someone you have helped." : "Nothing here."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((t) => (
            <li key={t.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t.isIllustrative ? t.authorName : (t.authorName ?? "Not yet received")}</p>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{LABEL[t.status]}</span>
              </div>
              {t.isIllustrative && <p className="mt-1 text-xs font-semibold text-amber-800">{ILLUSTRATIVE_LABEL}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {[t.city, t.country].filter(Boolean).join(", ") || "Place not given"} · created {formatDateTimeFull(t.createdAt)}
                {t.requestedVia ? ` · sent by ${t.requestedVia.toLowerCase()}` : ""}
              </p>
              {t.experience && (
                <div className="mt-3">
                  {!t.isIllustrative && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client&apos;s original words</p>}
                  <p className="whitespace-pre-line text-sm leading-6 text-foreground">{t.experience}</p>
                </div>
              )}
              {!t.isIllustrative && t.experience && (
                <div className="mt-3 rounded-lg bg-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Will be published as {t.publishedText ? (t.isParaphrased ? "a paraphrase (no quotation marks)" : "the client's own words (in quotation marks)") : "— not chosen yet"}</p>
                  {t.publishedText && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-foreground">{t.publishedText}</p>}
                  {t.attributionDetail && <p className="mt-1 text-xs text-muted-foreground">Shown with: {t.attributionDetail}</p>}
                  {(t.status === "RECEIVED" || t.status === "PENDING_APPROVAL") && (
                    <div className="mt-2">
                      <WordingEditor id={t.id} original={t.experience} current={t.publishedText} paraphrased={t.isParaphrased} />
                    </div>
                  )}
                </div>
              )}
              {!t.isIllustrative && t.experience && (
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium text-foreground">Would appear as: </dt>
                    <dd className="inline">{displayName(t)} ({DISPLAY_MODE_LABEL[t.displayMode]})</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Permission to publish: </dt>
                    <dd className={`inline ${t.permissionPublish ? "" : "font-semibold text-red-700"}`}>{t.permissionPublish ? "Yes" : "No"}</dd>
                  </div>
                  {t.helpedWith && (
                    <div>
                      <dt className="inline font-medium text-foreground">Helped with: </dt>
                      <dd className="inline">{t.helpedWith}</dd>
                    </div>
                  )}
                  {t.project && (
                    <div>
                      <dt className="inline font-medium text-foreground">Project: </dt>
                      <dd className="inline">{t.project}</dd>
                    </div>
                  )}
                  {t.rating !== null && (
                    <div>
                      <dt className="inline font-medium text-foreground">Rating given: </dt>
                      <dd className="inline">{t.rating} of 5</dd>
                    </div>
                  )}
                </dl>
              )}
              {t.rejectReason && <p className="mt-2 text-xs text-muted-foreground">Rejected: {t.rejectReason}</p>}
              <div className="mt-3">
                <RowActions id={t.id} status={t.status} illustrative={t.isIllustrative} canPublish={t.permissionPublish && Boolean(t.publishedText)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
