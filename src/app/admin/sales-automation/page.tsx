import { currentUser } from "@clerk/nextjs/server";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { AutomationControls } from "@/components/admin/automation-controls";
import { AUTOMATION_LABELS, type AutomationRule } from "@/lib/leads/automation-rules";
import { getAutomationOverview } from "@/lib/leads/automation-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatDateTimeFull } from "@/lib/leads/format";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

export const metadata = {
  title: "Sales automation | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const STATUS = { PENDING: "In progress", DONE: "Done", FAILED: "Failed (will retry)", SKIPPED: "Skipped" } as const;

export default async function SalesAutomationPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const overview = await getAutomationOverview(createPostgresLeadRepositories(), createPostgresStaffRepository(), { actorType: "FOUNDER", actorId: user!.id });

  return (
    <div>
      <SectionHeading title="Sales automation" description="Plain rules that remind the team and, if you turn it on, balance new leads. Every action is logged below with the rule that caused it. In-app notifications only: nothing is sent by WhatsApp, SMS or email." />
      <AutomationControls settings={overview.settings} />
      <p className="mt-3 text-xs text-muted-foreground">
        The rules run when the scheduled request calls them (it needs a CRON_SECRET to be set and a schedule to be added at deployment) or when you press Run now. Running more than once never repeats an action.
      </p>

      <h2 className="mt-8 text-sm font-semibold text-foreground">Workload (open leads per team member)</h2>
      <p className="mt-1 text-xs text-muted-foreground">{overview.unassignedOpen} open lead{overview.unassignedOpen === 1 ? "" : "s"} currently have no owner. Automatic routing gives the next one to whoever holds the fewest.</p>
      {overview.workload.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No active team members.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {overview.workload.map((w) => (
            <li key={w.userId} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{w.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{w.openLeads} open</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold text-foreground">Recent automated actions</h2>
      {overview.recent.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing has run yet" description="Actions appear here once the engine has reminded someone or routed a lead." />
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {overview.recent.map((a) => (
            <li key={a.id} className="rounded-md border border-border px-3 py-2 text-xs">
              <p className="font-medium text-foreground">
                {AUTOMATION_LABELS[a.rule as AutomationRule]?.title ?? a.rule} · {STATUS[a.status]}
              </p>
              <p className="text-muted-foreground">
                {formatDateTimeFull(a.createdAt)} · {a.subjectType.toLowerCase().replace("_", " ")} · attempt {a.attempts}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
