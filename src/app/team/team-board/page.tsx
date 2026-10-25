import Link from "next/link";
import { requireTab } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { LiveRefresh } from "@/components/live-refresh";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { formatTalkTime } from "@/lib/leads/call-analytics";
import { getTeamBoard } from "@/lib/leads/team-performance";

export const metadata = {
  title: "Team board | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGES = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
] as const;

export default async function TeamBoardPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  // Only people the Founder gave the "Team board" tab can open this; everyone else gets a 404.
  const { actor } = await requireTab("team-board");
  const params = await searchParams;
  const rangeKey = RANGES.find((r) => r.key === first(params.range))?.key ?? "last7";
  const board = await getTeamBoard(createPostgresLeadRepositories(), createPostgresStaffRepository(), actor, { range: rangeKey });

  return (
    <div>
      <LiveRefresh />
      <SectionHeading title={`Team board — ${board.rangeLabel}`} description="How each active team member's calling and follow-ups look. Read-only. It shows activity, not a ranking, and no lead names or revenue." />

      <nav aria-label="Time range" className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/team/team-board?range=${r.key}`} aria-current={r.key === rangeKey ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${r.key === rangeKey ? "border-accent bg-accent-soft text-accent-hover" : "border-border text-foreground"}`}>
            {r.label}
          </Link>
        ))}
      </nav>

      {board.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active team members yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {board.rows.map((row) => (
            <li key={row.employeeId} className="min-w-0 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-base font-semibold text-foreground">{row.name}{row.isMe ? " (you)" : ""}</p>
                <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-hover">{row.employeeId}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                {[
                  ["Dialed", row.dialed],
                  ["Connected", row.connected],
                  ["Talk time", formatTalkTime(row.talkSeconds)],
                  ["Follow-ups done", row.followUpsCompleted],
                  ["Open leads", row.openLeads],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border p-2">
                    <dd className="text-base font-semibold tabular-nums text-foreground">{value}</dd>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
