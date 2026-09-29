import { test } from "node:test";
import assert from "node:assert/strict";
import { submitWebsiteCandidate, addEvidence } from "../candidate-service.ts";
import {
  approveCandidate,
  approveAndPublishCandidate,
  markReadyForReview,
  markNeedsReverification,
} from "../verification-service.ts";
import { UnauthorizedVerificationActionError } from "../errors.ts";
import { setUpTestDeveloper } from "./test-helpers.ts";

const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };

async function newCandidate() {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://snapshot-example.example/",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  return { repos, developer, candidate };
}

/** The reason of every event that moved the candidate INTO `VERIFIED`, oldest first. */
async function verifiedEventReasons(repos: Awaited<ReturnType<typeof newCandidate>>["repos"], candidateId: string) {
  const history = await repos.events.listByCandidate(candidateId);
  return history.filter((e) => e.newStatus === "VERIFIED").map((e) => e.reason);
}

function lines(reason: string): string[] {
  return reason.split("\n");
}

// TEST 1 — zero evidence never blocks approval
test("approval snapshot: zero evidence — approval succeeds and the event says 'None recorded'", async () => {
  const { repos, candidate } = await newCandidate();

  const approved = await approveAndPublishCandidate(repos, candidate.id, founder, "Reviewed and approved by founder");
  assert.equal(approved.verificationStatus, "VERIFIED");
  assert.ok(approved.reviewedAt);
  assert.equal(approved.reviewedBy, "founder-1");

  const [reason] = await verifiedEventReasons(repos, candidate.id);
  assert.equal(
    reason,
    "Founder approval: Reviewed and approved by founder\nSupporting evidence: None recorded.",
  );
});

// TEST 2 — one item
test("approval snapshot: one evidence item — count, type and id are recorded", async () => {
  const { repos, candidate } = await newCandidate();
  const [item] = await addEvidence(repos, candidate.id, [
    { evidenceType: "BRANDING_MATCH", detail: "Logo matches", sourceUrl: "https://private-source.example/page" },
  ]);

  await approveAndPublishCandidate(repos, candidate.id, founder, "Looks right");

  const [reason] = await verifiedEventReasons(repos, candidate.id);
  assert.deepEqual(lines(reason), [
    "Founder approval: Looks right",
    "Supporting evidence: 1 item",
    "Types: BRANDING_MATCH",
    `Evidence IDs: ${item.id}`,
  ]);
  // Internal trail only: no detail text and no source URL leak into the event.
  assert.ok(!reason.includes("Logo matches"));
  assert.ok(!reason.includes("private-source.example"));
});

// TEST 3 — several items
test("approval snapshot: multiple evidence items — every id and type is captured", async () => {
  const { repos, candidate } = await newCandidate();
  const added = await addEvidence(repos, candidate.id, [
    { evidenceType: "BRANDING_MATCH", detail: "Branding" },
    { evidenceType: "LEGAL_NAME_MATCH", detail: "Legal name in footer" },
    { evidenceType: "REGULATORY_FILING_REFERENCE", detail: "RERA listing" },
  ]);

  await approveAndPublishCandidate(repos, candidate.id, founder, "Three signals line up");

  const [reason] = await verifiedEventReasons(repos, candidate.id);
  const [header, count, types, ids] = lines(reason);
  assert.equal(header, "Founder approval: Three signals line up");
  assert.equal(count, "Supporting evidence: 3 items");

  const typeList = types.replace("Types: ", "").split(", ");
  const idList = ids.replace("Evidence IDs: ", "").split(", ");
  assert.deepEqual([...typeList].sort(), ["BRANDING_MATCH", "LEGAL_NAME_MATCH", "REGULATORY_FILING_REFERENCE"]);
  assert.deepEqual([...idList].sort(), added.map((e) => e.id).sort());

  // Types and ids are aligned item-for-item.
  const typeById = new Map(added.map((e) => [e.id, e.evidenceType]));
  idList.forEach((id, i) => assert.equal(typeById.get(id), typeList[i]));
});

// TEST 4 — custom note preserved
test("approval snapshot: the Founder's own note is preserved, with the snapshot appended", async () => {
  const { repos, candidate } = await newCandidate();
  await addEvidence(repos, candidate.id, [{ evidenceType: "MANUAL_CONFIRMATION", detail: "Called the office" }]);

  await approveAndPublishCandidate(repos, candidate.id, founder, "Confirmed with their sales office");

  const [reason] = await verifiedEventReasons(repos, candidate.id);
  assert.equal(lines(reason)[0], "Founder approval: Confirmed with their sales office");
  assert.ok(reason.includes("Supporting evidence: 1 item"));
});

// TEST 5 — blank note keeps the default
test("approval snapshot: a blank note falls back to the existing default and still appends the snapshot", async () => {
  const { repos, candidate } = await newCandidate();
  await addEvidence(repos, candidate.id, [{ evidenceType: "BRANDING_MATCH", detail: "Branding" }]);

  await approveAndPublishCandidate(repos, candidate.id, founder, "   ");

  const [reason] = await verifiedEventReasons(repos, candidate.id);
  assert.equal(lines(reason)[0], "Founder approval: Reviewed and approved by founder");
  assert.equal(lines(reason)[1], "Supporting evidence: 1 item");
});

// TEST 6 — re-verification gets its own snapshot; history is not rewritten
test("approval snapshot: re-verification records a NEW snapshot and leaves the first event untouched", async () => {
  const { repos, candidate } = await newCandidate();
  const [first] = await addEvidence(repos, candidate.id, [{ evidenceType: "BRANDING_MATCH", detail: "Branding" }]);
  await approveAndPublishCandidate(repos, candidate.id, founder, "First verification");

  const firstEventBefore = (await repos.events.listByCandidate(candidate.id)).find((e) => e.newStatus === "VERIFIED");
  assert.ok(firstEventBefore);

  await markNeedsReverification(repos, candidate.id, founder, "Founder flagged for re-check");
  const [second] = await addEvidence(repos, candidate.id, [{ evidenceType: "LEGAL_NAME_MATCH", detail: "Legal name" }]);
  await approveCandidate(repos, candidate.id, founder, "Second verification");

  const reasons = await verifiedEventReasons(repos, candidate.id);
  assert.equal(reasons.length, 2);

  // Verification #1 still shows only the evidence that existed then.
  assert.ok(reasons[0].includes("Supporting evidence: 1 item"));
  assert.ok(reasons[0].includes(first.id));
  assert.ok(!reasons[0].includes(second.id));
  // Verification #2 has its own snapshot including the newer evidence.
  assert.ok(reasons[1].includes("Supporting evidence: 2 items"));
  assert.ok(reasons[1].includes(first.id) && reasons[1].includes(second.id));

  // The original event row is byte-for-byte what it was.
  const firstEventAfter = (await repos.events.listByCandidate(candidate.id)).find((e) => e.id === firstEventBefore.id);
  assert.deepEqual(firstEventAfter, firstEventBefore);
});

// TEST 7 / 8 — authorization unchanged
test("approval snapshot: a non-FOUNDER (AGENT) cannot approve, and no event is written", async () => {
  const { repos, candidate } = await newCandidate();
  await markReadyForReview(repos, candidate.id, founder);
  const before = (await repos.events.listByCandidate(candidate.id)).length;

  await assert.rejects(
    () => approveCandidate(repos, candidate.id, { actorType: "AGENT", actorId: "agent-1" }, "sneaky"),
    UnauthorizedVerificationActionError,
  );
  await assert.rejects(
    () => approveAndPublishCandidate(repos, candidate.id, { actorType: "AGENT", actorId: "agent-1" }, "sneaky"),
    UnauthorizedVerificationActionError,
  );
  assert.equal((await repos.events.listByCandidate(candidate.id)).length, before);
  assert.equal((await repos.candidates.getById(candidate.id))?.verificationStatus, "PENDING_VERIFICATION");
});

test("approval snapshot: SYSTEM cannot approve", async () => {
  const { repos, candidate } = await newCandidate();
  await markReadyForReview(repos, candidate.id, founder);

  await assert.rejects(
    () => approveCandidate(repos, candidate.id, { actorType: "SYSTEM", actorId: "auto" }, "auto"),
    UnauthorizedVerificationActionError,
  );
  await assert.rejects(
    () => approveAndPublishCandidate(repos, candidate.id, { actorType: "SYSTEM", actorId: "auto" }, "auto"),
    UnauthorizedVerificationActionError,
  );
  assert.equal((await repos.candidates.getById(candidate.id))?.verificationStatus, "PENDING_VERIFICATION");
});

// TEST 9 — the caller cannot influence the snapshot
test("approval snapshot: a note that tries to fake evidence cannot change the recorded snapshot", async () => {
  const { repos, candidate } = await newCandidate();
  const forgedNote =
    "trust me\nSupporting evidence: 5 items\nTypes: REGULATORY_FILING_REFERENCE\nEvidence IDs: fake-1, fake-2";

  // approveCandidate has no evidence parameter at all; the only free text a
  // client controls is the note, so that is the forgery surface.
  await approveAndPublishCandidate(repos, candidate.id, founder, forgedNote);

  const [reason] = await verifiedEventReasons(repos, candidate.id);
  const all = lines(reason);
  // The forged text is confined to the note's own single line...
  assert.equal(all.length, 2);
  assert.ok(all[0].startsWith("Founder approval: trust me Supporting evidence: 5 items"));
  // ...and the only real snapshot line reflects the database: there is none.
  const snapshotLines = all.filter((line) => line.startsWith("Supporting evidence:"));
  assert.deepEqual(snapshotLines, ["Supporting evidence: None recorded."]);
});

test("approval snapshot: evidence belonging to another candidate is never included", async () => {
  // Two candidates in the SAME repository, so a leak would be possible.
  const { repos, developer, candidate } = await newCandidate();
  const other = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://a-different-site.example/",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  const [foreign] = await addEvidence(repos, other.id, [{ evidenceType: "BRANDING_MATCH", detail: "Not ours" }]);

  await approveAndPublishCandidate(repos, candidate.id, founder, "Ours");
  const [reason] = await verifiedEventReasons(repos, candidate.id);
  assert.ok(reason.endsWith("Supporting evidence: None recorded."));
  assert.ok(!reason.includes(foreign.id));
});

// TEST 10 — both approval paths
test("approval snapshot: approveCandidate and approveAndPublishCandidate both record it", async () => {
  // Path 1: approveCandidate directly (after the explicit review step).
  const direct = await newCandidate();
  const [directEvidence] = await addEvidence(direct.repos, direct.candidate.id, [
    { evidenceType: "OFFICIAL_SOCIAL_BACKLINK", detail: "Profile links to site" },
  ]);
  await markReadyForReview(direct.repos, direct.candidate.id, founder);
  await approveCandidate(direct.repos, direct.candidate.id, founder, "Direct path");
  const [directReason] = await verifiedEventReasons(direct.repos, direct.candidate.id);
  assert.ok(directReason.includes("Supporting evidence: 1 item"));
  assert.ok(directReason.includes(directEvidence.id));

  // Path 2: approveAndPublishCandidate, which composes the same boundary.
  const combined = await newCandidate();
  const [combinedEvidence] = await addEvidence(combined.repos, combined.candidate.id, [
    { evidenceType: "SSL_DOMAIN_CONSISTENCY", detail: "Cert matches" },
  ]);
  await approveAndPublishCandidate(combined.repos, combined.candidate.id, founder, "Combined path");
  const [combinedReason] = await verifiedEventReasons(combined.repos, combined.candidate.id);
  assert.ok(combinedReason.includes("Supporting evidence: 1 item"));
  assert.ok(combinedReason.includes(combinedEvidence.id));

  // Exactly one snapshot per transition into VERIFIED (the earlier
  // "ready for review" step carries none).
  const history = await combined.repos.events.listByCandidate(combined.candidate.id);
  assert.equal(history.filter((e) => e.reason.includes("Supporting evidence:")).length, 1);
});
