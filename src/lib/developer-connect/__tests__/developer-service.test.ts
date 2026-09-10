import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRepositories } from "../memory-repository.ts";
import { createDeveloper } from "../developer-service.ts";

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
