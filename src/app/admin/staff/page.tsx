import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { StaffManager } from "@/components/admin/staff-manager";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { parseEmployeeId, STATUS_LABEL } from "@/lib/staff/identity";

export const metadata = {
  title: "Team | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["INVITED", "ACTIVE", "INACTIVE", "EXITED"] as const;
const SHOW_LIMIT = 60;

export default async function AdminStaffPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; status?: string | string[] }> }) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = first(sp.q)?.trim().slice(0, 80) ?? "";
  const statusParam = first(sp.status)?.toUpperCase() ?? "";
  const status = (STATUS_FILTERS as readonly string[]).includes(statusParam) ? statusParam : "";

  // An exact employee ID ("dc2", "DC2") goes straight to that person's profile.
  const exact = parseEmployeeId(q);
  if (exact) redirect(`/admin/staff/${exact}`);

  const [members, counts] = await Promise.all([createPostgresStaffRepository().list(), createPostgresLeadRepositories().leads.countOpenByOwner()]);
  const needle = q.toLowerCase();
  const matching = needle ? members.filter((m) => m.employeeId.toLowerCase().includes(needle) || m.displayName.toLowerCase().includes(needle) || (m.email ?? "").toLowerCase().includes(needle)) : members;
  const countOf = (st: string) => matching.filter((m) => m.status === st).length;
  // What needs the Founder first (people waiting for approval), then working people, then inactive, then exited; by ID within each.
  const RANK: Record<string, number> = { INVITED: 0, ACTIVE: 1, INACTIVE: 2, EXITED: 3 };
  const idNum = (id: string) => Number(id.slice(2));
  const ordered = [...matching].filter((m) => !status || m.status === status).sort((a, b) => RANK[a.status] - RANK[b.status] || idNum(a.employeeId) - idNum(b.employeeId));
  const shown = ordered.slice(0, SHOW_LIMIT);
  const href = (st: string) => `/admin/staff?${new URLSearchParams({ ...(q ? { q } : {}), ...(st ? { status: st } : {}) }).toString()}`;

  return (
    <div>
      <SectionHeading title="Team" description="Everyone has a permanent ID that is never reused. Private, visible only to you." />
      <form action="/admin/staff" method="get" role="search" className="mb-4 flex gap-2">
        <label htmlFor="staff-search" className="sr-only">
          Search by employee ID, name or email
        </label>
        <input
          id="staff-search"
          name="q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          defaultValue={q}
          placeholder="Search DC2, name or email"
          className="min-h-12 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Search
        </button>
      </form>
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {[{ key: "", label: "All", count: matching.length }, ...STATUS_FILTERS.map((st) => ({ key: st, label: STATUS_LABEL[st], count: countOf(st) }))].map((chip) => (
          <Link key={chip.key || "all"} href={href(chip.key)} aria-current={status === chip.key ? "true" : undefined} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${status === chip.key ? "border-accent bg-accent-soft text-accent-hover" : "border-border text-foreground hover:bg-muted"}`}>
            {chip.label}
            <span className="tabular-nums text-xs text-muted-foreground">{chip.count}</span>
          </Link>
        ))}
        {(q || status) && (
          <Link href="/admin/staff" className="inline-flex min-h-11 items-center px-2 text-sm text-accent-hover underline underline-offset-2">
            Clear all
          </Link>
        )}
      </nav>
      {ordered.length > SHOW_LIMIT && <p className="mb-3 text-sm text-muted-foreground">Showing the first {SHOW_LIMIT} of {ordered.length}. Search by ID or name to narrow it down.</p>}
      <StaffManager
        query={q}
        rows={shown.map((m) => ({
          id: m.id,
          employeeId: m.employeeId,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
          status: m.status,
          approvedAt: m.approvedAt?.toISOString() ?? null,
          joinedAt: m.joinedAt?.toISOString() ?? null,
          exitedAt: m.exitedAt?.toISOString() ?? null,
          leadCount: counts[m.userId] ?? 0,
        }))}
      />
    </div>
  );
}
