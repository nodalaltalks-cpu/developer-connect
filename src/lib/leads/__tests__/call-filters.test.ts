import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesCallFilter, parseCallOutcomeFilter } from "../call-analytics.ts";
import type { CallWithLead } from "../repository.ts";

const make = (call: Partial<CallWithLead["call"]>, sourceType: "COLD_CALL" | "DIGITAL" = "COLD_CALL"): CallWithLead =>
  ({ call: { status: "COMPLETED", classification: "DIALED", disposition: null, ...call }, lead: { id: "l", name: "x", sourceType, creationMethod: null, erasedAt: null } }) as unknown as CallWithLead;

test("call filters: each outcome means exactly what its label says", () => {
  const connected = make({ classification: "CONNECTED" });
  const shortCall = make({ classification: "DIALED" });
  const noAnswer = make({ status: "NO_ANSWER", classification: "DIALED" });
  const callback = make({ classification: "CONNECTED", disposition: "CALLBACK_REQUESTED" });
  const results = (f: Parameters<typeof matchesCallFilter>[1]) => [connected, shortCall, noAnswer, callback].map((c) => matchesCallFilter(c, f));
  assert.deepEqual(results("all"), [true, true, true, true]);
  assert.deepEqual(results("connected"), [true, false, false, true]);
  assert.deepEqual(results("dialed"), [false, true, true, false]);
  assert.deepEqual(results("not_connected"), [false, false, true, false]);
  assert.deepEqual(results("callback"), [false, false, false, true]);
});

test("call filters: the source narrows further, and a bad outcome value falls back to all", () => {
  assert.equal(matchesCallFilter(make({}, "DIGITAL"), "all", "COLD_CALL"), false);
  assert.equal(matchesCallFilter(make({}, "DIGITAL"), "all", "DIGITAL"), true);
  assert.equal(parseCallOutcomeFilter("<script>"), "all");
  assert.equal(parseCallOutcomeFilter(["connected", "x"]), "connected");
  assert.equal(parseCallOutcomeFilter(undefined), "all");
});
