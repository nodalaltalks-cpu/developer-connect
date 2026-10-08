import { test } from "node:test";
import assert from "node:assert/strict";
import { bandProfiles, share } from "../report.ts";

test("retention: a share of nobody is n/a, never 0%", () => {
  assert.equal(share(0, 0), null);
  assert.equal(share(3, 0), null);
  assert.equal(share(1, 3), 33);
  assert.equal(share(2, 3), 67);
});

test("retention: profiles are banded from the real completion calculation", () => {
  const bands = bandProfiles([{ data: {} }, { data: {} }]);
  assert.deepEqual(bands, { total: 2, complete: 0, started: 0, empty: 2 });
  assert.deepEqual(bandProfiles([]), { total: 0, complete: 0, started: 0, empty: 0 });
});
