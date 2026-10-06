import { test } from "node:test";
import assert from "node:assert/strict";
import { captureAssistanceLead, getLeadTimeline } from "../lead-service.ts";
import { classifyDigitalSource, leadSourceLabel } from "../lead-source.ts";
import { createSelfGeneratedLead, importLeadsFromCsv, parseCsv, MAX_IMPORT_ROWS } from "../lead-import-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { LeadActor } from "../types.ts";
import { BUYER, FOUNDER, SYSTEM, captureInput, minutes, T0 } from "./test-helpers.ts";

/** Lead source (where a lead came from) — separate from the calls made to it — and the CSV import / hand-created leads. */

const touch = (over: Record<string, string | null> = {}) => ({ gclid: null, fbclid: null, utmSource: null, utmMedium: null, referrer: null, ...over });

test("digital source: classified from the first touch's evidence — Google, Meta, referral, organic search, other, or plain website", () => {
  assert.equal(classifyDigitalSource(null), "WEBSITE");
  assert.equal(classifyDigitalSource(touch()), "WEBSITE");
  assert.equal(classifyDigitalSource(touch({ gclid: "abc" })), "GOOGLE");
  assert.equal(classifyDigitalSource(touch({ utmSource: "Google" })), "GOOGLE");
  assert.equal(classifyDigitalSource(touch({ fbclid: "x" })), "META");
  assert.equal(classifyDigitalSource(touch({ utmSource: "instagram" })), "META");
  assert.equal(classifyDigitalSource(touch({ utmMedium: "referral" })), "REFERRAL");
  assert.equal(classifyDigitalSource(touch({ referrer: "https://www.google.com/" })), "ORGANIC");
  assert.equal(classifyDigitalSource(touch({ referrer: "https://some-blog.example/post" })), "REFERRAL");
  assert.equal(classifyDigitalSource(touch({ utmSource: "newsletter" })), "OTHER_DIGITAL");
  assert.equal(classifyDigitalSource(touch({ gclid: "abc", referrer: "https://www.google.com/" })), "GOOGLE", "an ad click beats a search referrer");
});

test("website capture: a lead from the gate is DIGITAL / WEBSITE_GATE with its classified detail, and a repeat visit never reclassifies it", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ currentTouch: { sessionId: "s1", landingPath: "/developers/acme", gclid: "abc" } }), T0);
  assert.equal(lead.sourceType, "DIGITAL");
  assert.equal(lead.sourceDetail, "GOOGLE");
  assert.equal(lead.creationMethod, "WEBSITE_GATE");
  assert.equal(lead.createdBy, null);
  const again = await captureAssistanceLead(repos, captureInput({ currentTouch: { sessionId: "s2", landingPath: "/developers/acme", fbclid: "zzz" } }), minutes(60));
  assert.equal(again.lead.sourceDetail, "GOOGLE", "the first touch decides");
  assert.equal(leadSourceLabel(again.lead), "Digital · Google");
});

test("csv: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, a BOM, and blank lines all parse", () => {
  const rows = parseCsv('﻿name,phone,email\r\n"Verma, Asha","98765 43210",a@x.com\r\n\r\n"He said ""hi""\nthere",+919811122233,\r\nlast,9000000001,');
  assert.deepEqual(rows, [
    ["name", "phone", "email"],
    ["Verma, Asha", "98765 43210", "a@x.com"],
    ['He said "hi"\nthere', "+919811122233", ""],
    ["last", "9000000001", ""],
  ]);
});

const CSV = `Name,Mobile,Email
Asha Verma,98765 43210,Asha@Example.com
Ravi Kumar,+91 98111 22233,
,98765 43210,
Bad Number,12345,
No Phone,,
Mail Wrong,90000 00001,not-an-email
Fresh Lead,90000 00002,`;

test("import: leads are created as SELF_GENERATED / EXCEL_IMPORT with the batch, who and when; duplicates and bad rows are counted, not created", async () => {
  const repos = createInMemoryLeadRepositories();
  const result = await importLeadsFromCsv(repos, CSV, { name: "Thane list Oct", originalFilename: "thane.csv", campaign: "Thane cold list" }, FOUNDER, minutes(10));
  assert.equal(result.created, 3);
  assert.deepEqual(result.duplicates, [{ row: 3, reason: "Repeated in this file" }]);
  assert.deepEqual(result.rejected.map((r) => [r.row, r.reason]), [[4, "Not a valid phone number"], [5, "No phone number"], [6, "Not a valid email address"]]);
  assert.deepEqual([result.batch.rowCount, result.batch.createdCount, result.batch.duplicateCount, result.batch.rejectedCount], [7, 3, 1, 3]);
  assert.equal(result.batch.importedBy, FOUNDER.actorId);
  assert.equal(result.batch.importedAt.getTime(), minutes(10).getTime());
  assert.equal(result.batch.originalFilename, "thane.csv");

  const leads = [...(await repos.leads.list({ view: "all", limit: 50, offset: 0, now: minutes(11), endOfToday: minutes(900) })).leads];
  assert.equal(leads.length, 3);
  for (const lead of leads) {
    assert.equal(lead.sourceType, "SELF_GENERATED");
    assert.equal(lead.creationMethod, "EXCEL_IMPORT");
    assert.equal(lead.sourceDetail, "Thane cold list");
    assert.equal(lead.importBatchId, result.batch.id, "the batch is preserved on every lead");
    assert.equal(lead.createdBy, FOUNDER.actorId);
    assert.equal(lead.ownerId, null, "imported leads wait in the Founder queue");
    assert.equal(lead.contactPreference, "PHONE_CALL");
    assert.equal(leadSourceLabel(lead), "Self-generated · Excel import");
    const [created] = (await getLeadTimeline(repos, lead.id)).filter((e) => e.eventType === "LEAD_CREATED");
    assert.deepEqual(created.payload, { via: "IMPORT", batchId: result.batch.id });
    assert.equal(created.actorId, FOUNDER.actorId);
    assert.equal((await repos.consents.listByLead(lead.id)).length, 0, "no buyer consent record exists for a self-generated lead");
  }
  const asha = leads.find((l) => l.name === "Asha Verma")!;
  assert.equal(asha.email, "asha@example.com");
  assert.equal(asha.phoneE164, "+919876543210");
});

test("import: a number already in the system is never modified — it is counted as a duplicate and keeps its source", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead: website } = await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 43210", name: "Website Asha" }), T0);
  const result = await importLeadsFromCsv(repos, "phone,name\n98765 43210,Imported Asha\n90000 00005,New One", {}, FOUNDER, minutes(10));
  assert.equal(result.created, 1);
  assert.deepEqual(result.duplicates, [{ row: 1, reason: "Already in the system" }]);
  const kept = (await repos.leads.getById(website.id))!;
  assert.equal(kept.name, "Website Asha");
  assert.equal(kept.sourceType, "DIGITAL");
  assert.equal(kept.importBatchId, null);
});

test("import: file validation — Founder only, empty, no phone column, header only, too many rows, too large — and a failure imports nothing", async () => {
  const repos = createInMemoryLeadRepositories();
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE", actorId: "user_e" } as LeadActor, { actorType: "FOUNDER" } as LeadActor]) {
    await assert.rejects(importLeadsFromCsv(repos, CSV, {}, actor, minutes(1)), UnauthorizedLeadActionError);
  }
  await assert.rejects(importLeadsFromCsv(repos, "  ", {}, FOUNDER), LeadValidationError);
  await assert.rejects(importLeadsFromCsv(repos, "name,email\nA,a@x.com", {}, FOUNDER), /phone/);
  await assert.rejects(importLeadsFromCsv(repos, "name,phone", {}, FOUNDER), /no leads/);
  const tooMany = "phone\n" + Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `9${String(100000000 + i)}`).join("\n");
  await assert.rejects(importLeadsFromCsv(repos, tooMany, {}, FOUNDER), /at most/);
  await assert.rejects(importLeadsFromCsv(repos, "phone\n" + "9".repeat(1_100_000), {}, FOUNDER), /too large/);
  assert.deepEqual(await repos.importBatches.list(10), [], "a refused file leaves no batch behind");
});

test("batch traceability: batch → leads is queryable through the lead rows, and each batch keeps its own counts", async () => {
  const repos = createInMemoryLeadRepositories();
  const one = await importLeadsFromCsv(repos, "phone\n90000 00010\n90000 00011", { name: "Batch one" }, FOUNDER, minutes(1));
  const two = await importLeadsFromCsv(repos, "phone\n90000 00012", { name: "Batch two" }, FOUNDER, minutes(2));
  const all = (await repos.leads.list({ view: "all", limit: 50, offset: 0, now: minutes(3), endOfToday: minutes(900) })).leads;
  assert.equal(all.filter((l) => l.importBatchId === one.batch.id).length, 2);
  assert.equal(all.filter((l) => l.importBatchId === two.batch.id).length, 1);
  assert.deepEqual((await repos.importBatches.list(10)).map((b) => b.name), ["Batch two", "Batch one"]);
});

test("hand-created leads: a team member's lead is theirs from the start and labelled; the Founder's goes to the queue; an existing number reveals nothing", async () => {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER);
  const priyaActor = (await resolveEmployee(staff, priya.userId))!.actor;

  const mine = await createSelfGeneratedLead(repos, { phone: "90000 00020", name: "Cold Contact", creationMethod: "COLD_CALLING" }, priyaActor, minutes(5));
  assert.ok(mine.created);
  if (!mine.created) return;
  assert.equal(mine.lead.ownerId, priya.userId);
  assert.equal(mine.lead.sourceType, "SELF_GENERATED");
  assert.equal(mine.lead.creationMethod, "COLD_CALLING");
  assert.equal(mine.lead.createdBy, priya.userId);
  const events = (await getLeadTimeline(repos, mine.lead.id)).map((e) => e.eventType);
  assert.deepEqual(events, ["LEAD_CREATED", "OWNER_CHANGED"]);

  const founders = await createSelfGeneratedLead(repos, { phone: "90000 00021", creationMethod: "EMPLOYEE_CREATED" }, FOUNDER, minutes(6));
  assert.ok(founders.created);
  if (founders.created) {
    assert.equal(founders.lead.creationMethod, "FOUNDER_CREATED", "the method follows who actually created it");
    assert.equal(founders.lead.ownerId, null);
  }
  const { lead: website } = await captureAssistanceLead(repos, captureInput({ phone: "+91 90000 00022" }), T0);
  const clash = await createSelfGeneratedLead(repos, { phone: "90000 00022", creationMethod: "COLD_CALLING" }, priyaActor, minutes(7));
  assert.deepEqual(clash, { created: false }, "no lead data is handed back for an existing number");
  assert.equal((await repos.leads.getById(website.id))?.ownerId, null, "and the existing lead is untouched");

  await assert.rejects(createSelfGeneratedLead(repos, { phone: "nope", creationMethod: "COLD_CALLING" }, priyaActor), LeadValidationError);
  await assert.rejects(createSelfGeneratedLead(repos, { phone: "90000 00023", creationMethod: "WEBSITE_GATE" as never }, priyaActor), LeadValidationError);
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor]) {
    await assert.rejects(createSelfGeneratedLead(repos, { phone: "90000 00024", creationMethod: "COLD_CALLING" }, actor), UnauthorizedLeadActionError);
  }
});

test("source vs calls: the lead source label never mentions calls, and DIGITAL vs SELF_GENERATED stay distinct for every creation method", () => {
  const label = (sourceType: "DIGITAL" | "SELF_GENERATED", creationMethod: string, sourceDetail: string | null = null) => leadSourceLabel({ sourceType, creationMethod, sourceDetail });
  assert.equal(label("DIGITAL", "WEBSITE_GATE", "META"), "Digital · Meta");
  assert.equal(label("DIGITAL", "WEBSITE_GATE"), "Digital");
  assert.equal(label("SELF_GENERATED", "COLD_CALLING"), "Self-generated · Cold calling");
  assert.equal(label("SELF_GENERATED", "DIALER_GENERATED"), "Self-generated · Dialer-generated");
  assert.equal(label("SELF_GENERATED", "EMPLOYEE_CREATED"), "Self-generated · Added by employee");
  assert.ok(!/call|dialer|connected/i.test(label("DIGITAL", "WEBSITE_GATE", "GOOGLE")));
});
