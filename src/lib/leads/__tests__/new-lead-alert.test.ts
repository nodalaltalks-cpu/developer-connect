import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { alertHeadline, bannerText, NEW_LEAD_VIBRATION, newLeadKey, unseenNewLeads, type NewLeadItem } from "../new-lead-alert.ts";
import { createNewEnquiryNotifier } from "../new-lead-notifier.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const item = (id: string, createdAt: string, extra: Partial<NewLeadItem> = {}): NewLeadItem => ({ id, name: null, developer: null, createdAt, href: `/admin/leads/${id}`, ...extra });

test("new enquiry alerts: only enquiries this device has not shown yet pop up, newest first", () => {
  const items = [item("a", "2026-10-14T01:00:00Z"), item("b", "2026-10-14T02:00:00Z"), item("c", "2026-10-14T03:00:00Z")];
  const seen = new Set([newLeadKey({ id: "a" })]);
  assert.deepEqual(unseenNewLeads(items, seen).map((i) => i.id), ["c", "b"]);
  assert.deepEqual(unseenNewLeads(items, new Set(items.map(newLeadKey))), []);
});

test("new enquiry alerts: the vibration is long and strong, and the words say contact as soon as possible", () => {
  assert.ok(NEW_LEAD_VIBRATION.length >= 7);
  assert.ok(NEW_LEAD_VIBRATION.reduce((a, b) => a + b, 0) >= 5000, "several seconds of buzzing, not a tap");
  assert.match(bannerText(1), /1 new enquiry is waiting.*as soon as possible/);
  assert.match(bannerText(3), /3 new enquiries are waiting/);
  assert.equal(alertHeadline({ name: "Ravi", developer: "DAMAC Properties" }), "Ravi wants to connect with DAMAC Properties");
  assert.equal(alertHeadline({ name: null, developer: null }), "A buyer sent an enquiry");
});

test("new enquiry notification: reaches every founder and the owner, with no name or number in the text", async () => {
  const created: Array<{ userId: string; type: string; title: string; body: string; targetRoute?: string | null }> = [];
  const notifications = { async create(input: (typeof created)[number]) { created.push(input); return {} as never; } };
  const notifier = createNewEnquiryNotifier(notifications as never, async () => ["f1"]);
  await notifier.received({ leadId: "lead-9", ownerId: "emp-1", developerName: "Godrej Properties", created: true });
  assert.deepEqual(created.map((c) => [c.userId, c.targetRoute]), [["f1", "/admin/leads/lead-9"], ["emp-1", "/team/leads/lead-9"]]);
  assert.ok(created.every((c) => c.type === "LEAD_NEW"));
  assert.match(created[0].title, /New enquiry: contact as soon as possible/);
  assert.match(created[0].body, /Godrej Properties/);
  assert.doesNotMatch(created[0].title + created[0].body, /\+\d|@/);

  created.length = 0;
  await notifier.received({ leadId: "lead-9", ownerId: "f1", developerName: null, created: false });
  assert.equal(created.length, 1, "a founder who also owns the lead is told once");
  assert.match(created[0].title, /enquired again/);
});

test("wiring: the pop-up and banner are on every founder and team screen; the endpoint is scoped; the green markers and More exist", () => {
  assert.match(read("src/app/admin/layout.tsx"), /<NewLeadAlerts \/>/);
  assert.match(read("src/app/team/layout.tsx"), /<NewLeadAlerts \/>/);
  const route = read("src/app/api/alerts/new-leads/route.ts");
  assert.match(route, /status: 404/);
  assert.match(route, /ownerId: employee!\.actor\.actorId!/, "a team member only ever sees their own");
  assert.match(route, /sourceType: "DIGITAL"/);
  const component = read("src/components/team/new-lead-alerts.tsx");
  assert.match(component, /role="alert"/);
  assert.match(component, /navigator\.vibrate/);
  assert.match(component, /requireInteraction: true/);
  assert.doesNotMatch(component, /Dismiss/, "the red banner is a task, not a dismissable message");
  assert.match(read("src/lib/leads/gate/gate-service.ts"), /deps\.newLead\.received\(/);
  assert.match(read("src/app/_actions/enquiry-actions.ts"), /createNewEnquiryNotifier/);
  assert.match(read("src/components/admin/leads/lead-badges.tsx"), /NEW: "bg-green-100/);
  assert.match(read("src/components/admin/leads/lead-source-tabs.tsx"), /bg-green-600/);
  assert.match(read("src/components/team/team-nav.tsx"), /<FounderMoreSheet /);
  assert.match(read("src/components/admin/founder-more-sheet.tsx"), /NAV_ITEMS\.map/);
});
