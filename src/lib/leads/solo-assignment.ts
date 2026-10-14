import type { StaffRepository } from "../staff/repository.ts";
import type { StaffMember } from "../staff/types.ts";
import type { LeadRepositories } from "./repository.ts";

/**
 * SOLO ASSIGNMENT. While the Founder is the only active person on the team (their own calling workspace, set up as a team member),
 * every new enquiry is assigned to them the moment it arrives, so it sits in their own "My leads" as New instead of waiting in an
 * unowned queue. The moment any other team member is active this rule steps aside and the Founder's normal choices apply (assign by
 * hand, or switch on automatic routing). Each assignment is a SYSTEM-authored OWNER_CHANGED event in the lead's history.
 *
 * Idempotent and safe to call repeatedly: it re-checks inside the transaction and only touches a lead that is still unowned, not
 * erased, not a bare prospect and not returned to the Founder.
 */

/** The Founder's own team record when they are the only active member; null when someone else is active or the Founder has none. */
export async function soloOwner(staff: Pick<StaffRepository, "list">, founderUserIds: () => Promise<string[]>): Promise<StaffMember | null> {
  const active = (await staff.list()).filter((member) => member.active);
  if (active.length === 0) return null;
  const founders = new Set(await founderUserIds());
  if (active.some((member) => !founders.has(member.userId))) return null;
  return active.find((member) => founders.has(member.userId)) ?? null;
}

/** Assigns one lead to the solo owner. Returns the owner's user id when it was assigned (now or already), otherwise null. */
export async function assignToSoloOwner(
  repos: LeadRepositories,
  staff: Pick<StaffRepository, "list">,
  founderUserIds: () => Promise<string[]>,
  leadId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const owner = await soloOwner(staff, founderUserIds);
  if (!owner) return null;
  const assigned = await repos.transaction(async (tx) => {
    const fresh = await tx.leads.getById(leadId);
    if (!fresh || fresh.erasedAt !== null || fresh.prospect) return false;
    if (fresh.ownerId === owner.userId) return true;
    if (fresh.ownerId !== null || fresh.returnedAt !== null) return false;
    await tx.events.append({
      leadId,
      eventType: "OWNER_CHANGED",
      actorType: "SYSTEM",
      actorId: null,
      developerId: null,
      fromStatus: null,
      toStatus: null,
      payload: { from: null, to: owner.userId, via: "SOLO_FOUNDER" },
      createdAt: now,
    });
    await tx.leads.update(leadId, { ownerId: owner.userId, lastActivityAt: now }, now);
    return true;
  });
  return assigned ? owner.userId : null;
}
