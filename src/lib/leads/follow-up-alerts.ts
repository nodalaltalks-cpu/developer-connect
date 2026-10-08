/**
 * Follow-up alerts: what should interrupt a team member RIGHT NOW. Pure, so the rules are testable without a browser.
 *
 *  - DUE: a scheduled follow-up whose time has arrived. One strong alert when it arrives.
 *  - MISSED: a follow-up that has gone unresolved past its time. A second, stronger alert, because the rest of the workspace is closed
 *    until it is cleared.
 *
 * Each (follow-up, kind) alerts ONCE per device, remembered in the browser, so a phone does not buzz again for the same thing on every
 * poll. Resolving or rescheduling a follow-up gives it a new time, and therefore a new alert at the new time.
 */

export type AlertKind = "DUE" | "MISSED";

export interface AlertItem {
  followUpId: string;
  leadId: string;
  /** The lead's name, or null when it has none. */
  name: string | null;
  /** The scheduled time (ISO). */
  scheduledAt: string;
  kind: AlertKind;
}

/** Strong, unmistakable, still bounded (about three seconds): a long buzz pattern that repeats three times, then a final long one. */
export const VIBRATION_PATTERN: readonly number[] = [500, 200, 500, 200, 500, 200, 900];

/** Missed gets the strongest pattern. */
export const MISSED_VIBRATION_PATTERN: readonly number[] = [700, 200, 700, 200, 700, 200, 700, 200, 1200];

export function alertKey(item: Pick<AlertItem, "followUpId" | "scheduledAt" | "kind">): string {
  // The time is part of the key: a rescheduled follow-up is a new thing to be alerted about.
  return `${item.kind}:${item.followUpId}:${item.scheduledAt}`;
}

/** Which of `items` have not been alerted yet, MISSED first (they block everything else), then the earliest due. */
export function newAlerts(items: readonly AlertItem[], alerted: ReadonlySet<string>): AlertItem[] {
  return items
    .filter((item) => !alerted.has(alertKey(item)))
    .sort((a, b) => (a.kind === b.kind ? Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) : a.kind === "MISSED" ? -1 : 1));
}

/** Keeps the remembered set from growing without bound: only the most recent entries survive. */
export function trimAlerted(keys: readonly string[], max = 200): string[] {
  return keys.length > max ? keys.slice(keys.length - max) : [...keys];
}

export function patternFor(kind: AlertKind): readonly number[] {
  return kind === "MISSED" ? MISSED_VIBRATION_PATTERN : VIBRATION_PATTERN;
}

export function alertTitle(item: AlertItem): string {
  const who = item.name ?? "a lead";
  return item.kind === "MISSED" ? `Missed follow-up: ${who}` : `Follow-up due now: ${who}`;
}

/** What the API may return per item: the minimum needed to alert, never a phone number or lead details. */
export function toAlertItems(
  missed: ReadonlyArray<{ followUp: { id: string; leadId: string; scheduledAt: Date }; lead: { name: string | null } }>,
  due: ReadonlyArray<{ followUp: { id: string; leadId: string; scheduledAt: Date }; lead: { name: string | null } }>,
  now: Date,
): AlertItem[] {
  const out: AlertItem[] = [];
  for (const row of missed) out.push({ followUpId: row.followUp.id, leadId: row.followUp.leadId, name: row.lead.name, scheduledAt: row.followUp.scheduledAt.toISOString(), kind: "MISSED" });
  // "Due" means the time has arrived; one that is merely coming up is not an interruption yet.
  for (const row of due) if (row.followUp.scheduledAt.getTime() <= now.getTime()) out.push({ followUpId: row.followUp.id, leadId: row.followUp.leadId, name: row.lead.name, scheduledAt: row.followUp.scheduledAt.toISOString(), kind: "DUE" });
  return out;
}
