import { formatCallDuration } from "@/lib/leads/call-analytics";
import type { CallView } from "@/lib/leads/call-view";
import { wasConnected } from "@/lib/leads/call-view";
import { formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";

/**
 * A lead's calls, oldest first, with the summary an employee needs at a glance: how many attempts, when the last one
 * was, whether the client was ever reached, how long they talked, and the last outcome. Pure and server-rendered; every
 * value is the provider's or the person's recorded outcome — nothing here is typed in.
 */

const STATUS_WORD: Record<CallView["status"], string> = {
  INITIATED: "Dialing",
  RINGING: "Ringing",
  CONNECTED: "Connected",
  COMPLETED: "Connected",
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  FAILED: "Failed",
  REJECTED: "Rejected",
};

export function CallHistoryCard({ calls, names }: { calls: CallView[]; names?: Record<string, string> }) {
  const chronological = [...calls].sort((a, b) => a.initiatedAt.localeCompare(b.initiatedAt));
  const connected = chronological.filter(wasConnected);
  const last = chronological.at(-1) ?? null;
  const talk = connected.reduce((n, c) => n + (c.durationSeconds ?? 0), 0);

  return (
    <section className="rounded-lg border border-border p-4" aria-labelledby="call-history-heading">
      <h2 id="call-history-heading" className="text-sm font-semibold text-foreground">
        Calls
      </h2>
      {chronological.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No tracked calls yet. Only calls made through the internal dialer appear here.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-foreground">
            {chronological.length} {chronological.length === 1 ? "attempt" : "attempts"} · {connected.length} connected
            {connected.length > 0 ? ` · ${formatCallDuration(talk)} talk time` : ""}
          </p>
          {last && (
            <p className="text-xs text-muted-foreground">
              Last call {formatDateTimeFull(new Date(last.initiatedAt))} — {STATUS_WORD[last.status]}
              {last.disposition ? ` · ${formatEnumLabel(last.disposition)}` : ""}
            </p>
          )}
          <ol className="mt-3 space-y-2">
            {chronological.map((call) => (
              <li key={call.id} className="border-l-2 border-border pl-3 text-sm">
                <p className="text-foreground">
                  {STATUS_WORD[call.status]}
                  {wasConnected(call) && call.durationSeconds !== null ? ` · ${formatCallDuration(call.durationSeconds)}` : ""}
                  {call.disposition ? ` · ${formatEnumLabel(call.disposition)}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTimeFull(new Date(call.initiatedAt))} · {names?.[call.staffUserId] ?? "Team member"}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
