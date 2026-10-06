import { requireFounder } from "@/lib/auth";
import { currentUser } from "@clerk/nextjs/server";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { FounderCallButton } from "@/components/admin/leads/founder-call-button";
import { MissedCard } from "@/components/leads/missed-card";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getMissedFollowUps, parseMissedFilters } from "@/lib/leads/follow-up-reads";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { formatEnumLabel } from "@/lib/leads/format";
import { LEAD_STATUSES, LEAD_TEMPERATURES } from "@/lib/leads/types";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";

export const metadata = {
  title: "Missed leads | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const FIELD = "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminMissedLeadsPage({ searchParams }: PageProps<"/admin/missed-leads">) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();

  const params = await searchParams;
  const now = new Date();
  const filters = parseMissedFilters(
    { ownerId: first(params.employee), temperature: first(params.temperature), status: first(params.status), days: first(params.days), minHours: first(params.minHours) },
    now,
  );

  const team = await createPostgresStaffRepository().list();
  const names = staffNameMap(team);
  const items = await getMissedFollowUps(
    createPostgresLeadRepositories(),
    { actorType: "FOUNDER", actorId: user!.id },
    filters,
    now,
    createLeadNotifier(createPostgresNotificationRepository()),
  );

  return (
    <div>
      <SectionHeading title="Missed leads" description="Every follow-up whose scheduled time passed without being completed. Private — visible only to you." />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter missed leads">
        <label className="text-sm text-foreground">
          Employee
          <select name="employee" defaultValue={first(params.employee) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Everyone</option>
            {team.map((m) => (
              <option key={m.id} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          Due in the last
          <select name="days" defaultValue={first(params.days) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Any time</option>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <label className="text-sm text-foreground">
          Overdue by at least
          <select name="minHours" defaultValue={first(params.minHours) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Any</option>
            <option value="1">1 hour</option>
            <option value="24">1 day</option>
            <option value="72">3 days</option>
          </select>
        </label>
        <label className="text-sm text-foreground">
          Temperature
          <select name="temperature" defaultValue={first(params.temperature) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Any</option>
            {LEAD_TEMPERATURES.map((t) => (
              <option key={t} value={t}>
                {formatEnumLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          Lead status
          <select name="status" defaultValue={first(params.status) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Any</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatEnumLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover sm:col-span-2 lg:col-span-5">
          Apply filters
        </button>
      </form>

      <h2 className="text-sm font-medium text-foreground">Unresolved · {items.length}</h2>
      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing missed" description="No follow-up is overdue for these filters." />
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <MissedCard
              key={item.followUp.id}
              item={item}
              href={`/admin/leads/${item.lead.id}`}
              callSlot={<FounderCallButton compact leadId={item.lead.id} phoneE164={item.lead.phoneE164} />}
              ownerName={item.followUp.ownerId ? (names[item.followUp.ownerId] ?? "Team member") : "Founder"}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
