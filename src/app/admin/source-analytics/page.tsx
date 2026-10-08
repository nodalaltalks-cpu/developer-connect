import Link from "next/link";
import { currentUser, requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { RANGE_PRESETS, parseInsightFilters } from "@/lib/leads/call-analytics";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatEnumLabel, formatMoney } from "@/lib/leads/format";
import { FUNNEL_STAGES, STAGE_LABEL, getPersonFunnel, getSourceFunnel, MIN_SAMPLE } from "@/lib/leads/source-analytics";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

export const metadata = {
  title: "Cold vs Digital | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const FIELD = "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground";
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGE_LABEL: Record<(typeof RANGE_PRESETS)[number], string> = { today: "Today", yesterday: "Yesterday", last7: "Last 7 days", last30: "Last 30 days", custom: "Custom dates" };
const SOURCE_NAME = { COLD_CALL: "Cold Call", DIGITAL: "Digital" } as const;
const SOURCE_PARAM = { COLD_CALL: "cold_call", DIGITAL: "digital" } as const;

function minutes(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;
}

export default async function SourceAnalyticsPage({ searchParams }: PageProps<"/admin/source-analytics">) {
  await requireFounder();
  const user = await currentUser();
  const params = await searchParams;
  const now = new Date();
  const { range } = parseInsightFilters({ range: first(params.range) ?? "last30", from: first(params.from), to: first(params.to) }, now);
  const actor = { actorType: "FOUNDER" as const, actorId: user!.id };
  const repos = createPostgresLeadRepositories();
  const [sources, people, team] = await Promise.all([getSourceFunnel(repos, actor, range), getPersonFunnel(repos, actor, range), createPostgresStaffRepository().list()]);
  const nameOf = (id: string) => team.find((m) => m.userId === id)?.displayName ?? "Founder / unknown";

  return (
    <div>
      <SectionHeading
        title="Cold Call vs Digital"
        description={`Leads created in the range (${range.label}), and how far each source got. Every number is a count of real records; a percentage appears only once a source has at least ${MIN_SAMPLE} leads.`}
      />

      <form method="get" className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-4" aria-label="Filter analytics">
        <label className="text-sm text-foreground">
          Date range
          <select name="range" defaultValue={first(params.range) ?? "last30"} className={`${FIELD} mt-1`}>
            {RANGE_PRESETS.map((r) => (
              <option key={r} value={r}>
                {RANGE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          From (custom)
          <input type="date" name="from" defaultValue={first(params.from) ?? ""} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-sm text-foreground">
          To (custom)
          <input type="date" name="to" defaultValue={first(params.to) ?? ""} className={`${FIELD} mt-1`} />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center self-end rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          Apply
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sources.map((s) => (
          <section key={s.sourceType} aria-label={SOURCE_NAME[s.sourceType]} className="rounded-xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">{SOURCE_NAME[s.sourceType]}</h2>
              <Link href={`/admin/leads?view=all&source=${SOURCE_PARAM[s.sourceType]}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover underline">
                Open these leads
              </Link>
            </div>
            {s.counts.leads === 0 ? (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                No {SOURCE_NAME[s.sourceType]} leads were created in this range.
              </p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-border">
                  {FUNNEL_STAGES.map((stage) => (
                    <li key={stage} className="flex min-h-11 items-center justify-between gap-3 py-1 text-sm">
                      <span className="text-foreground">{STAGE_LABEL[stage]}</span>
                      <span className="text-right">
                        <span className="font-semibold text-foreground">{s.counts[stage]}</span>
                        {s.rates[stage] !== null && <span className="ml-2 text-xs text-muted-foreground">{s.rates[stage]}%</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {s.counts.leads < MIN_SAMPLE && <p className="mt-2 text-xs text-muted-foreground">Fewer than {MIN_SAMPLE} leads, so no percentages yet.</p>}
                <p className="mt-2 text-sm text-foreground">Talk time on connected calls: {minutes(s.talkSeconds)}</p>

                <h3 className="mt-4 text-sm font-semibold text-foreground">Revenue from these leads</h3>
                {s.revenue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookings yet.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm text-foreground">
                    {s.revenue.map((r) => (
                      <li key={r.currency}>
                        {r.currency}: booking value {formatMoney(r.bookingValue, r.currency)} · commission expected {formatMoney(r.commissionExpected, r.currency)} · received {formatMoney(r.commissionReceived, r.currency)}
                      </li>
                    ))}
                  </ul>
                )}

                {s.details.length > 1 && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold text-foreground">By source</h3>
                    <ul className="mt-1 text-sm text-foreground">
                      {s.details.map((d) => (
                        <li key={d.detail} className="flex min-h-11 items-center justify-between gap-3 border-t border-border">
                          <span>{formatEnumLabel(d.detail)}</span>
                          <span className="text-muted-foreground">
                            {d.counts.leads} leads · {d.counts.connected} connected · {d.counts.qualified} qualified · {d.counts.booked} booked
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        ))}
      </div>

      <section aria-label="By team member" className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">By team member</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cold Call leads credit whoever generated them; Digital leads credit the person they are assigned to. The two are shown separately and never added into one score.</p>
        {people.length === 0 ? (
          <p role="status" className="mt-2 text-sm text-muted-foreground">No leads in this range.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">Person</th>
                  <th scope="col" className="px-3 py-2">Source</th>
                  {(["leads", "called", "connected", "qualified", "visitsDone", "booked"] as const).map((k) => (
                    <th key={k} scope="col" className="px-3 py-2 text-right">
                      {STAGE_LABEL[k]}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right">Talk time</th>
                  <th scope="col" className="px-3 py-2">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.map((p) => (
                  <tr key={`${p.personId}-${p.sourceType}`}>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">{nameOf(p.personId)}</th>
                    <td className="px-3 py-2">{SOURCE_NAME[p.sourceType]}</td>
                    {(["leads", "called", "connected", "qualified", "visitsDone", "booked"] as const).map((k) => (
                      <td key={k} className="px-3 py-2 text-right">{p.counts[k]}</td>
                    ))}
                    <td className="px-3 py-2 text-right">{minutes(p.talkSeconds)}</td>
                    <td className="px-3 py-2">{p.revenue.length === 0 ? "—" : p.revenue.map((r) => formatMoney(r.bookingValue, r.currency)).join(" + ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
