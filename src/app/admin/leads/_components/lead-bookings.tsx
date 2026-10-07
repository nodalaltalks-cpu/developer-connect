import { BookingsPanel } from "@/components/admin/leads/bookings-panel";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import type { Booking } from "@/lib/leads/types";

/** The Founder's bookings and commission section for one lead. The page has already required the Founder; the actions authorize again. */
export async function FounderLeadBookings({ leadId, bookings }: { leadId: string; bookings: Booking[] }) {
  const repos = createPostgresLeadRepositories();
  const projects = await repos.projects.list({ activeOnly: true, limit: 200 });
  const names = await repos.leads.developerNames([...new Set(projects.map((p) => p.developerId))]);
  return (
    <BookingsPanel
      leadId={leadId}
      bookings={bookings.map((b) => ({ id: b.id, projectName: b.projectName, currency: b.currency, bookingValue: b.bookingValue, commissionExpected: b.commissionExpected, commissionReceived: b.commissionReceived, commissionReceivedAt: b.commissionReceivedAt ? b.commissionReceivedAt.toISOString() : null, status: b.status }))}
      projects={projects.map((p) => ({ id: p.id, label: `${p.name} · ${names[p.developerId] ?? "Unknown developer"}` }))}
    />
  );
}
