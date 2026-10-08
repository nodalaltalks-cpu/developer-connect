import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttention, type AttentionInput } from "../command-centre.ts";

const base: AttentionInput = { missedFollowUps: 0, returnedLeads: 0, visitsAwaitingOutcome: 0, unassignedOpen: 0, unassignedOld: 0, staleOpen: 0, channels: [], totalLeads: 0, totalQualified: 0, overdueCommission: {} };

test("attention: the four extra Founder items appear only when their counts are real and above zero, each with a destination", () => {
  assert.deepEqual(buildAttention(base), [], "nothing to report means nothing is invented");
  assert.deepEqual(buildAttention({ ...base, newLeads: 0, untouchedHot: 0, visitsToday: 0, pendingApprovals: 0 }), []);
  const items = buildAttention({ ...base, newLeads: 3, untouchedHot: 2, visitsToday: 1, pendingApprovals: 1 });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.UNTOUCHED_HOT.severity, "HIGH");
  assert.match(byKey.UNTOUCHED_HOT.title, /2 hot leads/);
  assert.equal(byKey.UNTOUCHED_HOT.href, "/admin/leads?view=hot");
  assert.match(byKey.NEW_LEADS.title, /3 new leads/);
  assert.match(byKey.VISITS_TODAY.title, /1 site visit today/);
  assert.match(byKey.PENDING_APPROVALS.title, /1 team member waiting/);
  assert.equal(byKey.PENDING_APPROVALS.href, "/admin/staff");
  assert.equal(items[0].key, "UNTOUCHED_HOT", "HIGH severity sorts first");
});
