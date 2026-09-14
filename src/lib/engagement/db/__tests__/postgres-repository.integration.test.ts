import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";

/**
 * Real-Postgres coverage for the new inaccuracy_reports/contact_submissions/
 * newsletter_subscribers tables (the schema migration this task's Report/
 * Contact/Newsletter features required — see the migration under
 * src/lib/developer-connect/db/migrations/). Same convention as
 * developer-connect's own postgres-repository.integration.test.ts: leaves
 * "TEST —"-ish rows behind, skipped unless TEST_DATABASE_URL is set.
 */

test(
  "postgres engagement: an inaccuracy report is created against a real developer and status transitions persist",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../../../developer-connect/db/postgres-repository.ts");
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const devRepos = createPostgresRepositories();
    const engagement = createEngagementRepositories();

    const developer = await devRepos.developers.create({
      legalName: `TEST — Engagement Report Co ${randomUUID()}`,
      displayName: `TEST — Engagement Report Co ${randomUUID()}`,
      slug: `test-engagement-report-${randomUUID()}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    const report = await engagement.reports.create({
      developerId: developer.id,
      category: "OFFICIAL_WEBSITE",
      details: "Link is broken",
      reporterEmail: "visitor@example.com",
    });
    assert.equal(report.status, "NEW");

    const list = await engagement.reports.list();
    assert.ok(list.some((r) => r.id === report.id));

    const updated = await engagement.reports.updateStatus(report.id, "RESOLVED");
    assert.equal(updated?.status, "RESOLVED");
  },
);

test(
  "postgres engagement: contact submissions persist and status updates work",
  { skip: !hasTestDatabase },
  async () => {
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const engagement = createEngagementRepositories();

    const submission = await engagement.contact.create({
      name: "TEST — Contact Visitor",
      email: `test-contact-${randomUUID()}@example.com`,
      reason: "GENERAL_QUESTION",
      message: "Hello",
    });
    assert.equal(submission.status, "NEW");

    const updated = await engagement.contact.updateStatus(submission.id, "RESPONDED");
    assert.equal(updated?.status, "RESPONDED");
  },
);

test(
  "postgres engagement: newsletter subscribe is a real upsert by email at the database level — no duplicate row on a repeat signup",
  { skip: !hasTestDatabase },
  async () => {
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const engagement = createEngagementRepositories();
    const email = `test-newsletter-${randomUUID()}@example.com`;

    const first = await engagement.newsletter.subscribe({ email, source: "footer" });
    assert.equal(first.alreadySubscribed, false);

    const second = await engagement.newsletter.subscribe({ email, source: "homepage" });
    assert.equal(second.alreadySubscribed, true);
    assert.equal(second.subscriber.id, first.subscriber.id);

    const all = await engagement.newsletter.list(1000);
    const matches = all.filter((s) => s.email === email);
    assert.equal(matches.length, 1, "the database's unique index on email must prevent a duplicate row");
  },
);
