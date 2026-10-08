import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoryList, ProfileActions } from "@/components/admin/employee-profile-actions";
import { IdChip, StatusPill } from "@/components/admin/staff-manager";
import { requireFounder, requireFounderForAction } from "@/lib/auth";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getEmployeeProfile, HISTORY_PAGE } from "@/lib/leads/employee-profile";
import { formatDateTimeFull, formatEnumLabel, formatMoneyExact } from "@/lib/leads/format";
import { FOUNDER_IDENTITY, invitedDetail } from "@/lib/staff/identity";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import type { LeadCurrency } from "@/lib/leads/types";

export const metadata = { title: "Team member | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const stamp = (d: Date | null) => (d ? formatDateTimeFull(d) : "-");
const minutes = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.round(s / 60)}m`);

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dd className="text-lg font-semibold tabular-nums text-foreground">{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default async function EmployeeProfilePage({ params }: { params: Promise<{ employeeId: string }> }) {
  // Founder only. An employee can never reach this route (the admin layout and this check both refuse them).
  await requireFounder();
  const founderId = await requireFounderForAction();
  const { employeeId } = await params;
  const result = await getEmployeeProfile(createPostgresLeadRepositories(), createPostgresStaffRepository(), { actorType: "FOUNDER", actorId: founderId }, employeeId);
  if (result.kind === "NOT_FOUND") notFound();

  const back = (
    <Link href="/admin/staff" className="mb-4 inline-flex min-h-11 items-center text-sm text-accent-hover underline underline-offset-2">
      ← Team
    </Link>
  );

  if (result.kind === "FOUNDER") {
    return (
      <div>
        {back}
        <IdChip id={FOUNDER_IDENTITY.employeeId} />
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{FOUNDER_IDENTITY.name}</h1>
        <p className="text-sm text-muted-foreground">{FOUNDER_IDENTITY.role}. The Founder is not an employee record; all Founder work is shown across the admin screens.</p>
      </div>
    );
  }

  const { member, sales, lifecycle, recentCalls, history, openLeadSample } = result.profile;
  const detail = invitedDetail(member);

  return (
    <div>
      {back}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <IdChip id={member.employeeId} />
          <h1 className="mt-2 break-words text-xl font-semibold tracking-tight text-foreground">{member.displayName}</h1>
          <p className="text-sm text-muted-foreground">{formatEnumLabel(member.role)}</p>
        </div>
        <StatusPill status={member.status} />
      </div>
      {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}

      <div className="mt-4">
        <ProfileActions staffId={member.id} employeeId={member.employeeId} name={member.displayName} status={member.status} approved={member.approvedAt !== null} openLeads={sales.openLeads} email={member.email} />
      </div>

      <Section title="Identity and employment">
        <dl className="grid grid-cols-1 gap-2 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
          {[
            ["Employee ID", member.employeeId],
            ["Sign-in email", member.email ?? "-"],
            ["Joined", stamp(member.joinedAt)],
            ["Approved", stamp(member.approvedAt)],
            ["Exited", member.status === "EXITED" ? stamp(member.exitedAt) : "-"],
            ["Exit reason", member.exitReason ? formatEnumLabel(member.exitReason) : "-"],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="break-all text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Sales activity (all time)">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Open leads owned" value={sales.openLeads} />
          <Stat label="Leads acted on" value={sales.leadsActedOn} />
          <Stat label="Calls dialed" value={sales.calls.dialed} />
          <Stat label="Connected" value={sales.calls.connected} />
          <Stat label="Talk time" value={minutes(sales.calls.talkSeconds)} />
          <Stat label="Follow-ups done" value={`${sales.followUps.completed}/${sales.followUps.created}`} />
          <Stat label="Follow-ups overdue" value={sales.followUps.missedNow} />
          <Stat label="Requirements" value={sales.requirementsCreated} />
          <Stat label="Projects shortlisted" value={sales.projectsShortlisted} />
          <Stat label="Site visits done" value={`${sales.siteVisits.completed}/${sales.siteVisits.scheduled}`} />
          <Stat label="Leads returned" value={sales.leadsReturned} />
        </dl>
        <div className="mt-3 rounded-lg border border-border p-3 text-sm">
          <p className="text-xs text-muted-foreground">Bookings and revenue on leads they own</p>
          {sales.revenue.length === 0 ? (
            <p className="text-foreground">None yet.</p>
          ) : (
            sales.revenue.map((r) => (
              <p key={r.currency} className="text-foreground">
                {formatMoneyExact(r.total, r.currency as LeadCurrency)} · {r.count} {r.count === 1 ? "booking" : "bookings"}
              </p>
            ))
          )}
        </div>
      </Section>

      {openLeadSample.length > 0 && (
        <Section title="Leads they currently own">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {openLeadSample.map((lead) => (
              <li key={lead.id}>
                <Link href={`/admin/leads/${lead.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted">
                  <span className="min-w-0 truncate font-medium text-foreground">{lead.name ?? "Unnamed lead"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatEnumLabel(lead.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recentCalls.length > 0 && (
        <Section title="Recent calls">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {recentCalls.map(({ call, lead }) => (
              <li key={call.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link href={`/admin/leads/${lead.id}`} className="inline-flex min-h-11 min-w-0 items-center truncate text-foreground underline-offset-2 hover:underline">
                  {lead.name ?? "Unnamed lead"}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatEnumLabel(call.status)} · {formatDateTimeFull(call.initiatedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Account history">
        {lifecycle.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lifecycle events recorded.</p>
        ) : (
          <ol className="divide-y divide-border rounded-xl border border-border">
            {lifecycle.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 font-medium text-foreground">
                  {formatEnumLabel(e.eventType.replace("EMPLOYEE_", ""))}
                  {e.eventType === "EMPLOYEE_EMAIL_CHANGED" && (
                    <span className="block break-all text-xs font-normal text-muted-foreground">
                      {String(e.payload.from ?? "none")} → {String(e.payload.to ?? "")}
                    </span>
                  )}
                </span>
                <time dateTime={e.occurredAt.toISOString()} className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTimeFull(e.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Activity history">
        <HistoryList employeeId={member.employeeId} pageSize={HISTORY_PAGE} initial={history.map((e) => ({ id: e.id, leadId: e.leadId, eventType: e.eventType, at: e.createdAt.toISOString() }))} />
      </Section>
    </div>
  );
}
