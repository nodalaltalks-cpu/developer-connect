/**
 * One-off copy of every PostgreSQL table into Firestore, in exactly the document shapes the Firestore adapters read
 * (see docs/firestore-migration-plan.md for the data model).
 *
 *   dry run (default; reads Postgres, writes nothing, prints what it would copy):
 *     npx dotenv -e .env.local -- node scripts/migrate-postgres-to-firestore.ts
 *   copy:
 *     npx dotenv -e .env.local -- node scripts/migrate-postgres-to-firestore.ts --apply
 *   copy some tables only / verify only:
 *     ... --apply --only leads,leadEvents
 *     ... --verify
 *
 * Environment: DATABASE_URL_UNPOOLED (or DATABASE_URL) for the source; FIREBASE_SERVICE_ACCOUNT (or
 * FIRESTORE_EMULATOR_HOST for a rehearsal) for the target. Safe to run again: every document is written under the same
 * id, so a second run overwrites rather than duplicates. Source rows are never modified.
 */
import { gt, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getDb, closeDb } from "../src/lib/developer-connect/db/client.ts";
import * as s from "../src/lib/developer-connect/db/schema.ts";
import { getFirestoreDb } from "../src/lib/firestore/client.ts";
import { safeId } from "../src/lib/firestore/convert.ts";

type Row = Record<string, unknown> & { id?: string };
type Out = { path: string; data: FirebaseFirestore.DocumentData };

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");
const onlyArg = args.find((a) => a === "--only") ? args[args.indexOf("--only") + 1] : null;
const ONLY = onlyArg ? new Set(onlyArg.split(",")) : null;

const pg = getDb();
const fs = getFirestoreDb();
const lookup = (key: string, data: FirebaseFirestore.DocumentData): Out => ({ path: `lookups/${key}`, data });
const without = (row: Row, ...keys: string[]) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!keys.includes(k) && v !== undefined) out[k] = v;
  return out;
};
const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();

interface Migrator {
  /** The Firestore collection the rows end up in (used by --verify and --only). */
  name: string;
  table: PgTable;
  /** Primary-key column used to page through the table. */
  pk: { name: string; column: unknown };
  /** One source row -> the documents to write. */
  map(row: Row, ctx: Ctx): Out[] | Promise<Out[]>;
  /** Loaded once before the table is copied (e.g. other tables the rows depend on). */
  prepare?(ctx: Ctx): Promise<void>;
}

interface Ctx {
  verifiedByDeveloper: Map<string, Row>;
  ownerByLead: Map<string, string | null>;
  locationsByRequirement: Map<string, Array<{ name: string; key: string }>>;
  itemsByBatch: Map<string, Array<{ leadId: string; position: number; skippedAt: Date | null; skippedBy: string | null }>>;
  triggersByPost: Map<string, Array<{ keyword: string; intent: string; dmTemplate: string }>>;
  leadOrder: number;
  /** History rows: id -> position in the table's physical (insertion) order, to keep same-timestamp rows in the order they were written. */
  ord: Map<string, number>;
}
const ctx: Ctx = { verifiedByDeveloper: new Map(), ownerByLead: new Map(), locationsByRequirement: new Map(), itemsByBatch: new Map(), triggersByPost: new Map(), leadOrder: 0, ord: new Map() };

const col = (name: string, id: string): string => `${name}/${id}`;
const direct = (collection: string, ...omit: string[]) => (row: Row): Out[] => [{ path: col(collection, row.id as string), data: without(row, "id", ...omit) }];
/**
 * A history table whose rows can share a timestamp (events written in one transaction). PostgreSQL returned them in
 * insertion order; Firestore needs that order stored, so each row gets `_ord` = its position by (time, physical row order).
 */
function ordered(collection: string, sqlTable: string, timeColumn: string): Pick<Migrator, "prepare" | "map"> {
  return {
    async prepare() {
      const rows = (await pg.execute(sql.raw(`select id from ${sqlTable} order by ${timeColumn}, ctid`))).rows as Array<{ id: string }>;
      rows.forEach((r, i) => ctx.ord.set(r.id, i + 1));
    },
    map: (row) => [{ path: col(collection, row.id as string), data: { ...without(row, "id"), _ord: ctx.ord.get(row.id as string) ?? 0 } }],
  };
}
const OPEN_FOLLOW_UP = ["SCHEDULED", "MISSED"];
const OPEN_VISIT = ["SCHEDULED", "CONFIRMED"];

const candidateDoc = (c: Row) => ({
  developerId: c.developerId,
  url: c.url,
  canonicalDomain: c.canonicalDomain,
  discoverySource: c.discoverySource,
  verificationStatus: c.verificationStatus,
  confidenceScore: c.confidenceScore,
  reviewedBy: c.reviewedBy ?? null,
  reviewedAt: c.reviewedAt ?? null,
  rejectionReason: c.rejectionReason ?? null,
  lastCheckedAt: c.lastCheckedAt ?? null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const MIGRATORS: Migrator[] = [
  {
    name: "developers",
    table: s.developers,
    pk: { name: "id", column: s.developers.id },
    async prepare() {
      for (const c of (await pg.select().from(s.websiteCandidates)) as Row[]) if (c.verificationStatus === "VERIFIED") ctx.verifiedByDeveloper.set(c.developerId as string, c);
    },
    map(d) {
      const verified = ctx.verifiedByDeveloper.get(d.id as string);
      return [
        {
          path: col("developers", d.id as string),
          data: {
            legalName: d.legalName ?? null,
            displayName: d.displayName,
            displayNameLower: String(d.displayName).toLowerCase(),
            slug: d.slug,
            city: d.city,
            cityLower: String(d.city).toLowerCase(),
            state: d.state,
            country: d.country,
            headquartersLocation: d.headquartersLocation ?? null,
            status: d.status,
            pendingChanges: d.pendingChanges ?? null,
            verified: verified ? { id: verified.id, ...candidateDoc(verified) } : null,
            isPublished: d.status === "ACTIVE" && !!verified,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          },
        },
        lookup(`devSlug:${safeId(d.slug as string)}`, { developerId: d.id }),
      ];
    },
  },
  { name: "websiteCandidates", table: s.websiteCandidates, pk: { name: "id", column: s.websiteCandidates.id }, map: (c) => [{ path: col("websiteCandidates", c.id as string), data: candidateDoc(c) }] },
  { name: "evidence", table: s.evidence, pk: { name: "id", column: s.evidence.id }, map: direct("evidence") },
  { name: "verificationEvents", table: s.verificationEvents, pk: { name: "id", column: s.verificationEvents.id }, ...ordered("verificationEvents", "verification_events", "created_at") },
  { name: "developerEditEvents", table: s.developerEditEvents, pk: { name: "id", column: s.developerEditEvents.id }, ...ordered("developerEditEvents", "developer_edit_events", "created_at") },
  { name: "analyticsEvents", table: s.analyticsEvents, pk: { name: "id", column: s.analyticsEvents.id }, map: direct("analyticsEvents") },
  { name: "profiles", table: s.profiles, pk: { name: "userId", column: s.profiles.userId }, map: (r) => [{ path: col("profiles", r.userId as string), data: without(r, "userId") }] },
  { name: "notifications", table: s.notifications, pk: { name: "id", column: s.notifications.id }, map: direct("notifications") },
  { name: "inaccuracyReports", table: s.inaccuracyReports, pk: { name: "id", column: s.inaccuracyReports.id }, map: direct("inaccuracyReports") },
  { name: "contactSubmissions", table: s.contactSubmissions, pk: { name: "id", column: s.contactSubmissions.id }, map: direct("contactSubmissions") },
  { name: "contactStatusHistory", table: s.contactStatusHistory, pk: { name: "id", column: s.contactStatusHistory.id }, ...ordered("contactStatusHistory", "contact_status_history", "created_at") },
  { name: "newsletterSubscribers", table: s.newsletterSubscribers, pk: { name: "id", column: s.newsletterSubscribers.id }, map: (r) => [{ path: col("newsletterSubscribers", safeId(r.email as string)), data: without(r, "id") }] },

  // --- leads ------------------------------------------------------------------------------------------------
  {
    name: "leads",
    table: s.leads,
    pk: { name: "id", column: s.leads.id },
    map(l) {
      const live = l.erasedAt == null && l.trashedAt == null && !l.prospect;
      const out: Out[] = [{ path: col("leads", l.id as string), data: { ...without(l, "id"), _live: live, _ord: ++ctx.leadOrder } }];
      if (l.phoneE164) out.push(lookup(`leadPhone:${safeId(l.phoneE164 as string)}`, { leadId: l.id }));
      return out;
    },
    async prepare() {
      for (const l of (await pg.select({ id: s.leads.id, ownerId: s.leads.ownerId }).from(s.leads)) as Row[]) ctx.ownerByLead.set(l.id as string, (l.ownerId as string | null) ?? null);
    },
  },
  {
    name: "leadEvents",
    table: s.leadEvents,
    pk: { name: "id", column: s.leadEvents.id },
    map(e) {
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      const visibleTo = [e.actorId, ctx.ownerByLead.get(e.leadId as string), payload.to, payload.from].filter((x): x is string => typeof x === "string" && x.length > 0);
      return [{ path: col("leadEvents", e.id as string), data: { ...without(e, "id", "seq"), _seq: Number(e.seq), _visibleTo: [...new Set(visibleTo)] } }];
    },
  },
  { name: "marketingTouches", table: s.marketingTouches, pk: { name: "id", column: s.marketingTouches.id }, map: direct("marketingTouches") },
  { name: "leadConsents", table: s.leadConsents, pk: { name: "id", column: s.leadConsents.id }, map: direct("leadConsents") },
  { name: "bookings", table: s.bookings, pk: { name: "id", column: s.bookings.id }, map: direct("bookings") },
  {
    name: "leadRequirements",
    table: s.leadRequirements,
    pk: { name: "id", column: s.leadRequirements.id },
    async prepare() {
      const rows = (await pg.select().from(s.leadRequirementLocations)) as Row[];
      for (const r of rows.sort((a, b) => Number(a.position) - Number(b.position))) {
        const list = ctx.locationsByRequirement.get(r.requirementId as string) ?? [];
        list.push({ name: r.name as string, key: r.nameKey as string });
        ctx.locationsByRequirement.set(r.requirementId as string, list);
      }
    },
    map(r) {
      const out: Out[] = [{ path: col("leadRequirements", r.id as string), data: { ...without(r, "id"), locations: ctx.locationsByRequirement.get(r.id as string) ?? [] } }];
      if (r.status === "ACTIVE") out.push(lookup(`reqActive:${r.leadId}`, { requirementId: r.id }));
      return out;
    },
  },
  {
    name: "leadFollowUps",
    table: s.leadFollowUps,
    pk: { name: "id", column: s.leadFollowUps.id },
    map(f) {
      const out: Out[] = [{ path: col("leadFollowUps", f.id as string), data: without(f, "id") }];
      if (OPEN_FOLLOW_UP.includes(f.status as string)) out.push(lookup(`fuOpen:${f.leadId}`, { followUpId: f.id }));
      return out;
    },
  },
  { name: "leadCalls", table: s.leadCalls, pk: { name: "id", column: s.leadCalls.id }, map: direct("leadCalls") },
  { name: "leadCallEvents", table: s.leadCallEvents, pk: { name: "id", column: s.leadCallEvents.id }, map: (e) => [{ path: col("leadCallEvents", safeId(`${e.provider}:${e.providerEventId}`)), data: without(e, "id") }] },
  { name: "leadImportBatches", table: s.leadImportBatches, pk: { name: "id", column: s.leadImportBatches.id }, map: direct("leadImportBatches") },
  {
    name: "callingBatches",
    table: s.callingBatches,
    pk: { name: "id", column: s.callingBatches.id },
    async prepare() {
      const rows = (await pg.select().from(s.callingBatchItems)) as Row[];
      for (const i of rows.sort((a, b) => Number(a.position) - Number(b.position))) {
        const list = ctx.itemsByBatch.get(i.batchId as string) ?? [];
        list.push({ leadId: i.leadId as string, position: Number(i.position), skippedAt: (i.skippedAt as Date | null) ?? null, skippedBy: (i.skippedBy as string | null) ?? null });
        ctx.itemsByBatch.set(i.batchId as string, list);
      }
    },
    map: (b) => [{ path: col("callingBatches", b.id as string), data: { ...without(b, "id"), _items: ctx.itemsByBatch.get(b.id as string) ?? [] } }],
  },
  {
    name: "projects",
    table: s.projects,
    pk: { name: "id", column: s.projects.id },
    map: (p) => [
      { path: col("projects", p.id as string), data: without(p, "id") },
      lookup(`projName:${p.developerId ?? "team"}:${safeId(lc(p.name))}`, { projectId: p.id }),
    ],
  },
  {
    name: "leadProjectShortlist",
    table: s.leadProjectShortlist,
    pk: { name: "id", column: s.leadProjectShortlist.id },
    map: (e) => [{ path: col("leadProjectShortlist", e.id as string), data: without(e, "id") }, ...(e.removedAt == null ? [lookup(`shortlistActive:${e.leadId}:${e.projectId}`, { entryId: e.id })] : [])],
  },
  {
    name: "siteVisits",
    table: s.siteVisits,
    pk: { name: "id", column: s.siteVisits.id },
    map: (v) => [{ path: col("siteVisits", v.id as string), data: without(v, "id") }, ...(OPEN_VISIT.includes(v.status as string) ? [lookup(`visitOpen:${v.leadId}:${v.projectId ?? "none"}`, { visitId: v.id })] : [])],
  },
  { name: "siteVisitEvents", table: s.siteVisitEvents, pk: { name: "id", column: s.siteVisitEvents.id }, ...ordered("siteVisitEvents", "site_visit_events", "created_at") },
  { name: "campaigns", table: s.campaigns, pk: { name: "id", column: s.campaigns.id }, map: (c) => [{ path: col("campaigns", c.id as string), data: without(c, "id") }, lookup(`campaign:${safeId(lc(c.utmCampaign))}`, { campaignId: c.id })] },
  { name: "marketingSpend", table: s.marketingSpend, pk: { name: "id", column: s.marketingSpend.id }, map: direct("marketingSpend") },
  { name: "automationSettings", table: s.automationSettings, pk: { name: "key", column: s.automationSettings.key }, map: (r) => [{ path: col("automationSettings", safeId(r.key as string)), data: { ...without(r), key: r.key } }] },
  { name: "automationActions", table: s.automationActions, pk: { name: "id", column: s.automationActions.id }, map: (a) => [{ path: col("automationActions", safeId(a.dedupeKey as string)), data: without(a, "id") }] },

  // --- team -------------------------------------------------------------------------------------------------
  {
    name: "staffMembers",
    table: s.staffMembers,
    pk: { name: "id", column: s.staffMembers.id },
    map(m) {
      const email = m.email ? lc(m.email) : null;
      const out: Out[] = [
        { path: col("staffMembers", m.id as string), data: { ...without(m, "id"), emailLower: email } },
        lookup(`staffUser:${safeId(m.userId as string)}`, { staffId: m.id }),
        lookup(`staffEmp:${safeId(m.employeeId as string)}`, { staffId: m.id }),
      ];
      if (email && m.status !== "EXITED") out.push(lookup(`staffEmail:${safeId(email)}`, { staffId: m.id }));
      return out;
    },
  },
  { name: "staffEvents", table: s.staffEvents, pk: { name: "id", column: s.staffEvents.id }, ...ordered("staffEvents", "staff_events", "occurred_at") },

  // --- content ----------------------------------------------------------------------------------------------
  { name: "testimonials", table: s.testimonials, pk: { name: "id", column: s.testimonials.id }, map: direct("testimonials") },
  { name: "testimonialEvents", table: s.testimonialEvents, pk: { name: "id", column: s.testimonialEvents.id }, ...ordered("testimonialEvents", "testimonial_events", "created_at") },
  { name: "socialVideos", table: s.socialVideos, pk: { name: "id", column: s.socialVideos.id }, map: direct("socialVideos") },
  { name: "socialEvents", table: s.socialEvents, pk: { name: "id", column: s.socialEvents.id }, map: direct("socialEvents") },
  { name: "enquirySubmissions", table: s.enquirySubmissions, pk: { name: "id", column: s.enquirySubmissions.id }, map: direct("enquirySubmissions") },
  { name: "buyerEnquiries", table: s.buyerEnquiries, pk: { name: "id", column: s.buyerEnquiries.id }, map: direct("buyerEnquiries") },

  // --- social automation ------------------------------------------------------------------------------------
  { name: "socialAutomationSettings", table: s.socialAutomationSettings, pk: { name: "id", column: s.socialAutomationSettings.id }, map: (r) => [{ path: col("socialAutomationSettings", r.id as string), data: without(r, "id") }] },
  {
    name: "socialPostAutomations",
    table: s.socialPostAutomations,
    pk: { name: "id", column: s.socialPostAutomations.id },
    async prepare() {
      const rows = (await pg.select().from(s.socialPostTriggers)) as Row[];
      for (const t of rows.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))) {
        const list = ctx.triggersByPost.get(t.automationId as string) ?? [];
        list.push({ keyword: t.keyword as string, intent: t.intent as string, dmTemplate: t.dmTemplate as string });
        ctx.triggersByPost.set(t.automationId as string, list);
      }
    },
    map: (p) => [
      { path: col("socialPostAutomations", p.id as string), data: { ...without(p, "id"), triggers: ctx.triggersByPost.get(p.id as string) ?? [] } },
      ...(p.postId ? [lookup(`socialPost:${p.platform}:${safeId(p.postId as string)}`, { automationId: p.id })] : []),
    ],
  },
  { name: "socialCommentEvents", table: s.socialCommentEvents, pk: { name: "id", column: s.socialCommentEvents.id }, map: (e) => [{ path: col("socialCommentEvents", `${e.platform}_${safeId(e.commentId as string)}`), data: without(e, "id") }] },
];

const PAGE = 1000;

async function* rowsOf(m: Migrator): AsyncGenerator<Row[]> {
  let last: unknown = null;
  for (;;) {
    const q = pg.select().from(m.table as never) as unknown as { where(c: unknown): { orderBy(c: unknown): { limit(n: number): Promise<Row[]> } }; orderBy(c: unknown): { limit(n: number): Promise<Row[]> } };
    const rows: Row[] = await (last === null ? q.orderBy(m.pk.column).limit(PAGE) : q.where(gt(m.pk.column as never, last as never)).orderBy(m.pk.column).limit(PAGE));
    if (rows.length === 0) return;
    yield rows;
    last = rows[rows.length - 1][m.pk.name];
    if (rows.length < PAGE) return;
  }
}

async function copy(m: Migrator): Promise<number> {
  await m.prepare?.(ctx);
  const writer = APPLY ? fs.bulkWriter() : null;
  let rows = 0;
  let docs = 0;
  for await (const page of rowsOf(m)) {
    for (const row of page) {
      rows += 1;
      for (const out of await m.map(row, ctx)) {
        docs += 1;
        // A document can be produced by several rows (a lookup shared by two rows would be a data bug); last write wins.
        if (writer) void writer.set(fs.doc(out.path), out.data);
      }
    }
  }
  if (writer) await writer.close();
  console.log(`${APPLY ? "copied" : "would copy"} ${String(rows).padStart(7)} rows -> ${String(docs).padStart(7)} documents  ${m.name}`);
  return rows;
}

async function counters() {
  // The next employee number continues from where the PostgreSQL sequence stopped (DC1 is the Founder).
  const res = await pg.execute(sql`select last_value::bigint as last, is_called from staff_employee_number_seq`);
  const row = res.rows[0] as { last: string; is_called: boolean } | undefined;
  const next = row ? (row.is_called ? Number(row.last) + 1 : Number(row.last)) : 2;
  console.log(`${APPLY ? "set" : "would set"} counters/staffEmployeeNumber -> next DC${next}`);
  if (APPLY) await fs.doc("counters/staffEmployeeNumber").set({ next });
}

async function verify() {
  let bad = 0;
  for (const m of MIGRATORS) {
    if (ONLY && !ONLY.has(m.name)) continue;
    const [{ n }] = (await pg.select({ n: sql<number>`count(*)::int` }).from(m.table as never)) as Array<{ n: number }>;
    const target = (await fs.collection(m.name).count().get()).data().count;
    const ok = n === target;
    if (!ok) bad += 1;
    console.log(`${ok ? "ok  " : "DIFF"} ${m.name.padEnd(26)} postgres ${String(n).padStart(7)}   firestore ${String(target).padStart(7)}`);
  }
  console.log(bad === 0 ? "\nAll counts match." : `\n${bad} collection(s) differ - investigate before cutover.`);
  process.exitCode = bad === 0 ? 0 : 1;
}

async function main() {
  console.log(APPLY ? "APPLYING: writing to Firestore" : VERIFY ? "VERIFY: comparing counts" : "DRY RUN: nothing is written (add --apply to copy)");
  if (VERIFY) return verify();
  for (const m of MIGRATORS) if (!ONLY || ONLY.has(m.name)) await copy(m);
  if (!ONLY || ONLY.has("staffMembers")) await counters();
  if (APPLY) console.log("\nDone. Now run with --verify to compare the counts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
