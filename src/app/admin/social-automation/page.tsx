import Link from "next/link";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { FollowUpButtons } from "@/components/social-automation/follow-up-buttons";
import { SettingsPanel } from "@/components/social-automation/settings-panel";
import { parseInsightFilters } from "@/lib/leads/call-analytics";
import { formatDateTime } from "@/lib/leads/format";
import { automationSummary, getSettings, listCommentEvents, listPosts } from "@/lib/social-automation/db/postgres-automation";
import type { AutomationSummary, CommentEventRow } from "@/lib/social-automation/db/postgres-automation";
import { DEFAULT_SETTINGS } from "@/lib/social-automation/types";
import type { AutomationSettings } from "@/lib/social-automation/types";

export const metadata = { title: "Comment-to-DM automation | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGES = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "all", label: "Since the start" },
] as const;
const CHIP = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm hover:bg-muted";
const PLATFORM_LABEL: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook" };
const MODE_LABEL: Record<string, string> = { DISABLED: "Disabled", DRY_RUN: "Dry run", LIVE: "Live" };
const STATUS_LABEL: Record<string, string> = { NOT_ATTEMPTED: "Not attempted", DRY_RUN: "Dry run", SENT: "Sent", FAILED: "Failed", INELIGIBLE: "Not eligible", SKIPPED: "Skipped" };
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

export default async function SocialAutomationPage({ searchParams }: PageProps<"/admin/social-automation">) {
  const params = await searchParams;
  const range = parseInsightFilters({ range: first(params.range) ?? "last30" }, new Date()).range;
  const rangeKey = RANGES.find((r) => r.label === range.label)?.key ?? "last30";

  let settings: AutomationSettings = DEFAULT_SETTINGS;
  let summary: AutomationSummary | null = null;
  let posts: Awaited<ReturnType<typeof listPosts>> = [];
  let followUps: CommentEventRow[] = [];
  let recent: CommentEventRow[] = [];
  let failed = false;
  try {
    [settings, summary, posts, followUps, recent] = await Promise.all([getSettings(), automationSummary(range.from, range.to), listPosts(), listCommentEvents(50, true), listCommentEvents(30)]);
  } catch {
    failed = true;
  }

  return (
    <div>
      <SectionHeading title="Comment-to-DM automation" description="Private to you. When someone comments a keyword on a configured Instagram or Facebook post, the system can send the matching private message and a public reply. Every figure here is counted from stored events and platform responses; a message is never reported as read." />

      {failed ? (
        <EmptyState title="Automation data is not available yet" description="The database did not answer, or the latest database update (0040) has not been applied. Reload in a moment." />
      ) : (
        <div className="space-y-8">
          <SettingsPanel enabled={settings.enabled} priceMaxAgeDays={settings.priceMaxAgeDays} availabilityMaxAgeDays={settings.availabilityMaxAgeDays} defaultPublicReply={settings.defaultPublicReply} defaultPublicReplyFallback={settings.defaultPublicReplyFallback} />

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">Configured posts ({posts.length})</h2>
              <Link href="/admin/social-automation/new" className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">Add a post</Link>
            </div>
            {posts.length === 0 ? (
              <EmptyState title="No posts configured" description="Add a post, link it to a project, and it starts in Dry run: it records what it would do and sends nothing." />
            ) : (
              <ul className="space-y-2">
                {posts.map(({ config, project, updatedAt }) => (
                  <li key={config.id}>
                    <Link href={`/admin/social-automation/${config.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{config.videoTitle}</p>
                        <p className="text-xs text-muted-foreground">
                          {PLATFORM_LABEL[config.platform]} · {config.postId === null ? "draft (not linked yet)" : "linked"} · {project ? project.name : "no project chosen"} · {config.triggers.map((t) => t.keyword).join(", ")} · updated {formatDateTime(updatedAt)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${config.mode === "LIVE" ? "bg-amber-100 text-amber-900" : config.mode === "DRY_RUN" ? "bg-blue-100 text-blue-900" : "bg-muted text-muted-foreground"}`}>{MODE_LABEL[config.mode]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <nav aria-label="Date range" className="mb-4 flex flex-wrap gap-2">
              {RANGES.map((r) => (
                <Link key={r.key} href={`/admin/social-automation?range=${r.key}`} aria-current={rangeKey === r.key ? "page" : undefined} className={`${CHIP} ${rangeKey === r.key ? "border-accent bg-accent-soft text-accent-hover" : "border-border text-foreground"}`}>{r.label}</Link>
              ))}
            </nav>
            {summary && (
              <>
                <h2 className="mb-3 text-lg font-semibold text-foreground">Results — {range.label}</h2>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Tile label="Qualifying comments" value={summary.qualifying} sub="matched a keyword" />
                  <Tile label="DMs attempted" value={summary.dmAttempted} sub="the platform was asked" />
                  <Tile label="DMs sent" value={summary.dmSent} sub={`success rate ${pct(summary.dmSent, summary.dmAttempted)}`} />
                  <Tile label="DMs failed" value={summary.dmFailed} sub="failed or not eligible" />
                  <Tile label="Public replies" value={summary.repliesCompleted} sub="posted" />
                  <Tile label="Dry runs" value={summary.dryRuns} sub="recorded, nothing sent" />
                  <Tile label="Duplicates ignored" value={summary.duplicatesIgnored} sub="repeat deliveries" />
                  <Tile label="Need your follow-up" value={summary.needFollowUp} sub="open" />
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">By platform</h3>
                    {summary.byPlatform.length === 0 ? <p className="text-sm text-muted-foreground">No comments recorded yet.</p> : <Table head={["Platform", "Enquiries", "DMs sent"]} rows={summary.byPlatform.map((r) => [PLATFORM_LABEL[r.platform] ?? r.platform, r.qualifying, r.dmSent])} />}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">By keyword</h3>
                    {summary.byKeyword.length === 0 ? <p className="text-sm text-muted-foreground">No keyword matches yet.</p> : <Table head={["Keyword", "Enquiries", "Attempted", "Sent", "Rate"]} rows={summary.byKeyword.map((r) => [r.keyword, r.qualifying, r.dmAttempted, r.dmSent, pct(r.dmSent, r.dmAttempted)])} />}
                  </div>
                </div>
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">By post and project</h3>
                  {summary.byPost.length === 0 ? <p className="text-sm text-muted-foreground">No comments recorded yet.</p> : <Table head={["Post", "Enquiries", "DMs sent", "DMs failed"]} rows={summary.byPost.map((r) => [`${r.title ?? r.postId}${r.projectName ? ` — ${r.projectName}` : ""} (${PLATFORM_LABEL[r.platform] ?? r.platform})`, r.qualifying, r.dmSent, r.dmFailed])} />}
                </div>
              </>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Needs your personal follow-up ({followUps.length})</h2>
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting.</p>
            ) : (
              <ul className="space-y-2">
                {followUps.map((e) => (
                  <li key={e.id} className="rounded-xl border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">{e.commenterUsername ? `@${e.commenterUsername}` : "A commenter"} on {PLATFORM_LABEL[e.platform]} — {e.triggerKeyword ?? "no keyword"}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">&ldquo;{e.commentText ?? ""}&rdquo;</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(e.receivedAt)} · {e.followUpReason ?? "needs a personal reply"}</p>
                    <div className="mt-2"><FollowUpButtons eventId={e.id} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Recent comments</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      {["When", "Platform", "Keyword", "DM", "Public reply", "Mode"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((e) => (
                      <tr key={e.id} className="border-t border-border align-top">
                        <td className="px-3 py-2">{formatDateTime(e.receivedAt)}</td>
                        <td className="px-3 py-2">{PLATFORM_LABEL[e.platform] ?? e.platform}</td>
                        <td className="px-3 py-2">{e.triggerKeyword ?? "—"}</td>
                        <td className="px-3 py-2">{STATUS_LABEL[e.dmStatus] ?? e.dmStatus}{e.dmFailureReason ? <span className="block text-xs text-red-700">{e.dmFailureReason}</span> : null}</td>
                        <td className="px-3 py-2">{STATUS_LABEL[e.replyStatus] ?? e.replyStatus}{e.replyFailureReason ? <span className="block text-xs text-red-700">{e.replyFailureReason}</span> : null}</td>
                        <td className="px-3 py-2">{e.modeAtProcessing ? (MODE_LABEL[e.modeAtProcessing] ?? e.modeAtProcessing) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
