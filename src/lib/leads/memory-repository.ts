import { randomUUID } from "node:crypto";
import { summariseEvents } from "./activity-summary.ts";
import { LeadNotFoundError } from "./errors.ts";
import { QUEUE_EXCLUDED_STATUSES } from "./queue-config.ts";
import { compareForView, countLeads, matchesView } from "./lead-views.ts";
import type { BookingPatch, LeadPatch, LeadRepositories, NewBooking, NewConsent, NewLeadEvent, NewLeadInput, NewTouch } from "./repository.ts";
import type { Booking, Lead, LeadConsent, LeadEvent, MarketingTouch } from "./types.ts";

/**
 * In-memory implementation of the lead repositories, for unit tests. It
 * honours the same guarantees the PostgreSQL adapter and database triggers
 * provide — unique phone, immutable events/touches/consents, atomic
 * transactions — so the service layer can be tested without a database.
 */
export function createInMemoryLeadRepositories(
  developerNames: Record<string, string> = {},
): LeadRepositories & { snapshot(): { leads: Lead[]; events: LeadEvent[] } } {
  const state = {
    leads: new Map<string, Lead>(),
    events: [] as LeadEvent[],
    touches: new Map<string, MarketingTouch>(),
    consents: [] as LeadConsent[],
    bookings: new Map<string, Booking>(),
  };

  const cloneState = () => ({
    leads: new Map([...state.leads].map(([id, lead]) => [id, { ...lead }])),
    events: state.events.map((event) => ({ ...event, payload: structuredClone(event.payload) })),
    touches: new Map(state.touches),
    consents: state.consents.map((consent) => ({ ...consent })),
    bookings: new Map([...state.bookings].map(([id, booking]) => [id, { ...booking }])),
  });

  // A promise-chain mutex so concurrent transactions run one at a time, like row locks would serialise them.
  let queue: Promise<unknown> = Promise.resolve();

  const repos: LeadRepositories = {
    leads: {
      async upsertByPhone(input: NewLeadInput) {
        const existing = [...state.leads.values()].find((lead) => lead.phoneE164 === input.phoneE164);
        if (existing) return { lead: { ...existing }, created: false };
        const lead: Lead = {
          id: randomUUID(),
          name: input.name,
          phoneE164: input.phoneE164,
          email: input.email,
          contactPreference: input.contactPreference,
          status: "NEW",
          temperature: null,
          ownerId: null,
          developerId: input.developerId,
          sourceCta: input.sourceCta,
          location: null,
          budgetMin: null,
          budgetMax: null,
          budgetCurrency: null,
          configuration: null,
          propertyType: null,
          purpose: null,
          timeline: null,
          sessionId: input.sessionId,
          userId: input.userId,
          firstTouchId: null,
          lastTouchId: null,
          nextFollowUpAt: null,
          lastActivityAt: input.now,
          erasedAt: null,
          createdAt: input.now,
          updatedAt: input.now,
        };
        state.leads.set(lead.id, lead);
        return { lead: { ...lead }, created: true };
      },
      async getById(id) {
        const lead = state.leads.get(id);
        return lead ? { ...lead } : null;
      },
      async update(id: string, patch: LeadPatch, at: Date) {
        const lead = state.leads.get(id);
        if (!lead) throw new LeadNotFoundError("Lead not found.");
        // A phone number may only be cleared (erasure) or left alone — never re-pointed at another lead's number.
        if (patch.phoneE164 && [...state.leads.values()].some((other) => other.id !== id && other.phoneE164 === patch.phoneE164)) {
          throw new Error("duplicate phone");
        }
        Object.assign(lead, patch, { updatedAt: at });
        return { ...lead };
      },
      async listForQueue(limit) {
        return [...state.leads.values()]
          .filter((lead) => !lead.erasedAt && !QUEUE_EXCLUDED_STATUSES.includes(lead.status))
          .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
          .slice(0, limit)
          .map((lead) => ({ ...lead }));
      },
      async list(query) {
        const matching = [...state.leads.values()]
          .filter((lead) => matchesView(lead, query.view, query.now, query.endOfToday))
          .sort(compareForView(query.view));
        return { total: matching.length, leads: matching.slice(query.offset, query.offset + query.limit).map((lead) => ({ ...lead })) };
      },
      async counts(now, endOfToday) {
        return countLeads([...state.leads.values()], now, endOfToday);
      },
      async developerNames(ids) {
        return Object.fromEntries(ids.filter((id) => id in developerNames).map((id) => [id, developerNames[id]]));
      },
    },

    events: {
      async append(event: NewLeadEvent) {
        const stored: LeadEvent = { id: randomUUID(), ...event, payload: structuredClone(event.payload) };
        state.events.push(stored);
        return { ...stored, payload: structuredClone(stored.payload) };
      },
      async listByLead(leadId) {
        return state.events
          .filter((event) => event.leadId === leadId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((event) => ({ ...event, payload: structuredClone(event.payload) }));
      },
      async summarise(leadIds) {
        return leadIds.map((id) => summariseEvents(id, state.events.filter((event) => event.leadId === id)));
      },
      async redactPayloads(leadId, redact) {
        let changed = 0;
        for (const event of state.events) {
          if (event.leadId !== leadId) continue;
          const next = redact({ ...event, payload: structuredClone(event.payload) });
          if (JSON.stringify(next) !== JSON.stringify(event.payload)) {
            event.payload = structuredClone(next);
            changed += 1;
          }
        }
        return changed;
      },
    },

    touches: {
      async create(touch: NewTouch, fallbackOccurredAt: Date) {
        const stored: MarketingTouch = {
          id: touch.id ?? randomUUID(),
          sessionId: touch.sessionId,
          occurredAt: touch.occurredAt ?? fallbackOccurredAt,
          landingPath: touch.landingPath,
          referrer: touch.referrer,
          utmSource: touch.utmSource,
          utmMedium: touch.utmMedium,
          utmCampaign: touch.utmCampaign,
          utmContent: touch.utmContent,
          utmTerm: touch.utmTerm,
          gclid: touch.gclid,
          fbclid: touch.fbclid,
        };
        state.touches.set(stored.id, stored);
        return { ...stored };
      },
      async getById(id) {
        const touch = state.touches.get(id);
        return touch ? { ...touch } : null;
      },
      async countBySessionSince(sessionId, since) {
        return [...state.touches.values()].filter((touch) => touch.sessionId === sessionId && touch.occurredAt.getTime() >= since.getTime()).length;
      },
    },

    consents: {
      async create(consent: NewConsent) {
        const stored: LeadConsent = { id: randomUUID(), ...consent, withdrawnAt: null };
        state.consents.push(stored);
        return { ...stored };
      },
      async listByLead(leadId) {
        return state.consents.filter((consent) => consent.leadId === leadId).map((consent) => ({ ...consent }));
      },
      async withdrawActive(leadId, at) {
        const withdrawn: LeadConsent[] = [];
        for (const consent of state.consents) {
          if (consent.leadId === leadId && consent.withdrawnAt === null) {
            consent.withdrawnAt = at;
            withdrawn.push({ ...consent });
          }
        }
        return withdrawn;
      },
    },

    bookings: {
      async create(booking: NewBooking) {
        const stored: Booking = {
          id: randomUUID(),
          leadId: booking.leadId,
          developerId: booking.developerId,
          projectName: booking.projectName,
          status: "BOOKED",
          bookedAt: booking.bookedAt,
          currency: booking.currency,
          bookingValue: booking.bookingValue,
          commissionExpected: booking.commissionExpected,
          commissionReceived: 0,
          commissionReceivedAt: null,
          createdBy: booking.createdBy,
          createdAt: booking.now,
          updatedAt: booking.now,
        };
        state.bookings.set(stored.id, stored);
        return { ...stored };
      },
      async getById(id) {
        const booking = state.bookings.get(id);
        return booking ? { ...booking } : null;
      },
      async update(id: string, patch: BookingPatch, at: Date) {
        const booking = state.bookings.get(id);
        if (!booking) throw new LeadNotFoundError("Booking not found.");
        Object.assign(booking, patch, { updatedAt: at });
        return { ...booking };
      },
      async listByLead(leadId) {
        return [...state.bookings.values()].filter((booking) => booking.leadId === leadId).map((booking) => ({ ...booking }));
      },
    },

    async transaction<T>(work: (inner: LeadRepositories) => Promise<T>): Promise<T> {
      const run = async () => {
        const before = cloneState();
        try {
          return await work(repos);
        } catch (error) {
          state.leads = before.leads;
          state.events = before.events;
          state.touches = before.touches;
          state.consents = before.consents;
          state.bookings = before.bookings;
          throw error;
        }
      };
      const result = queue.then(run, run);
      queue = result.catch(() => undefined);
      return result;
    },
  };

  return Object.assign(repos, {
    snapshot: () => ({
      leads: [...state.leads.values()].map((lead) => ({ ...lead })),
      events: state.events.map((event) => ({ ...event, payload: structuredClone(event.payload) })),
    }),
  });
}
