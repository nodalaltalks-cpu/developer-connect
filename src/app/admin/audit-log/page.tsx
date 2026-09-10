import { getAuditLog } from "@/lib/admin-analytics/queries";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";

export default async function AdminAuditLogPage() {
  const entries = await getAuditLog();

  return (
    <div>
      <SectionHeading
        title="Audit Log"
        description="Every verification status change ever recorded — append-only at the database level (Phase 2B.1), so this list can never have been edited after the fact."
      />

      {entries.length === 0 ? (
        <EmptyState
          title="No verification history yet"
          description="Every approve, reject, and status change will appear here the moment the first website candidate is reviewed."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3 text-sm">
              <p className="text-foreground">
                <span className="font-medium">{entry.developerName ?? "Unknown developer"}</span>
                {": "}
                {entry.previousStatus ?? "—"} → <span className="font-medium">{entry.newStatus}</span>
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {entry.reason} · {entry.actorType} ({entry.actorId}) ·{" "}
                {entry.createdAt.toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
