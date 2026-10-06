import { randomUUID } from "node:crypto";
import { StaffNotFoundError, StaffStateError } from "./errors.ts";
import type { NewStaffMember, StaffPatch, StaffRepository } from "./repository.ts";
import type { StaffMember } from "./types.ts";

/** In-memory StaffRepository for unit tests: same contract and same rules as the PostgreSQL adapter. */
export function createInMemoryStaffRepository(): StaffRepository {
  const members = new Map<string, StaffMember>();
  const copy = (member: StaffMember): StaffMember => ({ ...member });

  return {
    async create(input: NewStaffMember) {
      for (const existing of members.values()) {
        if (existing.userId === input.userId) throw new StaffStateError("That person is already on the team.");
      }
      const member: StaffMember = {
        id: randomUUID(),
        userId: input.userId,
        displayName: input.displayName,
        email: input.email,
        role: input.role,
        active: true,
        createdBy: input.createdBy,
        deactivatedAt: null,
        deactivatedBy: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      members.set(member.id, member);
      return copy(member);
    },
    async getById(id) {
      const member = members.get(id);
      return member ? copy(member) : null;
    },
    async getByUserId(userId) {
      for (const member of members.values()) if (member.userId === userId) return copy(member);
      return null;
    },
    async list() {
      return [...members.values()]
        .map(copy)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
    },
    async update(id, patch: StaffPatch, at) {
      const member = members.get(id);
      if (!member) throw new StaffNotFoundError("Team member not found.");
      Object.assign(member, patch, { updatedAt: at });
      return copy(member);
    },
  };
}
