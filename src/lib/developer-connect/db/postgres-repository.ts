import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client.ts";
import * as schema from "./schema.ts";
import type { Developer, WebsiteCandidate, Evidence, VerificationEvent, DeveloperEditEvent } from "../types.ts";
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
} from "../repository.ts";
import { NotFoundError } from "../errors.ts";
import { normalizeUrl } from "../url.ts";

type DbOrTx = NodePgDatabase<typeof schema>;

/** Escapes ILIKE wildcard/escape characters so user input is matched literally, not as a pattern. */
function likePattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `id` columns are Postgres `uuid`. A malformed id (e.g. a route param
 * that isn't actually a UUID) makes the driver throw "invalid input
 * syntax for type uuid" instead of just finding no row — this guard lets
 * getById-style lookups return null like any other not-found case.
 */
function isValidUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

function toDeveloper(row: typeof schema.developers.$inferSelect): Developer {
  return {
    id: row.id,
    legalName: row.legalName,
    displayName: row.displayName,
    slug: row.slug,
    city: row.city,
    state: row.state,
    country: row.country,
    headquartersLocation: row.headquartersLocation ?? undefined,
    status: row.status,
    pendingChanges: row.pendingChanges ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWebsiteCandidate(row: typeof schema.websiteCandidates.$inferSelect): WebsiteCandidate {
  return {
    id: row.id,
    developerId: row.developerId,
    url: row.url,
    canonicalDomain: row.canonicalDomain,
    discoverySource: row.discoverySource,
    verificationStatus: row.verificationStatus,
    confidenceScore: row.confidenceScore,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    lastCheckedAt: row.lastCheckedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvidence(row: typeof schema.evidence.$inferSelect): Evidence {
  return {
    id: row.id,
    websiteCandidateId: row.websiteCandidateId,
    evidenceType: row.evidenceType,
    detail: row.detail,
    sourceUrl: row.sourceUrl ?? undefined,
    capturedAt: row.capturedAt,
  };
}

function toVerificationEvent(row: typeof schema.verificationEvents.$inferSelect): VerificationEvent {
  return {
    id: row.id,
    websiteCandidateId: row.websiteCandidateId,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    reason: row.reason,
    actorType: row.actorType,
    actorId: row.actorId,
    createdAt: row.createdAt,
  };
}

function buildDeveloperRepository(db: DbOrTx): DeveloperRepository {
  return {
    async create(input: NewDeveloperInput) {
      const [row] = await db
        .insert(schema.developers)
        .values({ id: randomUUID(), ...input })
        .returning();
      return toDeveloper(row);
    },
    async getById(id) {
      if (!isValidUuid(id)) return null;
      const [row] = await db.select().from(schema.developers).where(eq(schema.developers.id, id));
      return row ? toDeveloper(row) : null;
    },
    async getManyByIds(ids) {
      const validIds = ids.filter(isValidUuid);
      if (validIds.length === 0) return [];
      const rows = await db.select().from(schema.developers).where(inArray(schema.developers.id, validIds));
      return rows.map(toDeveloper);
    },
    async getBySlug(slug) {
      const [row] = await db
        .select()
        .from(schema.developers)
        .where(eq(schema.developers.slug, slug));
      return row ? toDeveloper(row) : null;
    },
    async slugExists(slug) {
      const [row] = await db
        .select({ id: schema.developers.id })
        .from(schema.developers)
        .where(eq(schema.developers.slug, slug));
      return Boolean(row);
    },
    async list(filter) {
      const conditions = [];
      if (filter?.city) conditions.push(eq(schema.developers.city, filter.city));
      if (filter?.status) conditions.push(eq(schema.developers.status, filter.status));

      const query = db.select().from(schema.developers);
      const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query;
      return rows.map(toDeveloper);
    },
    async update(id, patch) {
      const [row] = await db
        .update(schema.developers)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.developers.id, id))
        .returning();
      if (!row) throw new NotFoundError(`Developer ${id} not found`);
      return toDeveloper(row);
    },
    async setPendingChanges(id, pendingChanges) {
      const [row] = await db
        .update(schema.developers)
        .set({ pendingChanges, updatedAt: new Date() })
        .where(eq(schema.developers.id, id))
        .returning();
      if (!row) throw new NotFoundError(`Developer ${id} not found`);
      return toDeveloper(row);
    },
    async publishPendingChanges(id) {
      // One atomic UPDATE: every published column is either replaced by
      // its pending value (if the JSONB patch has that key) or left
      // exactly as it was — never a partial/half-applied result, and
      // pending_changes is cleared in the very same statement. The
      // `isNotNull` guard means this is a genuine no-op (throws, doesn't
      // silently "succeed") when there is nothing to publish.
      const pc = schema.developers.pendingChanges;
      const [row] = await db
        .update(schema.developers)
        .set({
          legalName: sql`coalesce(${pc}->>'legalName', ${schema.developers.legalName})`,
          displayName: sql`coalesce(${pc}->>'displayName', ${schema.developers.displayName})`,
          city: sql`coalesce(${pc}->>'city', ${schema.developers.city})`,
          state: sql`coalesce(${pc}->>'state', ${schema.developers.state})`,
          country: sql`coalesce(${pc}->>'country', ${schema.developers.country})`,
          headquartersLocation: sql`coalesce(${pc}->>'headquartersLocation', ${schema.developers.headquartersLocation})`,
          pendingChanges: null,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.developers.id, id), isNotNull(schema.developers.pendingChanges)))
        .returning();
      if (!row) {
        throw new NotFoundError(`Developer ${id} not found, or has no unpublished changes to republish`);
      }
      return toDeveloper(row);
    },
    async search(query, limit = 20, geo) {
      // Name matching stays a single whole-query ILIKE, exactly as
      // before — precise, and what every existing caller (including the
      // shared test database's many "TEST —" fixtures) already relies
      // on. A per-word OR here was tried and reverted: tokenizing "Search
      // Co <marker>" into "search"/"co"/"marker" let the single word "co"
      // — a substring of countless unrelated company names — swamp the
      // result set on a database with real volume.
      //
      // Geography gets its OWN, separately tokenized OR: "developers in
      // Mumbai" or "Dubai builders" should still find a real Mumbai/Dubai
      // developer even though the full phrase never appears verbatim in
      // the city/state/country column — only "Mumbai"/"Dubai" does. This
      // is safe to tokenize because it's additive (an extra way to
      // MATCH, never a way to exclude) and a random test marker is never
      // going to coincidentally spell out a real place name.
      const namePattern = likePattern(query);
      const geoTokens = query.trim().split(/\s+/).filter(Boolean);
      const geoTokenConditions = geoTokens.flatMap((token) => {
        const pattern = likePattern(token);
        return [
          ilike(schema.developers.city, pattern),
          ilike(schema.developers.state, pattern),
          ilike(schema.developers.country, pattern),
        ];
      });
      const conditions = [
        eq(schema.developers.status, "ACTIVE"),
        or(
          ilike(schema.developers.displayName, namePattern),
          ilike(schema.developers.legalName, namePattern),
          ...geoTokenConditions,
        ),
      ];
      if (geo?.country) conditions.push(ilike(schema.developers.country, geo.country));
      if (geo?.state) conditions.push(ilike(schema.developers.state, geo.state));
      if (geo?.city) conditions.push(ilike(schema.developers.city, geo.city));
      // A cheap SQL-level pre-sort — NOT the final ranking (search-service.ts's
      // scoreDeveloperMatch owns that) — that only exists so a common short
      // query on a large table doesn't truncate at `limit` before the real
      // best (prefix) matches ever reach the app. Without this, a query
      // like "L" could fill the whole limit with arbitrary substring
      // matches ("XYZ Land Co", "ABC Ltd", ...) and never even fetch
      // "Lodha", since a plain ILIKE with no ORDER BY makes no promises
      // about which matching rows Postgres returns first.
      const prefixPriority = sql`case when ${schema.developers.displayName} ilike ${query + "%"} then 0 when ${schema.developers.legalName} ilike ${query + "%"} then 1 else 2 end`;
      const rows = await db
        .select()
        .from(schema.developers)
        .where(and(...conditions))
        .orderBy(prefixPriority, asc(schema.developers.displayName))
        .limit(limit);
      return rows.map(toDeveloper);
    },
  };
}

function buildWebsiteCandidateRepository(db: DbOrTx): WebsiteCandidateRepository {
  return {
    async create(input: NewWebsiteCandidateInput) {
      const [row] = await db
        .insert(schema.websiteCandidates)
        .values({ id: randomUUID(), ...input })
        .returning();
      return toWebsiteCandidate(row);
    },
    async getById(id) {
      if (!isValidUuid(id)) return null;
      const [row] = await db
        .select()
        .from(schema.websiteCandidates)
        .where(eq(schema.websiteCandidates.id, id));
      return row ? toWebsiteCandidate(row) : null;
    },
    async listByDeveloper(developerId) {
      const rows = await db
        .select()
        .from(schema.websiteCandidates)
        .where(eq(schema.websiteCandidates.developerId, developerId));
      return rows.map(toWebsiteCandidate);
    },
    async listByStatuses(statuses) {
      const rows = await db
        .select()
        .from(schema.websiteCandidates)
        .where(inArray(schema.websiteCandidates.verificationStatus, statuses))
        .orderBy(desc(schema.websiteCandidates.createdAt));
      return rows.map(toWebsiteCandidate);
    },
    async findByDomainAndPath(developerId, canonicalDomain, normalizedPath) {
      // The path isn't its own column (only the full `url` is stored), so
      // candidates are narrowed by developer + domain in SQL, then the
      // small remaining set is matched on normalized path in application
      // code using the same normalizeUrl() the rest of the domain uses —
      // one source of truth for what "the same path" means.
      const rows = await db
        .select()
        .from(schema.websiteCandidates)
        .where(
          and(
            eq(schema.websiteCandidates.developerId, developerId),
            eq(schema.websiteCandidates.canonicalDomain, canonicalDomain),
          ),
        );
      const match = rows.find((row) => normalizeUrl(row.url).normalizedPath === normalizedPath);
      return match ? toWebsiteCandidate(match) : null;
    },
    async getVerifiedForDeveloper(developerId) {
      const [row] = await db
        .select()
        .from(schema.websiteCandidates)
        .where(
          and(
            eq(schema.websiteCandidates.developerId, developerId),
            eq(schema.websiteCandidates.verificationStatus, "VERIFIED"),
          ),
        );
      return row ? toWebsiteCandidate(row) : null;
    },
    async findVerifiedByDomain(canonicalDomain) {
      const [row] = await db
        .select()
        .from(schema.websiteCandidates)
        .where(
          and(
            eq(schema.websiteCandidates.canonicalDomain, canonicalDomain),
            eq(schema.websiteCandidates.verificationStatus, "VERIFIED"),
          ),
        );
      return row ? toWebsiteCandidate(row) : null;
    },
    async update(id, patch) {
      const [row] = await db
        .update(schema.websiteCandidates)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.websiteCandidates.id, id))
        .returning();
      if (!row) throw new NotFoundError(`Website candidate ${id} not found`);
      return toWebsiteCandidate(row);
    },
  };
}

function buildEvidenceRepository(db: DbOrTx): EvidenceRepository {
  return {
    async add(input: NewEvidenceInput) {
      const [row] = await db
        .insert(schema.evidence)
        .values({ id: randomUUID(), ...input })
        .returning();
      return toEvidence(row);
    },
    async listByCandidate(candidateId) {
      const rows = await db
        .select()
        .from(schema.evidence)
        .where(eq(schema.evidence.websiteCandidateId, candidateId));
      return rows.map(toEvidence);
    },
  };
}

function buildVerificationEventRepository(db: DbOrTx): VerificationEventRepository {
  return {
    // Note: there is deliberately no update/delete here to match the
    // interface, and the database additionally enforces this with a
    // trigger (see migrations) that rejects UPDATE/DELETE outright.
    async append(input: NewVerificationEventInput) {
      const [row] = await db
        .insert(schema.verificationEvents)
        .values({ id: randomUUID(), ...input })
        .returning();
      return toVerificationEvent(row);
    },
    async listByCandidate(candidateId) {
      const rows = await db
        .select()
        .from(schema.verificationEvents)
        .where(eq(schema.verificationEvents.websiteCandidateId, candidateId));
      return rows
        .map(toVerificationEvent)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

function toDeveloperEditEvent(row: typeof schema.developerEditEvents.$inferSelect): DeveloperEditEvent {
  return {
    id: row.id,
    developerId: row.developerId,
    eventType: row.eventType,
    fieldName: row.fieldName,
    previousValue: row.previousValue,
    newValue: row.newValue,
    actorType: row.actorType,
    actorId: row.actorId,
    createdAt: row.createdAt,
  };
}

function buildDeveloperEditEventRepository(db: DbOrTx): DeveloperEditEventRepository {
  return {
    // Note: there is deliberately no update/delete here to match the
    // interface, and the database additionally enforces this with a
    // trigger (see migrations) that rejects UPDATE/DELETE outright.
    async append(input: NewDeveloperEditEventInput) {
      const [row] = await db
        .insert(schema.developerEditEvents)
        .values({ id: randomUUID(), ...input })
        .returning();
      return toDeveloperEditEvent(row);
    },
    async listByDeveloper(developerId) {
      const rows = await db
        .select()
        .from(schema.developerEditEvents)
        .where(eq(schema.developerEditEvents.developerId, developerId));
      return rows
        .map(toDeveloperEditEvent)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

function buildRepositories(db: DbOrTx): DeveloperConnectRepositories {
  const repositories: DeveloperConnectRepositories = {
    developers: buildDeveloperRepository(db),
    candidates: buildWebsiteCandidateRepository(db),
    evidence: buildEvidenceRepository(db),
    events: buildVerificationEventRepository(db),
    developerEditEvents: buildDeveloperEditEventRepository(db),
    async runInTransaction(fn) {
      // node-postgres transactions nest via SAVEPOINT automatically when
      // `db.transaction` is called while already inside one, so a service
      // function calling another transactional service function composes
      // correctly into a single top-level transaction.
      return db.transaction((tx) => fn(buildRepositories(tx)));
    },
  };
  return repositories;
}

/**
 * Production persistence adapter. Implements the exact same
 * `DeveloperConnectRepositories` contract as the in-memory reference
 * implementation — no service function needs to know which one it's
 * talking to.
 */
export function createPostgresRepositories(): DeveloperConnectRepositories {
  return buildRepositories(getDb());
}
