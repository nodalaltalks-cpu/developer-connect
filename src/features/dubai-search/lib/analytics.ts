import { LIMITS, readJson, writeJson } from "./storage.ts";

/**
 * Basic, isolated event tracking for this experiment. It records only in THIS browser (localStorage) so the owner can review how the
 * experience is used on their own device. It is not connected to Google Analytics, Meta, or any other analytics, and nothing is sent
 * to a server. No names, searches typed as free text or personal data are recorded: only the event name and small counts.
 */
export type EventName =
  | "home_section_click"
  | "nav_click"
  | "search_submit"
  | "filter_used"
  | "result_opened"
  | "compare_added"
  | "compare_opened"
  | "source_outbound_click"
  | "property_saved"
  | "search_saved"
  | "listing_added"
  | "csv_imported"
  | "visit";

export interface StoredEvent {
  name: EventName;
  at: string;
  detail?: string;
}

export function track(name: EventName, detail?: string): void {
  const events = readJson<StoredEvent[]>("events", []);
  events.push({ name, at: new Date().toISOString(), ...(detail ? { detail: detail.slice(0, 40) } : {}) });
  writeJson("events", events.slice(-LIMITS.events));
}

export interface EventSummary {
  counts: Record<string, number>;
  visits: number;
  returningDays: number;
}

export function summariseEvents(events: readonly StoredEvent[]): EventSummary {
  const counts: Record<string, number> = {};
  const days = new Set<string>();
  for (const e of events) {
    counts[e.name] = (counts[e.name] ?? 0) + 1;
    if (e.name === "visit") days.add(e.at.slice(0, 10));
  }
  return { counts, visits: counts.visit ?? 0, returningDays: days.size };
}
