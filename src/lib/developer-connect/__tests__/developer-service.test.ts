import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRepositories } from "../memory-repository.ts";
import { createDeveloper, updateDeveloper } from "../developer-service.ts";

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

test("updateDeveloper: saves edited fields and leaves the slug and id untouched", async () => {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const updated = await updateDeveloper(repos.developers, developer.id, {
    legalName: "Test Developer Corrected Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    headquartersLocation: "Bandra Kurla Complex, Mumbai",
  });

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

  const updated = await updateDeveloper(repos.developers, developer.id, {
    legalName: "  Test Developer Private Limited  ",
    displayName: "  Test Developer  ",
    city: " Mumbai ",
    state: " Maharashtra ",
    country: " India ",
  });

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
    updateDeveloper(repos.developers, developer.id, {
      legalName: "Test Developer Private Limited",
      displayName: "   ",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    }),
  );

  const unchanged = await repos.developers.getById(developer.id);
  assert.equal(unchanged?.displayName, "Test Developer");
});
