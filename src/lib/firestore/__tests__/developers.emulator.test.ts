import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

async function repos() {
  const { createFirestoreRepositories } = await import("../../developer-connect/firestore/firestore-repository.ts");
  return createFirestoreRepositories();
}

const tag = () => randomUUID().slice(0, 8);

async function publishedDeveloper(r: Awaited<ReturnType<typeof repos>>, name: string, city: string, domain: string) {
  const dev = await r.developers.create({ legalName: `${name} Pvt Ltd`, displayName: name, slug: `slug-${randomUUID()}`, city, state: "Maharashtra", country: "India" });
  const cand = await r.candidates.create({ developerId: dev.id, url: `https://${domain}/`, canonicalDomain: domain, discoverySource: "MANUAL_SUBMISSION", verificationStatus: "PENDING_VERIFICATION", confidenceScore: 0.9 });
  await r.candidates.update(cand.id, { verificationStatus: "VERIFIED", reviewedBy: "founder", reviewedAt: new Date() });
  return { dev, cand };
}

test("firestore developers: slug unique; one VERIFIED candidate per developer; published only when ACTIVE + verified", { skip }, async () => {
  const r = await repos();
  const t = tag();
  const slug = `dup-${randomUUID()}`;
  const dev = await r.developers.create({ legalName: null, displayName: `Alpha ${t}`, slug, city: "Pune", state: "MH", country: "India" });
  await assert.rejects(() => r.developers.create({ legalName: null, displayName: "Other", slug, city: "Pune", state: "MH", country: "India" }), /already exists/);
  assert.equal(await r.developers.slugExists(slug), true);
  assert.equal((await r.developers.getBySlug(slug))?.id, dev.id);
  assert.equal(await r.developers.getById("not-a-uuid"), null);

  const before = await r.developers.countPublished();
  const c1 = await r.candidates.create({ developerId: dev.id, url: `https://alpha-${t}.com/`, canonicalDomain: `alpha-${t}.com`, discoverySource: "MANUAL_SUBMISSION", verificationStatus: "PENDING_VERIFICATION", confidenceScore: 0.5 });
  const c2 = await r.candidates.create({ developerId: dev.id, url: `https://alpha2-${t}.com/`, canonicalDomain: `alpha2-${t}.com`, discoverySource: "MANUAL_SUBMISSION", verificationStatus: "PENDING_VERIFICATION", confidenceScore: 0.5 });
  assert.equal(await r.developers.countPublished(), before, "unverified is not public");

  await r.candidates.update(c1.id, { verificationStatus: "VERIFIED" });
  assert.equal(await r.developers.countPublished(), before + 1);
  await assert.rejects(() => r.candidates.update(c2.id, { verificationStatus: "VERIFIED" }), /Only one VERIFIED/);
  assert.equal((await r.candidates.getVerifiedForDeveloper(dev.id))?.id, c1.id);
  assert.equal((await r.candidates.findVerifiedByDomain(`alpha-${t}.com`))?.id, c1.id);
  assert.equal((await r.candidates.findByDomainAndPath(dev.id, `alpha-${t}.com`, "/"))?.id, c1.id);

  await r.developers.update(dev.id, { status: "INACTIVE" });
  assert.equal(await r.developers.countPublished(), before, "inactive developers leave the directory");
  await r.developers.update(dev.id, { status: "ACTIVE" });
  await r.candidates.update(c1.id, { verificationStatus: "NEEDS_REVERIFICATION" });
  assert.equal(await r.developers.countPublished(), before, "a candidate leaving VERIFIED unpublishes");
  await r.candidates.update(c2.id, { verificationStatus: "VERIFIED" });
  assert.equal(await r.developers.countPublished(), before + 1);
});

test("firestore developers: directory page, filters, aliases, sample, locations, search", { skip }, async () => {
  const r = await repos();
  const t = tag();
  const a = await publishedDeveloper(r, `Zeta ${t}`, `Bengaluru`, `zeta-${t}.com`);
  const b = await publishedDeveloper(r, `Alpha ${t}`, `Bangalore`, `alpha-${t}.com`);
  const c = await publishedDeveloper(r, `Mid ${t}`, `Thane`, `mid-${t}.com`);

  const page = await r.developers.listPublishedPage({ query: t }, { limit: 2, offset: 0 });
  assert.equal(page.total, 3);
  assert.deepEqual(page.entries.map((e) => e.developer.displayName), [`Alpha ${t}`, `Mid ${t}`]);
  const page2 = await r.developers.listPublishedPage({ query: t }, { limit: 2, offset: 2 });
  assert.deepEqual(page2.entries.map((e) => e.developer.id), [a.dev.id]);
  assert.equal(page.entries[0].verifiedCandidate.id, b.cand.id);

  const bangalore = await r.developers.listPublishedPage({ query: t, city: "Bangalore", cityAliases: ["Bengaluru"] }, { limit: 10, offset: 0 });
  assert.equal(bangalore.total, 2);
  assert.equal((await r.developers.listPublishedPage({ query: `mid-${t}.com` }, { limit: 10, offset: 0 })).total, 1, "verified domain is searchable");
  assert.equal((await r.developers.listPublishedPage({ query: t, country: "india", state: "maharashtra" }, { limit: 10, offset: 0 })).total, 3);

  const sample = await r.developers.samplePublished("seed-1", 3);
  assert.equal(sample.length, 3);
  assert.deepEqual((await r.developers.samplePublished("seed-1", 3)).map((e) => e.developer.id), sample.map((e) => e.developer.id), "stable for one seed");

  const locations = await r.developers.listPublishedLocations();
  assert.ok(locations.some((l) => l.city === "Thane" && l.country === "India"));

  const found = await r.developers.search(`Alpha ${t}`, 5);
  assert.equal(found[0]?.id, b.dev.id);
  const inCity = await r.developers.search(`${t}`, 10, { city: "thane" });
  assert.deepEqual(inCity.map((d) => d.id), [c.dev.id]);
});

test("firestore developers: pending changes publish atomically; transaction rolls back", { skip }, async () => {
  const r = await repos();
  const t = tag();
  const { dev } = await publishedDeveloper(r, `Pending ${t}`, "Mumbai", `pending-${t}.com`);

  await assert.rejects(() => r.developers.publishPendingChanges(dev.id), /no unpublished changes/);
  await r.developers.setPendingChanges(dev.id, { displayName: `Renamed ${t}`, city: "Navi Mumbai" });
  assert.equal((await r.developers.getById(dev.id))?.displayName, `Pending ${t}`, "published values untouched until republish");
  const published = await r.developers.publishPendingChanges(dev.id);
  assert.equal(published.displayName, `Renamed ${t}`);
  assert.equal(published.city, "Navi Mumbai");
  assert.equal(published.legalName, `Pending ${t} Pvt Ltd`, "keys absent from the patch stay as they were");
  assert.equal(published.pendingChanges, null);
  const entry = (await r.developers.listPublishedPage({ query: `Renamed ${t}` }, { limit: 5, offset: 0 })).entries[0];
  assert.equal(entry.developer.city, "Navi Mumbai");

  const slug = `tx-${randomUUID()}`;
  await assert.rejects(() =>
    r.runInTransaction(async (tx) => {
      await tx.developers.create({ legalName: null, displayName: "Rolled back", slug, city: "Pune", state: "MH", country: "India" });
      throw new Error("boom");
    }),
  /boom/);
  assert.equal(await r.developers.slugExists(slug), false);

  await r.events.append({ websiteCandidateId: randomUUID(), previousStatus: null, newStatus: "DISCOVERED", reason: "x", actorType: "SYSTEM", actorId: "s" });
  const cid = randomUUID();
  await r.events.append({ websiteCandidateId: cid, previousStatus: null, newStatus: "DISCOVERED", reason: "first", actorType: "SYSTEM", actorId: "s" });
  await r.events.append({ websiteCandidateId: cid, previousStatus: "DISCOVERED", newStatus: "VERIFIED", reason: "second", actorType: "FOUNDER", actorId: "f" });
  assert.deepEqual((await r.events.listByCandidate(cid)).map((e) => e.reason), ["first", "second"]);
  await r.developerEditEvents.append({ developerId: dev.id, eventType: "FIELD_CHANGE", fieldName: "city", previousValue: "a", newValue: "b", actorType: "FOUNDER", actorId: "f" });
  assert.equal((await r.developerEditEvents.listByDeveloper(dev.id)).length, 1);
  await r.evidence.add({ websiteCandidateId: cid, evidenceType: "MANUAL_NOTE", detail: "d" } as never);
  assert.equal((await r.evidence.listByCandidate(cid)).length, 1);
});
