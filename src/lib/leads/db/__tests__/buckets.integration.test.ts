import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Source buckets and card insights against the REAL PostgreSQL adapter (test database only). */
const skip = !hasTestDatabase;

const mobile = () => "+919" + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");

test("integration: the source filter, counts and bucketInsights agree with each other and with the data", { skip }, async () => {
  const [leadPg, svc, calls, projectService, leadService, schema, client, drizzle, views] = await Promise.all([
    import("../postgres-repository.ts"),
    import("../../lead-import-service.ts"),
    import("../../call-service.ts"),
    import("../../project-service.ts"),
    import("../../lead-service.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
    import("../../lead-views.ts"),
  ]);
  void drizzle;
  const db = client.getDb();
  const repos = leadPg.createPostgresLeadRepositories();
  const founder = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const employee = { actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };

  const developerId = randomUUID();
  const slug = `test-bucket-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Bucket Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const project = await projectService.createProject(repos, { developerId, name: `Bucket Project ${randomUUID().slice(0, 6)}`, city: "Thane" }, founder);

  const cold = await svc.createSelfGeneratedLead(repos, { phone: mobile(), name: "TEST bucket cold", creationMethod: "COLD_CALLING" }, employee);
  assert.ok(cold.created);
  const sessionId = `bk-${randomUUID()}`;
  const digital = (await leadService.captureAssistanceLead(repos, { phone: mobile(), name: "TEST bucket digital", email: null, contactPreference: "PHONE_CALL", developer: { id: developerId, slug, displayName: "TEST — Bucket Co" }, sourceCta: "developer_page", sessionId, currentTouch: { sessionId, landingPath: `/developers/${slug}`, utmSource: "instagram" } })).lead;
  assert.equal(digital.sourceType, "DIGITAL");
  assert.equal(digital.sourceDetail, "INSTAGRAM", "the finer digital classifier is stored");

  // Give the cold lead an interested project and a finished, connected call.
  await projectService.shortlistProject(repos, cold.lead.id, project.id, employee, new Date(), { advanceStatus: false });
  const prepared = await calls.prepareDeviceCall(repos, cold.lead.id, employee, {});
  await calls.reportDeviceCall(repos, prepared.call.id, { startedAt: new Date(), durationSeconds: 31, simRef: "1", callLogRef: "5", deviceRef: "Pixel" }, employee);

  const now = new Date();
  const endOfToday = new Date(now.getTime() + 86_400_000);
  const query = (sourceType?: "COLD_CALL" | "DIGITAL") => ({ view: "all" as const, sourceType, limit: 5000, offset: 0, now, endOfToday });
  const everything = await repos.leads.list(query());
  const coldList = await repos.leads.list(query("COLD_CALL"));
  const digitalList = await repos.leads.list(query("DIGITAL"));
  assert.equal(coldList.total + digitalList.total, everything.total, "an exact partition in the database too");
  assert.ok(coldList.leads.some((l) => l.id === cold.lead.id) && !digitalList.leads.some((l) => l.id === cold.lead.id));
  assert.ok(digitalList.leads.some((l) => l.id === digital.id) && !coldList.leads.some((l) => l.id === digital.id));
  assert.ok(coldList.leads.every((l) => l.sourceType === "COLD_CALL") && digitalList.leads.every((l) => l.sourceType === "DIGITAL"));

  const mine = await repos.leads.list({ ...query("COLD_CALL"), ownerId: employee.actorId });
  assert.deepEqual(mine.leads.map((l) => l.id), [cold.lead.id], "the owner scope still ANDs with the source");

  const counts = { all: await repos.leads.counts(now, endOfToday), cold: await repos.leads.counts(now, endOfToday, "COLD_CALL"), digital: await repos.leads.counts(now, endOfToday, "DIGITAL") };
  assert.equal(counts.cold.total + counts.digital.total, counts.all.total);
  assert.equal(counts.cold.total, coldList.total, "the tile count equals the list total");
  assert.equal(counts.digital.total, digitalList.total);
  void views;

  const [insight, bare] = await repos.leads.bucketInsights([cold.lead.id, digital.id]);
  assert.deepEqual(insight.interestedProjects, [project.name]);
  assert.equal(insight.interestedProjectCount, 1);
  assert.equal(insight.lastCallClassification, "CONNECTED");
  assert.equal(insight.lastCallDurationSeconds, 31);
  assert.ok(insight.lastCallAt instanceof Date);
  assert.deepEqual([bare.lastCallAt, bare.interestedProjectCount, bare.lastCallClassification], [null, 0, null]);
  assert.equal((await repos.leads.getById(cold.lead.id))!.status, "NEW", "interest in a project did not move the pipeline");
});
