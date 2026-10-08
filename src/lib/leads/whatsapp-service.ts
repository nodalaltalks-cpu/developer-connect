import { LeadNotFoundError, LeadStateError } from "./errors.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { assertWorkingActor } from "./lead-access.ts";
import type { LeadRepositories } from "./repository.ts";
import type { LeadActor } from "./types.ts";

/**
 * WhatsApp is OPENED to a lead's number; Developer Connects has no WhatsApp API, so it can never know a message was sent.
 * This records exactly what happened - WHATSAPP_OPENED - and nothing more. It says nothing about a message, a reply or a
 * delivery. (If an API is ever integrated, a separate WHATSAPP_MESSAGE_SENT event would be added then, never inferred.)
 * Same authorization as logging a contact: the lead's owner or the Founder, and a team member with unresolved missed
 * follow-ups elsewhere is held to the same rule as every other lead action.
 */
export async function recordWhatsAppOpened(repos: LeadRepositories, leadId: string, actor: LeadActor, now: Date = new Date()): Promise<void> {
  assertWorkingActor(actor);
  await repos.transaction(async (tx) => {
    const lead = await tx.leads.getById(leadId);
    if (!lead) throw new LeadNotFoundError("Lead not found.");
    await guardLeadAction(tx, actor, lead, "LOG_CONTACT", now);
    if (lead.erasedAt || !lead.phoneE164) throw new LeadStateError("This lead has no phone number to open WhatsApp to.");
    await tx.events.append({ leadId, eventType: "WHATSAPP_OPENED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null, fromStatus: null, toStatus: null, payload: {}, createdAt: now });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
  });
}
