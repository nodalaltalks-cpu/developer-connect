/**
 * Runs the same repository reads against PostgreSQL and against Firestore and reports every difference. Use it after
 * `migrate-postgres-to-firestore.ts --apply` (against the test database + emulator for a rehearsal, or against the
 * real ones just before cutover):
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx dotenv -e .env.local -- node scripts/with-test-database.cjs node scripts/compare-backends.ts
 *
 * Exit code 1 when anything differs.
 */
import { closeDb } from "../src/lib/developer-connect/db/client.ts";
import { createPostgresRepositories } from "../src/lib/developer-connect/db/postgres-repository.ts";
import { createFirestoreRepositories } from "../src/lib/developer-connect/firestore/firestore-repository.ts";
import { createPostgresLeadRepositories } from "../src/lib/leads/db/postgres-repository.ts";
import { createFirestoreLeadRepositories } from "../src/lib/leads/firestore/index.ts";
import { createPostgresStaffRepository } from "../src/lib/staff/db/postgres-repository.ts";
import { createFirestoreStaffRepository } from "../src/lib/staff/firestore/firestore-repository.ts";
import { createPostgresTestimonialRepository } from "../src/lib/testimonials/postgres-repository.ts";
import { createFirestoreTestimonialRepository } from "../src/lib/testimonials/firestore/firestore-repository.ts";
import { createEngagementRepositories } from "../src/lib/engagement/db/postgres-repository.ts";
import { createFirestoreEngagementRepositories } from "../src/lib/engagement/firestore/firestore-repository.ts";
import { endOfDayIn } from "../src/lib/leads/lead-views.ts";

let differences = 0;
let checks = 0;

/** Dates compare by instant, undefined and null are the same "absent", object key order does not matter. */
function normalise(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, normalise(x)]),
    );
  }
  return v;
}

async function check(name: string, pgRead: () => Promise<unknown>, fsRead: () => Promise<unknown>) {
  checks += 1;
  try {
    const [a, b] = await Promise.all([pgRead(), fsRead()]);
    const left = JSON.stringify(normalise(a));
    const right = JSON.stringify(normalise(b));
    if (left === right) return console.log(`ok    ${name}`);
    differences += 1;
    console.log(`DIFF  ${name}`);
    let i = 0;
    while (i < left.length && left[i] === right[i]) i++;
    console.log(`        postgres : ...${left.slice(Math.max(0, i - 60), i + 140)}`);
    console.log(`        firestore: ...${right.slice(Math.max(0, i - 60), i + 140)}`);
  } catch (error) {
    differences += 1;
    console.log(`ERROR ${name}: ${(error as Error).message}`);
  }
}

const sortById = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

async function main() {
  const pgDev = createPostgresRepositories();
  const fsDev = createFirestoreRepositories();
  const pgLeads = createPostgresLeadRepositories();
  const fsLeads = createFirestoreLeadRepositories();
  const now = new Date();
  const endOfToday = endOfDayIn(now);

  // --- developers and the public directory ---------------------------------------------------------------------
  await check("developers.countPublished", () => pgDev.developers.countPublished(), () => fsDev.developers.countPublished());
  await check("developers.listPublishedLocations", () => pgDev.developers.listPublishedLocations(), () => fsDev.developers.listPublishedLocations());
  await check("developers.listPublishedPage(first 40)", () => pgDev.developers.listPublishedPage({}, { limit: 40, offset: 0 }), () => fsDev.developers.listPublishedPage({}, { limit: 40, offset: 0 }));
  await check("developers.listPublishedPage(Mumbai query)", () => pgDev.developers.listPublishedPage({ city: "Mumbai", query: "a" }, { limit: 25, offset: 10 }), () => fsDev.developers.listPublishedPage({ city: "Mumbai", query: "a" }, { limit: 25, offset: 10 }));
  await check("developers.samplePublished", () => pgDev.developers.samplePublished("seed-1", 12), () => fsDev.developers.samplePublished("seed-1", 12));
  await check("developers.search('lo')", () => pgDev.developers.search("lo", 20), () => fsDev.developers.search("lo", 20));
  await check("developers.list(ACTIVE)", async () => sortById(await pgDev.developers.list({ status: "ACTIVE" })), async () => sortById(await fsDev.developers.list({ status: "ACTIVE" })));
  await check("candidates.listByStatusesPage(pending)", () => pgDev.candidates.listByStatusesPage(["DISCOVERED", "PENDING_VERIFICATION"], { limit: 30, offset: 0 }), () => fsDev.candidates.listByStatusesPage(["DISCOVERED", "PENDING_VERIFICATION"], { limit: 30, offset: 0 }));

  // --- leads --------------------------------------------------------------------------------------------------
  await check("leads.counts", () => pgLeads.leads.counts(now, endOfToday), () => fsLeads.leads.counts(now, endOfToday));
  await check("leads.counts(COLD_CALL)", () => pgLeads.leads.counts(now, endOfToday, "COLD_CALL"), () => fsLeads.leads.counts(now, endOfToday, "COLD_CALL"));
  await check("leads.statusCounts", () => pgLeads.leads.statusCounts(), () => fsLeads.leads.statusCounts());
  for (const view of ["all", "new", "hot", "warm", "cold", "overdue", "due_today", "qualified", "follow_up_due"] as const) {
    const q = { view, limit: 25, offset: 0, now, endOfToday };
    await check(`leads.list(${view})`, async () => {
      const r = await pgLeads.leads.list(q);
      return { total: r.total, ids: r.leads.map((l) => l.id) };
    }, async () => {
      const r = await fsLeads.leads.list(q);
      return { total: r.total, ids: r.leads.map((l) => l.id) };
    });
  }
  await check("leads.listReturned", async () => (await pgLeads.leads.listReturned(50)).map((l) => l.id), async () => (await fsLeads.leads.listReturned(50)).map((l) => l.id));
  await check("leads.listTrashed", async () => (await pgLeads.leads.listTrashed(50)).map((l) => l.id), async () => (await fsLeads.leads.listTrashed(50)).map((l) => l.id));
  await check("leads.countByOwner", () => pgLeads.leads.countByOwner(), () => fsLeads.leads.countByOwner());
  await check("leads.countOpenByOwner", () => pgLeads.leads.countOpenByOwner(), () => fsLeads.leads.countOpenByOwner());
  await check("leads.ownerSummary", () => pgLeads.leads.ownerSummary(), () => fsLeads.leads.ownerSummary());
  await check("leads.stageHistory", () => pgLeads.leads.stageHistory(), () => fsLeads.leads.stageHistory());
  await check("leads.exceptionCounts", () => pgLeads.leads.exceptionCounts({ unassignedOlderThan: new Date(now.getTime() - 86_400_000), staleBefore: new Date(now.getTime() - 3 * 86_400_000) }), () => fsLeads.leads.exceptionCounts({ unassignedOlderThan: new Date(now.getTime() - 86_400_000), staleBefore: new Date(now.getTime() - 3 * 86_400_000) }));
  // A large limit: with a small one, leads created in the same instant tie at the cutoff and either side may keep different ones.
  await check("leads.listUnassignedOpen(all ids)", async () => (await pgLeads.leads.listUnassignedOpen(100_000)).map((l) => l.id).sort(), async () => (await fsLeads.leads.listUnassignedOpen(100_000)).map((l) => l.id).sort());
  const funnelQuery = { from: new Date(now.getTime() - 3650 * 86_400_000), to: new Date(now.getTime() + 86_400_000), groupBy: "SOURCE" as const };
  // Both sides group the same rows; their ORDER is unspecified (ties), so compare in a fixed order.
  const funnelOf = async (repos: typeof pgLeads) => {
    const f = await repos.leads.sourceFunnel(funnelQuery);
    return {
      rows: [...f.rows].sort((a, b) => `${a.sourceType}|${a.sourceDetail}`.localeCompare(`${b.sourceType}|${b.sourceDetail}`)),
      revenue: [...f.revenue].sort((a, b) => `${a.sourceType}|${a.personId}|${a.currency}`.localeCompare(`${b.sourceType}|${b.personId}|${b.currency}`)),
    };
  };
  await check("leads.sourceFunnel(all time, SOURCE)", () => funnelOf(pgLeads), () => funnelOf(fsLeads));

  // Per-lead detail for a spread of real leads.
  const sample = (await pgLeads.leads.list({ view: "all", limit: 12, offset: 0, now, endOfToday })).leads;
  for (const lead of sample) {
    await check(`lead ${lead.id.slice(0, 8)} row`, () => pgLeads.leads.getById(lead.id), () => fsLeads.leads.getById(lead.id));
    await check(`lead ${lead.id.slice(0, 8)} events`, async () => (await pgLeads.events.listByLead(lead.id)).map((e) => ({ ...e, id: undefined })), async () => (await fsLeads.events.listByLead(lead.id)).map((e) => ({ ...e, id: undefined })));
    await check(`lead ${lead.id.slice(0, 8)} requirements`, () => pgLeads.requirements.listByLead(lead.id), () => fsLeads.requirements.listByLead(lead.id));
    await check(`lead ${lead.id.slice(0, 8)} follow-ups`, () => pgLeads.followUps.listByLead(lead.id), () => fsLeads.followUps.listByLead(lead.id));
    await check(`lead ${lead.id.slice(0, 8)} calls`, () => pgLeads.calls.listByLead(lead.id), () => fsLeads.calls.listByLead(lead.id));
    await check(`lead ${lead.id.slice(0, 8)} bookings`, async () => sortById(await pgLeads.bookings.listByLead(lead.id)), async () => sortById(await fsLeads.bookings.listByLead(lead.id)));
    await check(`lead ${lead.id.slice(0, 8)} found by phone`, async () => (lead.phoneE164 ? (await pgLeads.leads.findByPhone(lead.phoneE164))?.id : null), async () => (lead.phoneE164 ? (await fsLeads.leads.findByPhone(lead.phoneE164))?.id : null));
  }
  await check("events.summarise(sample)", () => pgLeads.events.summarise(sample.map((l) => l.id)), () => fsLeads.events.summarise(sample.map((l) => l.id)));
  await check("projects.list", async () => sortById(await pgLeads.projects.list({ activeOnly: false, limit: 500 })), async () => sortById(await fsLeads.projects.list({ activeOnly: false, limit: 500 })));
  await check("campaigns.list", async () => sortById(await pgLeads.campaigns.list(200)), async () => sortById(await fsLeads.campaigns.list(200)));
  await check("bookings.listOutstanding", async () => sortById(await pgLeads.bookings.listOutstanding(100)), async () => sortById(await fsLeads.bookings.listOutstanding(100)));
  await check("bookings.revenueByOwner", async () => (await pgLeads.bookings.revenueByOwner()).sort((a, b) => `${a.ownerId}${a.currency}`.localeCompare(`${b.ownerId}${b.currency}`)), async () => (await fsLeads.bookings.revenueByOwner()).sort((a, b) => `${a.ownerId}${a.currency}`.localeCompare(`${b.ownerId}${b.currency}`)));
  await check("importBatches.list", () => pgLeads.importBatches.list(100), () => fsLeads.importBatches.list(100));
  // itemCount is left out on purpose: the PostgreSQL query reports 0 for every batch (its correlated subquery resolves the
  // batch id to the wrong table), so Firestore's real count is the correct one and the two cannot agree.
  const withoutCount = (rows: Array<{ id: string; itemCount: number }>) => sortById(rows).map((b) => ({ ...b, itemCount: undefined }));
  await check("callingBatches.listAll (except itemCount)", async () => withoutCount(await pgLeads.callingBatches.listAll(100)), async () => withoutCount(await fsLeads.callingBatches.listAll(100)));
  await check("automationSettings.getAll", () => pgLeads.automationSettings.getAll(), () => fsLeads.automationSettings.getAll());
  await check("followUps.statsByStaff(all time)", () => pgLeads.followUps.statsByStaff(new Date(0), new Date(now.getTime() + 86_400_000), now), () => fsLeads.followUps.statsByStaff(new Date(0), new Date(now.getTime() + 86_400_000), now));
  await check("siteVisits.statsByStaff(all time)", () => pgLeads.siteVisits.statsByStaff(new Date(0), new Date(now.getTime() + 86_400_000)), () => fsLeads.siteVisits.statsByStaff(new Date(0), new Date(now.getTime() + 86_400_000)));
  await check("calls.aggregate(DAY)", () => pgLeads.calls.aggregate({ from: new Date(0), to: new Date(now.getTime() + 86_400_000), groupBy: "DAY", timeZone: "Asia/Kolkata" }), () => fsLeads.calls.aggregate({ from: new Date(0), to: new Date(now.getTime() + 86_400_000), groupBy: "DAY", timeZone: "Asia/Kolkata" }));
  await check("events.latestSeq vs count (both just positive)", async () => (await pgLeads.events.latestSeq({})) > 0, async () => (await fsLeads.events.latestSeq({})) > 0);

  // --- team ---------------------------------------------------------------------------------------------------
  const pgStaff = createPostgresStaffRepository();
  const fsStaff = createFirestoreStaffRepository();
  await check("staff.list", () => pgStaff.list(), () => fsStaff.list());
  const staff = await pgStaff.list();
  for (const m of staff.slice(0, 6)) {
    await check(`staff ${m.employeeId} events`, async () => (await pgStaff.listEvents(m.id, 100)).map((e) => ({ ...e, id: undefined })), async () => (await fsStaff.listEvents(m.id, 100)).map((e) => ({ ...e, id: undefined })));
    await check(`staff ${m.employeeId} by user id`, async () => (await pgStaff.getByUserId(m.userId))?.id, async () => (await fsStaff.getByUserId(m.userId))?.id);
  }

  // --- testimonials and engagement ------------------------------------------------------------------------------
  const pgT = createPostgresTestimonialRepository();
  const fsT = createFirestoreTestimonialRepository();
  await check("testimonials.listPublished", () => pgT.listPublished(50), () => fsT.listPublished(50));
  await check("testimonials.countByStatus", async () => (await pgT.countByStatus()).sort((a, b) => `${a.status}${a.illustrative}`.localeCompare(`${b.status}${b.illustrative}`)), async () => (await fsT.countByStatus()).sort((a, b) => `${a.status}${a.illustrative}`.localeCompare(`${b.status}${b.illustrative}`)));
  await check("testimonials.list(all)", async () => sortById(await pgT.list({ limit: 200 })), async () => sortById(await fsT.list({ limit: 200 })));
  const pgE = createEngagementRepositories();
  const fsE = createFirestoreEngagementRepositories();
  await check("contact.list", async () => sortById(await pgE.contact.list(300)), async () => sortById(await fsE.contact.list(300)));
  await check("contact.listTrash", async () => sortById(await pgE.contact.listTrash(300)), async () => sortById(await fsE.contact.listTrash(300)));
  await check("reports.list", async () => sortById(await pgE.reports.list(300)), async () => sortById(await fsE.reports.list(300)));
  await check("newsletter.countActive", () => pgE.newsletter.countActive(), () => fsE.newsletter.countActive());

  console.log(`\n${checks} checks, ${differences} difference${differences === 1 ? "" : "s"}.`);
  process.exitCode = differences === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
