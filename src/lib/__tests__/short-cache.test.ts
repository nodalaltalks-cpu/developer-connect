import { test } from "node:test";
import assert from "node:assert/strict";
import { shortCache } from "../short-cache.ts";

test("one read answers every ask inside the window, and a failed read is not kept", async () => {
  let reads = 0;
  const read = async () => ++reads;
  assert.equal(await shortCache("a", 60_000, read), 1);
  assert.equal(await shortCache("a", 60_000, read), 1, "second ask is served from memory");
  assert.equal(await shortCache("b", 60_000, read), 2, "a different key reads again");

  let calls = 0;
  await assert.rejects(() => shortCache("bad", 60_000, async () => { calls++; throw new Error("quota"); }));
  await new Promise((r) => setImmediate(r));
  assert.equal(await shortCache("bad", 60_000, async () => { calls++; return "ok"; }), "ok");
  assert.equal(calls, 2);
});
