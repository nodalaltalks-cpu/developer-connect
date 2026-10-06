import type { LeadActivitySummary, LeadEvent } from "./types.ts";

/**
 * The facts the Today queue needs from a lead's timeline, computed from its
 * events. This is the REFERENCE definition: the in-memory repository uses it
 * directly, and the PostgreSQL repository computes the same numbers with SQL
 * aggregates — an integration test asserts the two agree on the same data.
 */
export function summariseEvents(leadId: string, events: LeadEvent[]): LeadActivitySummary {
  const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let lastContactAt: Date | null = null;
  let contactAttempts = 0;
  let lastBuyerActivityAt: Date | null = null;
  let lastBuyerActivityDeveloperName: string | null = null;
  let firstDeveloperName: string | null = null;

  for (const event of ordered) {
    if (event.eventType === "CONTACT_LOGGED") {
      contactAttempts += 1;
      lastContactAt = event.createdAt;
    }
    const buyerActivity =
      event.actorType === "BUYER" &&
      (event.eventType === "LEAD_CREATED" ||
        event.eventType === "LEAD_CAPTURED" ||
        event.eventType === "DEVELOPER_CONNECT_REQUESTED" ||
        event.eventType === "OFFICIAL_WEBSITE_CLICKED");
    if (buyerActivity) lastBuyerActivityAt = event.createdAt;

    // OFFICIAL_WEBSITE_CLICKED is the pre-Stage-5 form of the same fact; both name the developer the buyer asked about.
    if (event.eventType === "DEVELOPER_CONNECT_REQUESTED" || event.eventType === "OFFICIAL_WEBSITE_CLICKED") {
      const name = typeof event.payload.developerName === "string" ? event.payload.developerName : null;
      lastBuyerActivityDeveloperName = name;
      if (firstDeveloperName === null && name !== null) firstDeveloperName = name;
    }
  }

  return { leadId, lastContactAt, contactAttempts, lastBuyerActivityAt, lastBuyerActivityDeveloperName, firstDeveloperName };
}
