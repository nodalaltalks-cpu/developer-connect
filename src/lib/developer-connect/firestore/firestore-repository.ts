import { createHash, randomUUID } from "node:crypto";
import { directCtx, type FsCtx } from "../../firestore/tx.ts";
import { getFirestoreDb } from "../../firestore/client.ts";
import { markSnapshotStale, readPublishedSnapshot, writePublishedSnapshot } from "./public-snapshot.ts";
import { compareCodePoints, monotonic, reqDate, safeId, toDate, toTs } from "../../firestore/convert.ts";
import type { Developer, DeveloperEditEvent, Evidence, VerificationEvent, WebsiteCandidate } from "../types.ts";
import type {
  DeveloperConnectRepositories,
  DeveloperEditEventRepository,
  DeveloperRepository,
  EvidenceRepository,
  NewDeveloperEditEventInput,
  NewDeveloperInput,
  NewEvidenceInput,
  NewVerificationEventInput,
  NewWebsiteCandidateInput,
  PublishedDeveloperEntry,
  PublishedDirectoryFilter,
  VerificationEventRepository,
  WebsiteCandidateRepository,
} from "../repository.ts";
import { NotFoundError } from "../errors.ts";
import { normalizeUrl } from "../url.ts";

/**
 * Firestore adapter for the developer directory and verification pipeline.
 *
 * Collections: developers, websiteCandidates, evidence, verificationEvents, developerEditEvents, plus
 * `lookups/devSlug:<slug>` (slug uniqueness).
 *
 * PUBLIC DIRECTORY SHAPE. PostgreSQL answered "published developers" with a join of developers and their one VERIFIED
 * candidate. Firestore has no joins, so the developer document carries a copy of its verified candidate (`verified`)
 * and a boolean `isPublished` (= ACTIVE and has a verified candidate). Both are maintained here, in the same
 * transaction as the change that affects them: whenever a candidate becomes (or stops being) VERIFIED or is edited
 * while VERIFIED, and whenever a developer's status changes. The public queries then read ONE collection query,
 * `isPublished == true` (~one read per published developer), and filter, order, page and sample in memory - the same
 * work the SQL did, over a few hundred rows, behind the existing five-minute public cache.
 *
 * "At most one VERIFIED candidate per developer" (a partial unique index in PostgreSQL) is enforced by refusing to
 * mark a second candidate VERIFIED while the developer document already holds a different one.
 */

const DEVELOPERS = "developers";
const CANDIDATES = "websiteCandidates";
const EVIDENCE = "evidence";
const VERIFICATION_EVENTS = "verificationEvents";
const EDIT_EVENTS = "developerEditEvents";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (id: string) => UUID_PATTERN.test(id);

const slugKey = (slug: string) => `devSlug:${safeId(slug)}`;

// --- mapping -------------------------------------------------------------------------------------------------------

type CandidateDoc = FirebaseFirestore.DocumentData;

function toCandidate(id: string, d: CandidateDoc): WebsiteCandidate {
  return {
    id,
    developerId: d.developerId,
    url: d.url,
    canonicalDomain: d.canonicalDomain,
    discoverySource: d.discoverySource,
    verificationStatus: d.verificationStatus,
    confidenceScore: d.confidenceScore,
    reviewedBy: d.reviewedBy ?? undefined,
    reviewedAt: toDate(d.reviewedAt) ?? undefined,
    rejectionReason: d.rejectionReason ?? undefined,
    lastCheckedAt: toDate(d.lastCheckedAt) ?? undefined,
    createdAt: reqDate(d.createdAt),
    updatedAt: reqDate(d.updatedAt),
  };
}

function candidateToDoc(c: WebsiteCandidate) {
  return {
    developerId: c.developerId,
    url: c.url,
    canonicalDomain: c.canonicalDomain,
    discoverySource: c.discoverySource,
    verificationStatus: c.verificationStatus,
    confidenceScore: c.confidenceScore,
    reviewedBy: c.reviewedBy ?? null,
    reviewedAt: toTs(c.reviewedAt ?? null),
    rejectionReason: c.rejectionReason ?? null,
    lastCheckedAt: toTs(c.lastCheckedAt ?? null),
    createdAt: toTs(c.createdAt),
    updatedAt: toTs(c.updatedAt),
  };
}

function toDeveloper(id: string, d: FirebaseFirestore.DocumentData): Developer {
  return {
    id,
    legalName: d.legalName ?? null,
    displayName: d.displayName,
    slug: d.slug,
    city: d.city,
    state: d.state,
    country: d.country,
    headquartersLocation: d.headquartersLocation ?? undefined,
    status: d.status,
    pendingChanges: d.pendingChanges ?? null,
    createdAt: reqDate(d.createdAt),
    updatedAt: reqDate(d.updatedAt),
  };
}

function developerToDoc(dev: Developer, verified: CandidateDoc | null) {
  return {
    legalName: dev.legalName,
    displayName: dev.displayName,
    // Lower-cased copies exist only so a name-ordered query is possible without a function index.
    displayNameLower: dev.displayName.toLowerCase(),
    slug: dev.slug,
    city: dev.city,
    cityLower: dev.city.toLowerCase(),
    state: dev.state,
    country: dev.country,
    headquartersLocation: dev.headquartersLocation ?? null,
    status: dev.status,
    pendingChanges: dev.pendingChanges ?? null,
    verified,
    isPublished: dev.status === "ACTIVE" && verified !== null,
    createdAt: toTs(dev.createdAt),
    updatedAt: toTs(dev.updatedAt),
  };
}

const candidateFromVerified = (developerId: string, v: CandidateDoc): WebsiteCandidate => toCandidate(v.id as string, { ...v, developerId });

// --- the developers collection, read as a whole (it is a few hundred rows) -----------------------------------------

/**
 * A short-lived in-process copy of the published list. Public pages are already cached for minutes upstream; this
 * stops several directory/search calls inside one render from each re-reading the collection. It is bypassed inside
 * transactions and dropped on every write made by this process.
 */
// Ten minutes: every page, the sitemap and each crawler hit reads all ~1,200 published developers, and a short copy made the
// free Firestore read quota run out. An admin edit still clears it on that instance at once (invalidate below).
const TTL_MS = 10 * 60_000;
let publishedCache: { at: number; rows: Array<{ id: string; data: FirebaseFirestore.DocumentData }> } | null = null;
let activeCache: { at: number; rows: Developer[] } | null = null;
// True after this process changed a developer: its next read rebuilds the stored snapshot from the collection instead of trusting it.
let snapshotDirty = false;
let pendingStaleMark: Promise<unknown> | null = null;
const invalidate = () => {
  publishedCache = null;
  activeCache = null;
  snapshotDirty = true;
  // Tell the other server instances the stored copy is out of date. Sent now and again a few seconds later, because this is
  // usually called inside a transaction that has not committed yet.
  const mark = () => markSnapshotStale(getFirestoreDb()).catch(() => undefined);
  pendingStaleMark = mark();
  setTimeout(() => void mark(), 3000);
};

async function loadPublished(ctx: FsCtx) {
  if (!ctx.inTx && publishedCache && Date.now() - publishedCache.at < TTL_MS) return publishedCache.rows;
  try {
    // The stored snapshot costs ~17 reads; rebuilding it from the collection costs one read per developer (~1,240).
    if (!ctx.inTx) {
      if (pendingStaleMark) await pendingStaleMark;
      if (!snapshotDirty) {
        const stored = await readPublishedSnapshot(ctx.db).catch(() => null);
        if (stored) {
          publishedCache = { at: Date.now(), rows: stored };
          return stored;
        }
      }
    }
    const views = await ctx.query(ctx.db.collection(DEVELOPERS).where("isPublished", "==", true));
    const rows = views.map((v) => ({ id: v.id, data: v.data()! }));
    if (!ctx.inTx) {
      publishedCache = { at: Date.now(), rows };
      snapshotDirty = false;
      await writePublishedSnapshot(ctx.db, rows).catch(() => undefined);
    }
    return rows;
  } catch (error) {
    // Firestore refused (free daily quota, outage): the last good copy beats an error page for a visitor or crawler.
    if (!ctx.inTx && publishedCache) return publishedCache.rows;
    throw error;
  }
}

async function loadActive(ctx: FsCtx): Promise<Developer[]> {
  if (!ctx.inTx && activeCache && Date.now() - activeCache.at < TTL_MS) return activeCache.rows;
  try {
    const views = await ctx.query(ctx.db.collection(DEVELOPERS).where("status", "==", "ACTIVE"));
    const rows = views.map((v) => toDeveloper(v.id, v.data()!));
    if (!ctx.inTx) activeCache = { at: Date.now(), rows };
    return rows;
  } catch (error) {
    if (!ctx.inTx && activeCache) return activeCache.rows;
    throw error;
  }
}

function toPublishedEntry(row: { id: string; data: FirebaseFirestore.DocumentData }): PublishedDeveloperEntry {
  return { developer: toDeveloper(row.id, row.data), verifiedCandidate: candidateFromVerified(row.id, row.data.verified) };
}

const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function matchesFilter(row: { data: FirebaseFirestore.DocumentData }, filter: PublishedDirectoryFilter): boolean {
  const d = row.data;
  if (filter.country && lc(d.country) !== filter.country.toLowerCase()) return false;
  if (filter.state && lc(d.state) !== filter.state.toLowerCase()) return false;
  if (filter.city) {
    const cities = [filter.city, ...(filter.cityAliases ?? [])].map((c) => c.toLowerCase());
    if (!cities.includes(lc(d.city))) return false;
  }
  if (filter.query) {
    // Same haystack the SQL searched: legal name coalesced to '' so a missing one still leaves its separator.
    const haystack = [d.displayName, d.legalName ?? "", d.city, d.state, d.country, d.verified?.canonicalDomain ?? ""].join(" ").toLowerCase();
    if (!haystack.includes(filter.query.toLowerCase())) return false;
  }
  return true;
}

// --- repositories --------------------------------------------------------------------------------------------------

function buildDeveloperRepository(ctx: FsCtx): DeveloperRepository {
  const col = () => ctx.db.collection(DEVELOPERS);

  return {
    async create(input: NewDeveloperInput) {
      const id = randomUUID();
      const now = new Date();
      const dev: Developer = {
        id,
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
      return ctx.run(async (c) => {
        const slugRef = c.db.collection("lookups").doc(slugKey(dev.slug));
        if ((await c.get(slugRef)).exists) throw new Error(`A developer with the slug "${dev.slug}" already exists.`);
        await c.create(slugRef, { developerId: id });
        await c.create(c.db.collection(DEVELOPERS).doc(id), developerToDoc(dev, null));
        invalidate();
        return dev;
      });
    },
    async getById(id) {
      if (!isValidUuid(id)) return null;
      const v = await ctx.get(col().doc(id));
      return v.exists ? toDeveloper(id, v.data()!) : null;
    },
    async getManyByIds(ids) {
      const valid = ids.filter(isValidUuid);
      if (valid.length === 0) return [];
      const views = await Promise.all(valid.map((id) => ctx.get(col().doc(id))));
      return views.filter((v) => v.exists).map((v) => toDeveloper(v.id, v.data()!));
    },
    async getBySlug(slug) {
      const rows = await ctx.query(col().where("slug", "==", slug).limit(1));
      return rows[0] ? toDeveloper(rows[0].id, rows[0].data()!) : null;
    },
    async slugExists(slug) {
      return (await ctx.query(col().where("slug", "==", slug).limit(1))).length > 0;
    },
    async list(filter) {
      let q: FirebaseFirestore.Query = col();
      if (filter?.city) q = q.where("city", "==", filter.city);
      if (filter?.status) q = q.where("status", "==", filter.status);
      return (await ctx.query(q)).map((v) => toDeveloper(v.id, v.data()!));
    },
    async update(id, patch) {
      return ctx.run(async (c) => {
        const view = await c.get(c.db.collection(DEVELOPERS).doc(id));
        if (!view.exists) throw new NotFoundError(`Developer ${id} not found`);
        const cur = toDeveloper(id, view.data()!);
        const next: Developer = { ...cur, updatedAt: new Date() };
        // `undefined` leaves a field untouched; `null` (headquartersLocation only) clears it.
        if (patch.legalName !== undefined) next.legalName = patch.legalName;
        if (patch.displayName !== undefined) next.displayName = patch.displayName;
        if (patch.city !== undefined) next.city = patch.city;
        if (patch.state !== undefined) next.state = patch.state;
        if (patch.country !== undefined) next.country = patch.country;
        if (patch.headquartersLocation !== undefined) next.headquartersLocation = patch.headquartersLocation ?? undefined;
        if (patch.status !== undefined) next.status = patch.status;
        await c.set(c.db.collection(DEVELOPERS).doc(id), developerToDoc(next, view.data()!.verified ?? null));
        invalidate();
        return next;
      });
    },
    async setPendingChanges(id, pendingChanges) {
      return ctx.run(async (c) => {
        const view = await c.get(c.db.collection(DEVELOPERS).doc(id));
        if (!view.exists) throw new NotFoundError(`Developer ${id} not found`);
        const next: Developer = { ...toDeveloper(id, view.data()!), pendingChanges, updatedAt: new Date() };
        await c.set(c.db.collection(DEVELOPERS).doc(id), developerToDoc(next, view.data()!.verified ?? null));
        invalidate();
        return next;
      });
    },
    async publishPendingChanges(id) {
      return ctx.run(async (c) => {
        const view = await c.get(c.db.collection(DEVELOPERS).doc(id));
        const cur = view.exists ? toDeveloper(id, view.data()!) : null;
        if (!cur || cur.pendingChanges === null) {
          throw new NotFoundError(`Developer ${id} not found, or has no unpublished changes to republish`);
        }
        // Every published field is replaced by its pending value (when the patch has that key) or left as it was, and
        // the patch is cleared, in the one write: never half-applied.
        const pc = cur.pendingChanges;
        const next: Developer = {
          ...cur,
          legalName: pc.legalName ?? cur.legalName,
          displayName: pc.displayName ?? cur.displayName,
          city: pc.city ?? cur.city,
          state: pc.state ?? cur.state,
          country: pc.country ?? cur.country,
          headquartersLocation: pc.headquartersLocation ?? cur.headquartersLocation,
          pendingChanges: null,
          updatedAt: new Date(),
        };
        await c.set(c.db.collection(DEVELOPERS).doc(id), developerToDoc(next, view.data()!.verified ?? null));
        invalidate();
        return next;
      });
    },
    async search(query, limit = 20, geo) {
      const q = query.toLowerCase();
      const geoTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const rows = (await loadActive(ctx)).filter((d) => {
        if (geo?.country && lc(d.country) !== geo.country.toLowerCase()) return false;
        if (geo?.state && lc(d.state) !== geo.state.toLowerCase()) return false;
        if (geo?.city && lc(d.city) !== geo.city.toLowerCase()) return false;
        // Whole-query name match; geography is matched per word (see the PostgreSQL adapter's note on why).
        if (lc(d.displayName).includes(q) || lc(d.legalName).includes(q)) return true;
        return geoTokens.some((t) => lc(d.city).includes(t) || lc(d.state).includes(t) || lc(d.country).includes(t));
      });
      const priority = (d: Developer) => (lc(d.displayName).startsWith(q) ? 0 : lc(d.legalName).startsWith(q) ? 1 : 2);
      rows.sort((a, b) => priority(a) - priority(b) || compareCodePoints(a.displayName, b.displayName));
      return rows.slice(0, limit);
    },
    async listPublishedPage(filter, page) {
      const matches = (await loadPublished(ctx)).filter((r) => matchesFilter(r, filter));
      matches.sort(
        (a, b) =>
          compareCodePoints(lc(a.data.displayName), lc(b.data.displayName)) ||
          compareCodePoints(String(a.data.displayName), String(b.data.displayName)) ||
          compareCodePoints(a.id, b.id),
      );
      return { entries: matches.slice(page.offset, page.offset + page.limit).map(toPublishedEntry), total: matches.length };
    },
    async samplePublished(seed, count) {
      // Round-robin across cities: each city's developers are shuffled by a seeded hash (their index is their "round"),
      // cities are ordered by a seeded hash too, and round 1 of every city comes before round 2 of any.
      const byCity = new Map<string, Array<{ id: string; data: FirebaseFirestore.DocumentData }>>();
      for (const r of await loadPublished(ctx)) {
        const key = lc(r.data.city);
        byCity.set(key, [...(byCity.get(key) ?? []), r]);
      }
      const ranked: Array<{ round: number; cityHash: string; row: { id: string; data: FirebaseFirestore.DocumentData } }> = [];
      for (const [city, rows] of byCity) {
        rows.sort((a, b) => md5(a.id + seed).localeCompare(md5(b.id + seed)));
        rows.forEach((row, round) => ranked.push({ round, cityHash: md5(city + seed), row }));
      }
      ranked.sort((a, b) => a.round - b.round || a.cityHash.localeCompare(b.cityHash) || a.row.id.localeCompare(b.row.id));
      return ranked.slice(0, count).map((r) => toPublishedEntry(r.row));
    },
    async countPublished() {
      return (await loadPublished(ctx)).length;
    },
    async listPublishedLocations() {
      const seen = new Map<string, { country: string; state: string; city: string }>();
      for (const r of await loadPublished(ctx)) {
        const loc = { country: r.data.country as string, state: r.data.state as string, city: r.data.city as string };
        seen.set(`${loc.country}\u0000${loc.state}\u0000${loc.city}`, loc);
      }
      return [...seen.values()].sort((a, b) => a.country.localeCompare(b.country) || a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
    },
  };
}

/**
 * After a candidate is created or changed, keep the developer document's copy of its verified candidate in step.
 * Throws when a second, different candidate would become VERIFIED for the same developer.
 */
async function syncVerified(c: FsCtx, before: WebsiteCandidate | null, after: WebsiteCandidate): Promise<void> {
  const wasVerified = before?.verificationStatus === "VERIFIED";
  const isVerified = after.verificationStatus === "VERIFIED";
  if (!wasVerified && !isVerified) return;

  const devRef = c.db.collection(DEVELOPERS).doc(after.developerId);
  const devView = await c.get(devRef);
  if (!devView.exists) return;
  const current = devView.data()!.verified as (CandidateDoc & { id: string }) | null;

  let verified: CandidateDoc | null = current;
  if (isVerified) {
    if (current && current.id !== after.id) {
      throw new Error("Only one VERIFIED website candidate is allowed per developer.");
    }
    verified = { id: after.id, ...candidateToDoc(after) };
  } else if (current && current.id === after.id) {
    verified = null;
  }
  if (verified === current && !isVerified) return;
  const dev = toDeveloper(after.developerId, devView.data()!);
  await c.set(devRef, developerToDoc({ ...dev, updatedAt: dev.updatedAt }, verified));
  invalidate();
}

function buildCandidateRepository(ctx: FsCtx): WebsiteCandidateRepository {
  const col = () => ctx.db.collection(CANDIDATES);
  const list = async (q: FirebaseFirestore.Query) => (await ctx.query(q)).map((v) => toCandidate(v.id, v.data()!));

  return {
    async create(input: NewWebsiteCandidateInput) {
      const now = new Date();
      const candidate: WebsiteCandidate = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
      return ctx.run(async (c) => {
        await syncVerified(c, null, candidate);
        await c.create(c.db.collection(CANDIDATES).doc(candidate.id), candidateToDoc(candidate));
        return candidate;
      });
    },
    async getById(id) {
      if (!isValidUuid(id)) return null;
      const v = await ctx.get(col().doc(id));
      return v.exists ? toCandidate(id, v.data()!) : null;
    },
    listByDeveloper: (developerId) => list(col().where("developerId", "==", developerId)),
    listByStatuses: async (statuses) => {
      if (statuses.length === 0) return [];
      const rows = await list(col().where("verificationStatus", "in", statuses).orderBy("createdAt", "desc"));
      return rows;
    },
    async listByStatusesPage(statuses, page) {
      if (statuses.length === 0) return { candidates: [], total: 0 };
      const base = col().where("verificationStatus", "in", statuses);
      const total = (await base.count().get()).data().count;
      const candidates = await list(base.orderBy("createdAt", "desc").orderBy("__name__", "desc").limit(page.limit).offset(page.offset));
      return { candidates, total };
    },
    async findByDomainAndPath(developerId, canonicalDomain, normalizedPath) {
      // Narrowed by developer + domain in the query, then matched on normalised path with the shared normalizeUrl().
      const rows = await list(col().where("developerId", "==", developerId).where("canonicalDomain", "==", canonicalDomain));
      return rows.find((r) => normalizeUrl(r.url).normalizedPath === normalizedPath) ?? null;
    },
    async getVerifiedForDeveloper(developerId) {
      const rows = await list(col().where("developerId", "==", developerId).where("verificationStatus", "==", "VERIFIED").limit(1));
      return rows[0] ?? null;
    },
    async findVerifiedByDomain(canonicalDomain) {
      const rows = await list(col().where("canonicalDomain", "==", canonicalDomain).where("verificationStatus", "==", "VERIFIED").limit(1));
      return rows[0] ?? null;
    },
    async update(id, patch) {
      return ctx.run(async (c) => {
        const ref = c.db.collection(CANDIDATES).doc(id);
        const view = await c.get(ref);
        if (!view.exists) throw new NotFoundError(`Website candidate ${id} not found`);
        const before = toCandidate(id, view.data()!);
        const next: WebsiteCandidate = { ...before, updatedAt: new Date() };
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
        }
        await syncVerified(c, before, next);
        await c.set(ref, candidateToDoc(next));
        return next;
      });
    },
  };
}

function buildEvidenceRepository(ctx: FsCtx): EvidenceRepository {
  return {
    async add(input: NewEvidenceInput) {
      const evidence: Evidence = { id: randomUUID(), ...input, capturedAt: new Date() };
      await ctx.create(ctx.db.collection(EVIDENCE).doc(evidence.id), {
        websiteCandidateId: evidence.websiteCandidateId,
        evidenceType: evidence.evidenceType,
        detail: evidence.detail,
        sourceUrl: evidence.sourceUrl ?? null,
        capturedAt: toTs(evidence.capturedAt),
      });
      return evidence;
    },
    async listByCandidate(candidateId) {
      const rows = await ctx.query(ctx.db.collection(EVIDENCE).where("websiteCandidateId", "==", candidateId));
      return rows.map<Evidence>((v) => {
        const d = v.data()!;
        return {
          id: v.id,
          websiteCandidateId: d.websiteCandidateId,
          evidenceType: d.evidenceType,
          detail: d.detail,
          sourceUrl: d.sourceUrl ?? undefined,
          capturedAt: reqDate(d.capturedAt),
        };
      });
    },
  };
}

function buildVerificationEventRepository(ctx: FsCtx): VerificationEventRepository {
  return {
    // No update or delete exists here, matching the interface; the PostgreSQL trigger that also rejected them has no
    // Firestore equivalent, so this absence (and the deny-all security rules) is the guarantee.
    async append(input: NewVerificationEventInput) {
      const event: VerificationEvent = { id: randomUUID(), ...input, createdAt: new Date() };
      await ctx.create(ctx.db.collection(VERIFICATION_EVENTS).doc(event.id), {
        websiteCandidateId: event.websiteCandidateId,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        reason: event.reason,
        actorType: event.actorType,
        actorId: event.actorId,
        createdAt: toTs(event.createdAt),
        _ord: monotonic(),
      });
      return event;
    },
    async listByCandidate(candidateId) {
      const rows = await ctx.query(ctx.db.collection(VERIFICATION_EVENTS).where("websiteCandidateId", "==", candidateId));
      return rows
        .sort((a, b) => ((a.data()!._ord as number) ?? 0) - ((b.data()!._ord as number) ?? 0))
        .map<VerificationEvent>((v) => {
          const d = v.data()!;
          return {
            id: v.id,
            websiteCandidateId: d.websiteCandidateId,
            previousStatus: d.previousStatus ?? null,
            newStatus: d.newStatus,
            reason: d.reason,
            actorType: d.actorType,
            actorId: d.actorId,
            createdAt: reqDate(d.createdAt),
          };
        })
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

function buildDeveloperEditEventRepository(ctx: FsCtx): DeveloperEditEventRepository {
  return {
    async append(input: NewDeveloperEditEventInput) {
      const event: DeveloperEditEvent = { id: randomUUID(), ...input, createdAt: new Date() };
      await ctx.create(ctx.db.collection(EDIT_EVENTS).doc(event.id), {
        developerId: event.developerId,
        eventType: event.eventType,
        fieldName: event.fieldName,
        previousValue: event.previousValue,
        newValue: event.newValue,
        actorType: event.actorType,
        actorId: event.actorId,
        createdAt: toTs(event.createdAt),
        _ord: monotonic(),
      });
      return event;
    },
    async listByDeveloper(developerId) {
      const rows = await ctx.query(ctx.db.collection(EDIT_EVENTS).where("developerId", "==", developerId));
      return rows
        .sort((a, b) => ((a.data()!._ord as number) ?? 0) - ((b.data()!._ord as number) ?? 0))
        .map<DeveloperEditEvent>((v) => {
          const d = v.data()!;
          return {
            id: v.id,
            developerId: d.developerId,
            eventType: d.eventType,
            fieldName: d.fieldName ?? null,
            previousValue: d.previousValue ?? null,
            newValue: d.newValue ?? null,
            actorType: d.actorType,
            actorId: d.actorId,
            createdAt: reqDate(d.createdAt),
          };
        })
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

function buildRepositories(ctx: FsCtx): DeveloperConnectRepositories {
  return {
    developers: buildDeveloperRepository(ctx),
    candidates: buildCandidateRepository(ctx),
    evidence: buildEvidenceRepository(ctx),
    events: buildVerificationEventRepository(ctx),
    developerEditEvents: buildDeveloperEditEventRepository(ctx),
    // Already inside a transaction this simply joins it (nesting composes into one atomic unit, like SAVEPOINTs did).
    runInTransaction: (fn) => ctx.run((c) => fn(buildRepositories(c))),
  };
}

export function createFirestoreRepositories(): DeveloperConnectRepositories {
  return buildRepositories(directCtx());
}
