import type { ContactHistoryEntryView } from "@/app/admin/_actions/contact-actions";

const EVENT_LABEL: Record<ContactHistoryEntryView["eventType"], string> = {
  STATUS_CHANGE: "", // uses newStatus's own label instead — see labelFor below
  TRASHED: "Moved to Trash",
  RESTORED: "Restored from Trash",
  PERMANENT_DELETE: "Deleted permanently",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

function labelFor(entry: ContactHistoryEntryView): string {
  if (entry.eventType === "STATUS_CHANGE") {
    return entry.newStatus ? (STATUS_LABEL[entry.newStatus] ?? entry.newStatus) : "Status changed";
  }
  return EVENT_LABEL[entry.eventType];
}

/**
 * Newest first (Part 8's preference), one flat scannable list — no
 * timeline graphics, no nesting. Every entry shows the real database
 * timestamp (never a browser-generated one — the value comes straight
 * from contact_status_history.createdAt) and the actor resolved from the
 * existing Clerk identity, never a hardcoded name (Part 10).
 */
export function ContactActivityHistory({ history }: { history: ContactHistoryEntryView[] }) {
  if (history.length === 0) {
    return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {history.map((entry) => (
        <li key={entry.id} className="border-t border-border pt-2.5 first:border-t-0 first:pt-0">
          <p className="text-xs text-muted-foreground">
            {entry.createdAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            {" · "}
            {entry.createdAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            {" · "}
            {entry.actorDisplayName}
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{labelFor(entry)}</p>
          {entry.note && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-medium">Internal note:</span> &ldquo;{entry.note}&rdquo;
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
