import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRepositories } from "../memory-repository.ts";
import {
  createDeveloper,
  updateDeveloper,
  republishDeveloper,
  discardPendingChanges,
  effectiveDeveloperFields,
} from "../developer-service.ts";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import { approveAndPublishCandidate } from "../verification-service.ts";
import type { DeveloperConnectRepositories } from "../repository.ts";

test("developer-service: two developers with the same display name get distinct slugs", async () => {
  const repos = createInMemoryRepositories();

  const first = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
  const second = await createDeveloper(repos.developers, {
    legalName: "Test Developer (Another Entity) Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  assert.equal(first.slug, "test-developer");
  assert.equal(second.slug, "test-developer-2");
  assert.notEqual(first.id, second.id);
});

test("developer-service: geography is stored as data, not hardcoded — Mumbai is just a value", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
  });

  assert.equal(developer.city, "Pune");
  const foundByCity = await repos.developers.list({ city: "Pune" });
  assert.equal(foundByCity.length, 1);
});

const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };

test("updateDeveloper: saves edited fields and leaves the slug and id untouched", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const updated = await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: "Test Developer Corrected Private Limited",
      displayName: "Test Developer",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      headquartersLocation: "Bandra Kurla Complex, Mumbai",
    },
    founder,
  );

  assert.equal(updated.id, developer.id);
  assert.equal(updated.slug, developer.slug, "editing does not regenerate the slug");
  assert.equal(updated.legalName, "Test Developer Corrected Private Limited");
  assert.equal(updated.headquartersLocation, "Bandra Kurla Complex, Mumbai");

  const reread = await repos.developers.getById(developer.id);
  assert.equal(reread?.legalName, "Test Developer Corrected Private Limited");
});

test("updateDeveloper: trims whitespace the same way createDeveloper does", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const updated = await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: "  Test Developer Private Limited  ",
      displayName: "  Test Developer  ",
      city: " Mumbai ",
      state: " Maharashtra ",
      country: " India ",
    },
    founder,
  );

  assert.equal(updated.displayName, "Test Developer");
  assert.equal(updated.city, "Mumbai");
});

test("updateDeveloper: rejects a blank required field rather than saving it", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  await assert.rejects(() =>
    updateDeveloper(
      repos,
      developer.id,
      {
        legalName: "Test Developer Private Limited",
        displayName: "   ",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
      },
      founder,
    ),
  );

  const unchanged = await repos.developers.getById(developer.id);
  assert.equal(unchanged?.displayName, "Test Developer");
});

test("updateDeveloper: records exactly one immutable history event per field that actually changed, naming the actor and old/new values", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    headquartersLocation: "Worli",
  });

  await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: "Test Developer Private Limited", // unchanged
      displayName: "Test Developer", // unchanged
      city: "Mumbai", // unchanged
      state: "Maharashtra", // unchanged
      country: "India", // unchanged
      headquartersLocation: "Lower Parel", // changed
    },
    founder,
  );

  const history = await repos.developerEditEvents.listByDeveloper(developer.id);
  assert.equal(history.length, 1, "only the field that actually changed should produce a history event");
  assert.equal(history[0].fieldName, "Headquarters location");
  assert.equal(history[0].previousValue, "Worli");
  assert.equal(history[0].newValue, "Lower Parel");
  assert.equal(history[0].actorType, "FOUNDER");
  assert.equal(history[0].actorId, "test-founder");
});

test("updateDeveloper: multiple simultaneous field changes each produce their own history event", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: "Test Developer Renamed Private Limited",
      displayName: "Test Developer Renamed",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    },
    founder,
  );

  const history = await repos.developerEditEvents.listByDeveloper(developer.id);
  const fields = history.map((h) => h.fieldName).sort();
  assert.deepEqual(fields, ["Display name", "Legal name"]);
});

test("updateDeveloper: saving identical values produces zero history events — history reflects real changes only", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: "Test Developer Private Limited",
      displayName: "Test Developer",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    },
    founder,
  );

  const history = await repos.developerEditEvents.listByDeveloper(developer.id);
  assert.equal(history.length, 0);
});

test("updateDeveloper: history is scoped to its own developer — editing one developer never creates events for another", async () => {
  const repos = createInMemoryRepositories();
  const a = await createDeveloper(repos.developers, {
    legalName: "Test A Private Limited",
    displayName: "Test A",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
  const b = await createDeveloper(repos.developers, {
    legalName: "Test B Private Limited",
    displayName: "Test B",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  await updateDeveloper(
    repos,
    a.id,
    { legalName: "Test A Renamed Private Limited", displayName: "Test A", city: "Mumbai", state: "Maharashtra", country: "India" },
    founder,
  );

  const historyA = await repos.developerEditEvents.listByDeveloper(a.id);
  const historyB = await repos.developerEditEvents.listByDeveloper(b.id);
  assert.equal(historyA.length, 1);
  assert.equal(historyB.length, 0);
});

/**
 * The published/pending-changes/republish/discard workflow — Task
 * "FINALIZE TRUE EDIT → SAVE → REPUBLISH". These tests specifically
 * publish the developer first (submit + approve a candidate), since the
 * whole point of this feature only applies once a developer is
 * currently published; an unpublished developer's edits still write
 * straight through (covered by the tests above, unaffected by this
 * feature).
 */
async function createPublishedDeveloper(
  repos: DeveloperConnectRepositories,
  overrides: { legalName: string; displayName: string; headquartersLocation?: string },
) {
  const developer = await createDeveloper(repos.developers, {
    legalName: overrides.legalName,
    displayName: overrides.displayName,
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    headquartersLocation: overrides.headquartersLocation,
  });
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: `https://www.${developer.slug}.example`,
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await approveAndPublishCandidate(repos, candidate.id, founder, "Reviewed and approved by founder");
  const published = await repos.developers.getById(developer.id);
  return published!;
}

test("updateDeveloper: editing a PUBLISHED developer never touches the published columns — it becomes a pending change instead", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createPublishedDeveloper(repos, {
    legalName: "Test Published Co Private Limited",
    displayName: "Test Published Co",
    headquartersLocation: "Worli",
  });

  const after = await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: developer.legalName,
      displayName: developer.displayName,
      city: developer.city,
      state: developer.state,
      country: developer.country,
      headquartersLocation: "Lower Parel",
    },
    founder,
  );

  // The published column itself is untouched — this IS the public value.
  assert.equal(after.headquartersLocation, "Worli", "the published column must not change on Save");
  assert.deepEqual(after.pendingChanges, { headquartersLocation: "Lower Parel" });
});

test("updateDeveloper: multiple edits before republish merge into one pending patch, relative to PUBLISHED values, and the effective view builds on the latest pending state", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createPublishedDeveloper(repos, {
    legalName: "Test Multi Edit Co Private Limited",
    displayName: "Test Multi Edit Co",
    headquartersLocation: "Worli",
  });

  const afterFirst = await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: developer.legalName,
      displayName: developer.displayName,
      city: developer.city,
      state: developer.state,
      country: developer.country,
      headquartersLocation: "Lower Parel",
    },
    founder,
  );
  assert.deepEqual(afterFirst.pendingChanges, { headquartersLocation: "Lower Parel" });

  // Second edit changes a DIFFERENT field, building on the first pending edit via effectiveDeveloperFields.
  const effectiveBeforeSecond = effectiveDeveloperFields(afterFirst);
  assert.equal(effectiveBeforeSecond.headquartersLocation, "Lower Parel", "the form must pre-populate from the pending value, not the published one");

  const afterSecond = await updateDeveloper(
    repos,
    developer.id,
    {
      legalName: developer.legalName,
      displayName: developer.displayName,
      city: "Thane",
      state: developer.state,
      country: developer.country,
      headquartersLocation: effectiveBeforeSecond.headquartersLocation!,
    },
    founder,
  );

  assert.deepEqual(
    afterSecond.pendingChanges,
    { headquartersLocation: "Lower Parel", city: "Thane" },
    "the earlier pending headquarters change must survive a later, unrelated field edit",
  );
  assert.equal(afterSecond.city, developer.city, "published city must still be untouched");
});

test("updateDeveloper: editing a field back to exactly its published value removes it from the pending patch", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createPublishedDeveloper(repos, {
    legalName: "Test Revert Co Private Limited",
    displayName: "Test Revert Co",
    headquartersLocation: "Worli",
  });

  await updateDeveloper(
    repos,
    developer.id,
    { legalName: developer.legalName, displayName: developer.displayName, city: developer.city, state: developer.state, country: developer.country, headquartersLocation: "Lower Parel" },
    founder,
  );
  const revertedBack = await updateDeveloper(
    repos,
    developer.id,
    { legalName: developer.legalName, displayName: developer.displayName, city: developer.city, state: developer.state, country: developer.country, headquartersLocation: "Worli" },
    founder,
  );

  assert.equal(revertedBack.pendingChanges, null, "editing back to the published value must clear pendingChanges entirely");
});

test("republishDeveloper: atomically applies the pending patch to the published columns, clears pendingChanges, and records a REPUBLISHED history event", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createPublishedDeveloper(repos, {
    legalName: "Test Republish Co Private Limited",
    displayName: "Test Republish Co",
    headquartersLocation: "Worli",
  });

  await updateDeveloper(
    repos,
    developer.id,
    { legalName: developer.legalName, displayName: developer.displayName, city: "Thane", state: developer.state, country: developer.country, headquartersLocation: "Lower Parel" },
    founder,
  );

  const republished = await republishDeveloper(repos, developer.id, founder);

  assert.equal(republished.city, "Thane");
  assert.equal(republished.headquartersLocation, "Lower Parel");
  assert.equal(republished.pendingChanges, null);

  const history = await repos.developerEditEvents.listByDeveloper(developer.id);
  const republishEvents = history.filter((h) => h.eventType === "REPUBLISHED");
  assert.equal(republishEvents.length, 1);
  assert.equal(republishEvents[0].actorType, "FOUNDER");
  assert.equal(republishEvents[0].actorId, "test-founder");
  // The per-field diffs recorded at Save time are still there — nothing is lost.
  assert.equal(history.filter((h) => h.eventType === "FIELD_CHANGE").length, 2);
});

test("republishDeveloper: throws rather than silently succeeding when there is nothing pending to publish", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createPublishedDeveloper(repos, {
    legalName: "Test Nothing Pending Co Private Limited",
    displayName: "Test Nothing Pending Co",
  });

  await assert.rejects(() => republishDeveloper(repos, developer.id, founder));
});

test("discardPendingChanges: throws away the pending patch without ever touching published values, and records a DISCARDED event", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createPublishedDeveloper(repos, {
    legalName: "Test Discard Co Private Limited",
    displayName: "Test Discard Co",
    headquartersLocation: "Worli",
  });

  await updateDeveloper(
    repos,
    developer.id,
    { legalName: developer.legalName, displayName: developer.displayName, city: developer.city, state: developer.state, country: developer.country, headquartersLocation: "Lower Parel" },
    founder,
  );

  const discarded = await discardPendingChanges(repos, developer.id, founder);

  assert.equal(discarded.headquartersLocation, "Worli", "published value must be completely unaffected by discard");
  assert.equal(discarded.pendingChanges, null);

  const history = await repos.developerEditEvents.listByDeveloper(developer.id);
  assert.ok(history.some((h) => h.eventType === "DISCARDED"));
  assert.ok(!history.some((h) => h.eventType === "REPUBLISHED"));
});

test("discardPendingChanges: throws rather than silently succeeding when there is nothing pending to discard", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createPublishedDeveloper(repos, {
    legalName: "Test Nothing To Discard Co Private Limited",
    displayName: "Test Nothing To Discard Co",
  });

  await assert.rejects(() => discardPendingChanges(repos, developer.id, founder));
});

test("updateDeveloper: an UNPUBLISHED developer's edits still write straight through — the pending-changes workflow only applies once published", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Unpublished Co Private Limited",
    displayName: "Test Unpublished Co",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    headquartersLocation: "Worli",
  });
  // No candidate submitted/approved — this developer has never been published.

  const after = await updateDeveloper(
    repos,
    developer.id,
    { legalName: developer.legalName, displayName: developer.displayName, city: developer.city, state: developer.state, country: developer.country, headquartersLocation: "Lower Parel" },
    founder,
  );

  assert.equal(after.headquartersLocation, "Lower Parel", "an unpublished developer's edits take effect immediately");
  assert.equal(after.pendingChanges, null);
});
