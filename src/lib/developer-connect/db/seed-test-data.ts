/**
 * Development/test seeding only. Every record created here is prefixed
 * "TEST —" so it can never be mistaken for a real developer, and this
 * script never calls approveCandidate — nothing it inserts can end up
 * VERIFIED. Real Mumbai developers are added later, one at a time,
 * through actual founder verification, never through seeding.
 *
 * Always targets TEST_DATABASE_URL, never DATABASE_URL — see
 * test-db-guard.ts, imported first below. Refuses to run unless a
 * disposable test database is configured, and unless ALLOW_TEST_SEED=true
 * is also set, so it can't be triggered by accident.
 *
 * Usage: npx dotenv -e .env.local -- node --experimental-strip-types \
 *   src/lib/developer-connect/db/seed-test-data.ts
 */
import { hasTestDatabase } from "./test-db-guard.ts";
import { createPostgresRepositories } from "./postgres-repository.ts";
import { closeDb } from "./client.ts";
import { createDeveloper } from "../developer-service.ts";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import { markReadyForReview } from "../verification-service.ts";

async function main() {
  if (!hasTestDatabase) {
    throw new Error("Refusing to seed: TEST_DATABASE_URL is not configured.");
  }
  if (process.env.ALLOW_TEST_SEED !== "true") {
    throw new Error(
      "Refusing to seed: set ALLOW_TEST_SEED=true to confirm this is a disposable test database.",
    );
  }

  const repos = createPostgresRepositories();
  const founder = { actorType: "FOUNDER" as const, actorId: "seed-script" };

  const developer = await createDeveloper(repos.developers, {
    legalName: "TEST — Seed Developer Private Limited",
    displayName: "TEST — Seed Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
    initialEvidence: [
      { evidenceType: "MANUAL_CONFIRMATION", detail: "Seed data — not a real confirmation" },
    ],
  });
  await markReadyForReview(repos, candidate.id, founder, "Seed data — left pending for manual review UI testing");

  console.log(`Seeded developer ${developer.slug} with candidate ${candidate.id} (PENDING_VERIFICATION, not verified).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
