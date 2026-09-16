import { test } from "node:test";
import assert from "node:assert/strict";
import { submitInaccuracyReport, submitContactMessage, subscribeToNewsletter } from "../engagement-service.ts";
import { createInMemoryEngagementRepositories } from "../memory-repository.ts";
import { setUpTestDeveloper } from "../../developer-connect/__tests__/test-helpers.ts";
import { NotFoundError } from "../../developer-connect/errors.ts";

test("submitInaccuracyReport: creates a NEW report tied to a real developer", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const engagement = createInMemoryEngagementRepositories();

  const report = await submitInaccuracyReport(engagement, repos.developers, {
    developerId: developer.id,
    category: "OFFICIAL_WEBSITE",
    details: "The website listed goes to a 404 page",
    reporterEmail: "visitor@example.com",
  });

  assert.equal(report.developerId, developer.id);
  assert.equal(report.status, "NEW");
  assert.equal(report.reporterEmail, "visitor@example.com");
});

test("submitInaccuracyReport: reporter email is optional", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const engagement = createInMemoryEngagementRepositories();

  const report = await submitInaccuracyReport(engagement, repos.developers, {
    developerId: developer.id,
    category: "OTHER",
    details: "Something looks off",
  });

  assert.equal(report.reporterEmail, null);
});

test("submitInaccuracyReport: rejects a fabricated developerId (ownership validation)", async () => {
  const { developers } = (await setUpTestDeveloper()).repos;
  const engagement = createInMemoryEngagementRepositories();

  await assert.rejects(
    () =>
      submitInaccuracyReport(engagement, developers, {
        developerId: "does-not-exist",
        category: "OTHER",
        details: "x",
      }),
    NotFoundError,
  );
});

test("submitInaccuracyReport: rejects empty details", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const engagement = createInMemoryEngagementRepositories();

  await assert.rejects(() =>
    submitInaccuracyReport(engagement, repos.developers, {
      developerId: developer.id,
      category: "OTHER",
      details: "   ",
    }),
  );
});

test("submitInaccuracyReport: rejects a malformed optional email", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const engagement = createInMemoryEngagementRepositories();

  await assert.rejects(() =>
    submitInaccuracyReport(engagement, repos.developers, {
      developerId: developer.id,
      category: "OTHER",
      details: "x",
      reporterEmail: "not-an-email",
    }),
  );
});

test("submitContactMessage: creates an OPEN submission", async () => {
  const engagement = createInMemoryEngagementRepositories();

  const submission = await submitContactMessage(engagement, {
    name: "Priya",
    email: "priya@example.com",
    reason: "GENERAL_QUESTION",
    message: "How do I find a developer in Thane?",
  });

  assert.equal(submission.status, "OPEN");
  assert.equal(submission.userId, null);
});

test("submitContactMessage: requires a valid email", async () => {
  const engagement = createInMemoryEngagementRepositories();
  await assert.rejects(() =>
    submitContactMessage(engagement, { name: "Priya", email: "nope", reason: "OTHER", message: "hi" }),
  );
});

test("subscribeToNewsletter: a first-time signup is not 'already subscribed'", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const { subscriber, alreadySubscribed } = await subscribeToNewsletter(engagement, {
    email: "reader@example.com",
    source: "footer",
  });
  assert.equal(subscriber.status, "SUBSCRIBED");
  assert.equal(alreadySubscribed, false);
});

test("subscribeToNewsletter: signing up twice with the same email never creates a duplicate row, and reports alreadySubscribed", async () => {
  const engagement = createInMemoryEngagementRepositories();
  await subscribeToNewsletter(engagement, { email: "reader@example.com", source: "footer" });
  const second = await subscribeToNewsletter(engagement, { email: "reader@example.com", source: "homepage" });

  assert.equal(second.alreadySubscribed, true);
  const all = await engagement.newsletter.list();
  assert.equal(all.length, 1);
});

test("subscribeToNewsletter: countActive reflects only SUBSCRIBED rows, a real distinct-person count", async () => {
  const engagement = createInMemoryEngagementRepositories();
  await subscribeToNewsletter(engagement, { email: "a@example.com" });
  await subscribeToNewsletter(engagement, { email: "b@example.com" });
  await subscribeToNewsletter(engagement, { email: "a@example.com" }); // duplicate signup

  assert.equal(await engagement.newsletter.countActive(), 2);
});
