import { test } from "node:test";
import assert from "node:assert/strict";
import { TestimonialAuthorizationError, TestimonialStateError, approve, getPublishedTestimonials, moveToReview, publish, recordFounderEntered, seedIllustrativeDrafts, setPublishedWording } from "../service.ts";
import { TestimonialValidationError } from "../model.ts";
import { createInMemoryTestimonialRepository } from "../memory-repository.ts";

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_founder_1" };
const EMPLOYEE = { actorType: "EMPLOYEE" as const, actorId: "user_emp_1" };
const T = (n: number) => new Date(Date.UTC(2026, 9, 9, 10, n));
const ORIGINAL = "Ambish explained the payment plan clearly and never pushed me. I felt looked after.";

async function received(repo: ReturnType<typeof createInMemoryTestimonialRepository>, extra: Record<string, unknown> = {}) {
  return recordFounderEntered(repo, { originalText: ORIGINAL, name: "Asha Verma", displayMode: "FIRST_NAME_LAST_INITIAL", permissionPublish: true, ...extra }, FOUNDER, T(0));
}

test("founder-entered feedback: the client's original words are stored exactly, the history is whole, and it is not public until approved", async () => {
  const repo = createInMemoryTestimonialRepository();
  const row = await received(repo);
  assert.equal(row.status, "RECEIVED");
  assert.equal(row.enteredVia, "FOUNDER_ENTERED");
  assert.equal(row.experience, ORIGINAL, "stored exactly as pasted");
  assert.equal(row.publishedText, null, "nothing is chosen for publication yet");
  assert.deepEqual(repo.events.map((e) => e.toStatus), ["DRAFT", "SENT", "RECEIVED"]);
  assert.deepEqual(await getPublishedTestimonials(repo), []);
});

test("founder-entered feedback: nothing is invented, so no name or no permission means anonymous", async () => {
  const repo = createInMemoryTestimonialRepository();
  const noName = await received(repo, { name: "", displayMode: "FULL_NAME", attributionDetail: "Director, Acme" });
  assert.equal(noName.authorName, null);
  assert.equal(noName.displayMode, "ANONYMOUS");
  const noPermission = await received(repo, { permissionPublish: false, displayMode: "FULL_NAME", attributionDetail: "Director, Acme" });
  assert.equal(noPermission.displayMode, "ANONYMOUS");
  assert.equal(noPermission.attributionDetail, null, "a title or company is kept only with permission");
  assert.equal(noPermission.permissionPublish, false);
  await assert.rejects(recordFounderEntered(repo, { originalText: "short" }, FOUNDER), TestimonialValidationError);
  await assert.rejects(recordFounderEntered(repo, { originalText: ORIGINAL }, EMPLOYEE), TestimonialAuthorizationError);
});

test("paraphrase: the original is never changed, a paraphrase needs the Founder's confirmation, and it is never published as a quotation", async () => {
  const repo = createInMemoryTestimonialRepository();
  const row = await received(repo, { attributionDetail: "Director, Acme", displayMode: "FULL_NAME" });
  const paraphrase = "The payment plan was explained clearly, without pressure, and the client felt looked after.";
  await assert.rejects(setPublishedWording(repo, row.id, { text: paraphrase, paraphrased: true, confirmedFaithful: false }, FOUNDER), /Confirm that the paraphrase/);
  await assert.rejects(setPublishedWording(repo, row.id, { text: "", paraphrased: true, confirmedFaithful: true }, FOUNDER), TestimonialValidationError);
  await assert.rejects(setPublishedWording(repo, row.id, { text: paraphrase + " " + "x".repeat(400), paraphrased: true, confirmedFaithful: true }, FOUNDER), /much longer/, "a paraphrase must not add to what was said");
  const set = await setPublishedWording(repo, row.id, { text: paraphrase, paraphrased: true, confirmedFaithful: true }, FOUNDER, T(1));
  assert.equal(set.experience, ORIGINAL, "the original is untouched");
  assert.equal(set.publishedText, paraphrase);
  assert.equal(set.isParaphrased, true);
  assert.match(repo.events.at(-1)!.note!, /confirmed it is faithful/);
  assert.ok(!repo.events.at(-1)!.note!.includes(paraphrase), "the audit note describes the act, it does not copy the text");

  await moveToReview(repo, row.id, FOUNDER, T(2));
  await approve(repo, row.id, FOUNDER, T(3));
  await publish(repo, row.id, FOUNDER, T(4));
  const [pub] = await getPublishedTestimonials(repo);
  assert.equal(pub.text, paraphrase);
  assert.equal(pub.paraphrased, true, "the renderer is told, so it can leave the quotation marks off");
  assert.equal(pub.attribution, "Director, Acme", "shown only because the client allowed it and gave it");
  assert.ok(!JSON.stringify(pub).includes(ORIGINAL), "the original wording is not exposed publicly");

  // Approved wording cannot be swapped afterwards.
  await assert.rejects(setPublishedWording(repo, row.id, { paraphrased: false }, FOUNDER), TestimonialStateError);
});

test("paraphrase: choosing the original publishes it verbatim, and a paraphrase identical to it counts as verbatim", async () => {
  const repo = createInMemoryTestimonialRepository();
  const row = await received(repo);
  const verbatim = await setPublishedWording(repo, row.id, { paraphrased: false }, FOUNDER);
  assert.equal(verbatim.publishedText, ORIGINAL);
  assert.equal(verbatim.isParaphrased, false);
  const same = await setPublishedWording(repo, row.id, { text: ORIGINAL, paraphrased: true, confirmedFaithful: false }, FOUNDER);
  assert.equal(same.isParaphrased, false, "no confirmation needed when nothing was changed");
});

test("anonymous publication never shows a title or company, even if one was stored", async () => {
  const repo = createInMemoryTestimonialRepository();
  const row = await received(repo, { displayMode: "ANONYMOUS", attributionDetail: "Director, Acme" });
  await setPublishedWording(repo, row.id, { paraphrased: false }, FOUNDER);
  await moveToReview(repo, row.id, FOUNDER);
  await approve(repo, row.id, FOUNDER);
  await publish(repo, row.id, FOUNDER);
  const [pub] = await getPublishedTestimonials(repo);
  assert.equal(pub.attribution, null);
  assert.equal(pub.name, "A Developer Connects client");
});

test("illustrative templates cannot be given published wording", async () => {
  const repo = createInMemoryTestimonialRepository();
  await seedIllustrativeDrafts(repo, FOUNDER);
  const template = [...repo.rows.values()][0];
  await assert.rejects(setPublishedWording(repo, template.id, { paraphrased: false }, FOUNDER), TestimonialStateError);
});

test("the public renderer leaves quotation marks off a paraphrase and puts them only on the client's unaltered words", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../../components/published-testimonials.tsx", import.meta.url), "utf8");
  assert.match(source, /t\.paraphrased \? \(/);
  const paraphraseBranch = source.slice(source.indexOf("t.paraphrased ? ("), source.indexOf(") : ("));
  assert.ok(!/ldquo|rdquo|&quot;|“|”/.test(paraphraseBranch), "no quotation marks around a paraphrase");
  assert.match(source.slice(source.indexOf(") : (")), /&ldquo;\{t\.text\}&rdquo;/);
});
