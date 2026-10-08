import { randomUUID } from "node:crypto";
import { StaffNotFoundError, StaffStateError } from "./errors.ts";
import type { NewStaffMember, StaffEventInput, StaffPatch, StaffRepository } from "./repository.ts";
import { PLACEHOLDER_PREFIX, type StaffEvent, type StaffMember } from "./types.ts";

/** In-memory StaffRepository for unit tests: same contract and same rules as the PostgreSQL adapter. */
export function createInMemoryStaffRepository(): StaffRepository {
  const members = new Map<string, StaffMember>();
  const events: StaffEvent[] = [];
  // Mirrors the database sequence: starts at 2 (DC1 is the Founder), only ever goes up, never reused.
  let nextNumber = 2;
  const copy = (member: StaffMember): StaffMember => ({ ...member });
  const emailKey = (email: string | null) => (email ? email.trim().toLowerCase() : null);
  const emit = (member: StaffMember, at: Date, inputs?: readonly StaffEventInput[]) => {
    for (const e of inputs ?? []) events.push({ id: randomUUID(), staffId: member.id, employeeId: member.employeeId, eventType: e.eventType, actorId: e.actorId, occurredAt: at, payload: { ...(e.payload ?? {}) } });
  };

  return {
    async create(input: NewStaffMember, eventInputs?: readonly StaffEventInput[]) {
      const email = emailKey(input.email);
      for (const existing of members.values()) {
        if (existing.userId === input.userId) throw new StaffStateError("That person is already on the team.");
        if (email && existing.status !== "EXITED" && emailKey(existing.email) === email) throw new StaffStateError("That email is already on the team.");
      }
      const status = input.status ?? "ACTIVE";
      const approved = status === "ACTIVE" ? (input.approvedAt ?? input.now) : (input.approvedAt ?? null);
      const member: StaffMember = {
        id: randomUUID(),
        employeeId: `DC${nextNumber++}`,
        userId: input.userId,
        displayName: input.displayName,
        email,
        role: input.role,
        status,
        active: status === "ACTIVE",
        createdBy: input.createdBy,
        joinedAt: status === "ACTIVE" ? (input.joinedAt ?? input.now) : (input.joinedAt ?? null),
        approvedAt: approved,
        approvedBy: approved ? (input.approvedBy ?? input.createdBy) : null,
        deactivatedAt: null,
        deactivatedBy: null,
        exitedAt: null,
        exitedBy: null,
        exitReason: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      members.set(member.id, member);
      emit(member, input.now, eventInputs);
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
    async getByEmployeeId(employeeId) {
      for (const member of members.values()) if (member.employeeId === employeeId) return copy(member);
      return null;
    },
    async findUnlinkedByEmail(email) {
      const key = emailKey(email);
      for (const member of members.values()) if (member.userId.startsWith(PLACEHOLDER_PREFIX) && member.status === "INVITED" && emailKey(member.email) === key) return copy(member);
      return null;
    },
    async linkIdentity(id, userId, at, eventInputs) {
      const member = members.get(id);
      if (!member || !member.userId.startsWith(PLACEHOLDER_PREFIX) || member.status !== "INVITED" || member.approvedAt === null) return null;
      for (const other of members.values()) if (other.userId === userId) throw new StaffStateError("That sign-in is already linked to a team member.");
      Object.assign(member, { userId, status: "ACTIVE", active: true, joinedAt: member.joinedAt ?? at, updatedAt: at });
      emit(member, at, eventInputs);
      return copy(member);
    },
    async list() {
      const number = (m: StaffMember) => Number(m.employeeId.slice(2));
      return [...members.values()].map(copy).sort((a, b) => Number(b.active) - Number(a.active) || number(a) - number(b));
    },
    async update(id, patch: StaffPatch, at, eventInputs) {
      const member = members.get(id);
      if (!member) throw new StaffNotFoundError("Team member not found.");
      if (member.status === "EXITED") throw new StaffStateError("An exited team member cannot be changed.");
      Object.assign(member, patch, { updatedAt: at });
      if (patch.status !== undefined) member.active = patch.status === "ACTIVE";
      emit(member, at, eventInputs);
      return copy(member);
    },
    async appendEvent(event) {
      const stored: StaffEvent = { ...event, id: randomUUID(), payload: { ...event.payload } };
      events.push(stored);
      return { ...stored };
    },
    async listEvents(staffId, limit) {
      return events.filter((e) => e.staffId === staffId).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).slice(0, limit).map((e) => ({ ...e }));
    },
  };
}
