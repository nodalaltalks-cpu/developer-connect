import { randomUUID } from "node:crypto";
import type { Developer, WebsiteCandidate, Evidence, VerificationEvent, DeveloperEditEvent } from "./types.ts";
import type {
  DeveloperRepository,
  WebsiteCandidateRepository,
  EvidenceRepository,
  VerificationEventRepository,
  DeveloperEditEventRepository,
  NewDeveloperInput,
  NewWebsiteCandidateInput,
  NewEvidenceInput,
  NewVerificationEventInput,
  NewDeveloperEditEventInput,
  DeveloperConnectRepositories,
  PublishedDeveloperEntry,
  PublishedDirectoryFilter,
  PublishedLocation,
} from "./repository.ts";
import { NotFoundError } from "./errors.ts";
import { normalizeUrl } from "./url.ts";
import { selectInitialHomepageDevelopers } from "./search-service.ts";

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Same order as the Postgres query: lowercased display name, then display name, then id. */
function comparePublishedByName(a: PublishedDeveloperEntry, b: PublishedDeveloperEntry): number {
  return (
    compareText(a.developer.displayName.toLowerCase(), b.developer.displayName.toLowerCase()) ||
    compareText(a.developer.displayName, b.developer.displayName) ||
    compareText(a.developer.id, b.developer.id)
  );
}

function matchesPublishedFilter(
  { developer, verifiedCandidate }: PublishedDeveloperEntry,
  filter: PublishedDirectoryFilter,
): boolean {
  if (filter.country && developer.country.toLowerCase() !== filter.country.toLowerCase()) return false;
  if (filter.state && developer.state.toLowerCase() !== filter.state.toLowerCase()) return false;
  if (filter.city && developer.city.toLowerCase() !== filter.city.toLowerCase()) return false;
  if (!filter.query) return true;
  const haystack = [
    developer.displayName,
    developer.legalName ?? "",
    developer.city,
    developer.state,
    developer.country,
    verifiedCandidate.canonicalDomain,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(filter.query.toLowerCase());
}

/**
 * In-memory reference implementation of the repository interfaces.
 *
 * This exists so the domain/business logic in this module can run and be
 * tested today without a production storage decision having been made.
 * It is NOT a production persistence layer: data does not survive a
 * process restart, and there is no durability or multi-instance
 * concurrency control. See the Phase 2B report for the open decision on
 * production storage.
 */
export function createInMemoryRepositories(): DeveloperConnectRepositories {
  const developers = new Map<string, Developer>();
  const candidates = new Map<string, WebsiteCandidate>();
  const evidenceRecords = new Map<string, Evidence>();
  const events = new Map<string, VerificationEvent>();
  const developerEditEventRecords = new Map<string, DeveloperEditEvent>();

  const developerRepository: DeveloperRepository = {
    async create(input: NewDeveloperInput) {
      const now = new Date();
      const developer: Developer = {
        id: randomUUID(),
        legalName: input.legalName,
        displayName: input.displayName,
        slug: input.slug,
        city: input.city,
        state: input.state,
        country: input.country,
        headquartersLocation: input.headquartersLocation,
        status: "ACTIVE",
        pendingChanges: null,
        createdAt: now,
        updatedAt: now,
      };
      developers.set(developer.id, developer);
      return developer;
    },
    async getById(id) {
      return developers.get(id) ?? null;
    },
    async getManyByIds(ids) {
      return ids.map((id) => developers.get(id)).filter((d): d is Developer => d !== undefined);
    },
    async getBySlug(slug) {
      for (const developer of developers.values()) {
        if (developer.slug === slug) return developer;
      }
      return null;
    },
    async slugExists(slug) {
      for (const developer of developers.values()) {
        if (developer.slug === slug) return true;
      }
      return false;
    },
    async list(filter) {
      return Array.from(developers.values()).filter((developer) => {
        if (filter?.city && developer.city !== filter.city) return false;
        if (filter?.status && developer.status !== filter.status) return false;
        return true;
      });
    },
    async update(id, patch) {
      const existing = developers.get(id);
      if (!existing) throw new NotFoundError(`Developer ${id} not found`);
      // Mirrors the real Postgres/Drizzle repository's `.set()` semantics:
      // a key whose value is `undefined` means "don't touch" (a plain
      // object spread would instead overwrite the field with `undefined`,
      // which the real backend never does) — this is what makes the fast
      // in-memory suite able to catch a clear-field regression instead of
      // silently passing while only the real database behaves
      // differently. `null` explicitly clears the field; `Developer`
      // itself represents "no value" as `undefined`, never `null`, so a
      // cleared field is normalized to `undefined` once applied.
      const applied: Partial<Developer> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        (applied as Record<string, unknown>)[key] = value === null ? undefined : value;
      }
      const updated: Developer = { ...existing, ...applied, updatedAt: new Date() };
      developers.set(id, updated);
      return updated;
    },
    async setPendingChanges(id, pendingChanges) {
      const existing = developers.get(id);
      if (!existing) throw new NotFoundError(`Developer ${id} not found`);
      const updated: Developer = { ...existing, pendingChanges, updatedAt: new Date() };
      developers.set(id, updated);
      return updated;
    },
    async publishPendingChanges(id) {
      const existing = developers.get(id);
      if (!existing || !existing.pendingChanges) {
        throw new NotFoundError(`Developer ${id} not found, or has no unpublished changes to republish`);
      }
      const updated: Developer = {
        ...existing,
        ...existing.pendingChanges,
        pendingChanges: null,
        updatedAt: new Date(),
      };
      developers.set(id, updated);
      return updated;
    },
    async search(query, limit = 20, geo) {
      // Mirrors postgres-repository.ts's search exactly: name matching is
      // the whole (lowercased) query, never tokenized — see that
      // function's comment for why a per-word OR is unsafe. Geography
      // alone gets tokenized, since "Mumbai" alone should find a real
      // Mumbai developer even inside a longer natural-language query.
      const needle = query.trim().toLowerCase();
      const geoTokens = needle.split(/\s+/).filter(Boolean);
      return Array.from(developers.values())
        .filter(
          (developer) =>
            developer.status === "ACTIVE" &&
            (developer.displayName.toLowerCase().includes(needle) ||
              (developer.legalName ?? "").toLowerCase().includes(needle) ||
              geoTokens.some(
                (token) =>
                  developer.city.toLowerCase().includes(token) ||
                  developer.state.toLowerCase().includes(token) ||
                  developer.country.toLowerCase().includes(token),
              )) &&
            (!geo?.country || developer.country.toLowerCase() === geo.country.toLowerCase()) &&
            (!geo?.state || developer.state.toLowerCase() === geo.state.toLowerCase()) &&
            (!geo?.city || developer.city.toLowerCase() === geo.city.toLowerCase()),
        )
        .slice(0, limit);
    },
    // The four published-directory reads mirror postgres-repository.ts:
    // same boundary, same filter semantics, same ordering and tie-break.
    async listPublishedPage(filter, page) {
      const matching = publishedEntries()
        .filter((entry) => matchesPublishedFilter(entry, filter))
        .sort(comparePublishedByName);
      return {
        entries: matching.slice(page.offset, page.offset + page.limit),
        total: matching.length,
      };
    },
    async samplePublished(seed, sampleSize) {
      return selectInitialHomepageDevelopers(
        publishedEntries().map((entry) => ({ ...entry, city: entry.developer.city })),
        seed,
        sampleSize,
      ).map(({ developer, verifiedCandidate }) => ({ developer, verifiedCandidate }));
    },
    async countPublished() {
      return publishedEntries().length;
    },
    async listPublishedLocations() {
      const seen = new Map<string, PublishedLocation>();
      for (const { developer } of publishedEntries()) {
        const location = { country: developer.country, state: developer.state, city: developer.city };
        seen.set(`${location.country}\u0000${location.state}\u0000${location.city}`, location);
      }
      return [...seen.values()].sort(
        (a, b) => compareText(a.country, b.country) || compareText(a.state, b.state) || compareText(a.city, b.city),
      );
    },
  };

  function publishedEntries(): PublishedDeveloperEntry[] {
    const verifiedByDeveloper = new Map<string, WebsiteCandidate>();
    for (const candidate of candidates.values()) {
      if (candidate.verificationStatus === "VERIFIED") verifiedByDeveloper.set(candidate.developerId, candidate);
    }
    const entries: PublishedDeveloperEntry[] = [];
    for (const developer of developers.values()) {
      const verifiedCandidate = verifiedByDeveloper.get(developer.id);
      if (developer.status === "ACTIVE" && verifiedCandidate) entries.push({ developer, verifiedCandidate });
    }
    return entries;
  }

  const candidateRepository: WebsiteCandidateRepository = {
    async create(input: NewWebsiteCandidateInput) {
      const now = new Date();
      const candidate: WebsiteCandidate = {
        id: randomUUID(),
        developerId: input.developerId,
        url: input.url,
        canonicalDomain: input.canonicalDomain,
        discoverySource: input.discoverySource,
        verificationStatus: input.verificationStatus,
        confidenceScore: input.confidenceScore,
        createdAt: now,
        updatedAt: now,
      };
      candidates.set(candidate.id, candidate);
      return candidate;
    },
    async getById(id) {
      return candidates.get(id) ?? null;
    },
    async listByDeveloper(developerId) {
      return Array.from(candidates.values()).filter((c) => c.developerId === developerId);
    },
    async listByStatuses(statuses) {
      return Array.from(candidates.values())
        .filter((c) => statuses.includes(c.verificationStatus))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByStatusesPage(statuses, page) {
      // Same order as the Postgres query: newest first, id descending as the tie-break.
      const matching = Array.from(candidates.values())
        .filter((c) => statuses.includes(c.verificationStatus))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || compareText(b.id, a.id));
      return { candidates: matching.slice(page.offset, page.offset + page.limit), total: matching.length };
    },
    async findByDomainAndPath(developerId, canonicalDomain, normalizedPath) {
      for (const candidate of candidates.values()) {
        if (candidate.developerId !== developerId) continue;
        if (candidate.canonicalDomain !== canonicalDomain) continue;
        if (normalizeUrl(candidate.url).normalizedPath === normalizedPath) {
          return candidate;
        }
      }
      return null;
    },
    async getVerifiedForDeveloper(developerId) {
      for (const candidate of candidates.values()) {
        if (candidate.developerId === developerId && candidate.verificationStatus === "VERIFIED") {
          return candidate;
        }
      }
      return null;
    },
    async findVerifiedByDomain(canonicalDomain) {
      for (const candidate of candidates.values()) {
        if (candidate.canonicalDomain === canonicalDomain && candidate.verificationStatus === "VERIFIED") {
          return candidate;
        }
      }
      return null;
    },
    async update(id, patch) {
      const existing = candidates.get(id);
      if (!existing) throw new NotFoundError(`Website candidate ${id} not found`);
      const updated: WebsiteCandidate = { ...existing, ...patch, updatedAt: new Date() };
      candidates.set(id, updated);
      return updated;
    },
  };

  const evidenceRepository: EvidenceRepository = {
    async add(input: NewEvidenceInput) {
      const record: Evidence = {
        id: randomUUID(),
        websiteCandidateId: input.websiteCandidateId,
        evidenceType: input.evidenceType,
        detail: input.detail,
        sourceUrl: input.sourceUrl,
        capturedAt: new Date(),
      };
      evidenceRecords.set(record.id, record);
      return record;
    },
    async listByCandidate(candidateId) {
      return Array.from(evidenceRecords.values()).filter(
        (e) => e.websiteCandidateId === candidateId,
      );
    },
  };

  const verificationEventRepository: VerificationEventRepository = {
    async append(input: NewVerificationEventInput) {
      const record: VerificationEvent = {
        id: randomUUID(),
        websiteCandidateId: input.websiteCandidateId,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        reason: input.reason,
        actorType: input.actorType,
        actorId: input.actorId,
        createdAt: new Date(),
      };
      events.set(record.id, record);
      return record;
    },
    async listByCandidate(candidateId) {
      return Array.from(events.values())
        .filter((e) => e.websiteCandidateId === candidateId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };

  const developerEditEventRepository: DeveloperEditEventRepository = {
    async append(input: NewDeveloperEditEventInput) {
      const record: DeveloperEditEvent = {
        id: randomUUID(),
        developerId: input.developerId,
        eventType: input.eventType,
        fieldName: input.fieldName,
        previousValue: input.previousValue,
        newValue: input.newValue,
        actorType: input.actorType,
        actorId: input.actorId,
        createdAt: new Date(),
      };
      developerEditEventRecords.set(record.id, record);
      return record;
    },
    async listByDeveloper(developerId) {
      return Array.from(developerEditEventRecords.values())
        .filter((e) => e.developerId === developerId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };

  const repositories: DeveloperConnectRepositories = {
    developers: developerRepository,
    candidates: candidateRepository,
    evidence: evidenceRepository,
    events: verificationEventRepository,
    developerEditEvents: developerEditEventRepository,
    // Single in-process Map-backed store with no concurrent writers to
    // interleave with, so there is nothing to isolate — running `fn`
    // directly is equivalent to a transaction here.
    async runInTransaction(fn) {
      return fn(repositories);
    },
  };

  return repositories;
}
