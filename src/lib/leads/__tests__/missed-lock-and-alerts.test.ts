import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead } from "../lead-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { getMyWorkState } from "../follow-up-reads.ts";
import { saveColdCallLead } from "../cold-call-lead-service.ts";
import { prepareColdCall } from "../cold-call-service.ts";
import { MissedFollowUpBlockError } from "../errors.ts";
import { MISSED_VIBRATION_PATTERN, VIBRATION_PATTERN, alertKey, alertTitle, newAlerts, patternFor, toAlertItems, trimAlerted, type AlertItem } from "../follow-up-alerts.ts";
import { isLockedHref } from "../missed-lock-rules.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const me = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const actor = (await resolveEmployee(staff, me.userId))!.actor;
  const lead = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 49101", name: "Old lead" }), T0)).lead;
  await assignLead(repos, staff, lead.id, me.id, FOUNDER, minutes(5));
  await scheduleFollowUp(repos, lead.id, { scheduledAt: new Date(T0.getTime() + 2 * 3_600_000), type: "CALL_BACK" }, actor, T0);
  return { repos, actor, lead };
}

test("lock: with a missed follow-up a new cold-call lead cannot be started or dialled, and nothing is created", async () => {
  const w = await world();
  const later = new Date(T0.getTime() + 6 * 3_600_000);
  const work = await getMyWorkState(w.repos, w.actor, later);
  assert.equal(work.missed.length, 1);
  const before = (await w.repos.leads.counts(later, later)).total;
  await assert.rejects(saveColdCallLead(w.repos, { phone: "+91 98111 44001", interest: "NOT_LOOKING", note: "Not now" }, w.actor, later), MissedFollowUpBlockError);
  await assert.rejects(prepareColdCall(w.repos, { phone: "+91 98111 44002" }, w.actor, later), MissedFollowUpBlockError);
  assert.equal((await w.repos.leads.counts(later, later)).total, before, "no lead was created while locked");
});

test("lock: the missed lead itself stays open so the lock can be cleared there", async () => {
  const w = await world();
  const later = new Date(T0.getTime() + 6 * 3_600_000);
  await getMyWorkState(w.repos, w.actor, later);
  // The missed lead is allowed through the guard (it is on it).
  const { assertNotBlocked } = await import("../follow-up-service.ts");
  await assertNotBlocked(w.repos, w.actor.actorId!, w.lead.id, later);
  await assert.rejects(assertNotBlocked(w.repos, w.actor.actorId!, "11111111-1111-4111-8111-111111111111", later), MissedFollowUpBlockError);
});

test("lock: the pop-up rules lock other leads, new work and the dial pad, and keep every way of clearing open", () => {
  const missed = new Set(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  assert.equal(isLockedHref(`/team/leads/${other}`, missed), true);
  assert.equal(isLockedHref(`/team/cold-call/${other}`, missed), true);
  assert.equal(isLockedHref("/team/dial", missed), true);
  assert.equal(isLockedHref("/team/cold-call?phone=%2B91", missed), true);
  assert.equal(isLockedHref("/team/queue/abc", missed), true);
  assert.equal(isLockedHref(`/team/leads/${[...missed][0]}`, missed), false, "the missed lead opens");
  assert.equal(isLockedHref(`/team/leads/${[...missed][0].toUpperCase()}`, missed), false, "case does not matter");
  for (const open of ["/team/missed", "/team/follow-ups", "/team/follow-ups?tab=missed", "/team", "/team/calls", "/admin"]) assert.equal(isLockedHref(open, missed), false, open);
  assert.equal(isLockedHref("not a url at all", missed), false);
});

test("lock is wired: the layout computes what is missed for every team page and renders the lock and the alerts", () => {
  const layout = read("src/app/team/layout.tsx");
  assert.match(layout, /getMyWorkState\(/);
  assert.match(layout, /<MissedLock missed=\{missed\} \/>/);
  assert.match(layout, /<FollowUpAlerts \/>/);
  const lock = read("src/components/team/missed-lock.tsx");
  assert.match(lock, /Clear your missed follow-ups first/);
  assert.match(lock, /data-call-active/, "recording a started call is never blocked");
  assert.match(read("src/components/team/team-call-button.tsx"), /data-lock-lead=\{leadId\}/);
  assert.match(read("src/components/team/cold-call-pad.tsx"), /data-lock-lead=\{prepared \? undefined : "new"\}/);
});

const item = (id: string, kind: "DUE" | "MISSED", at: string): AlertItem => ({ followUpId: id, leadId: `lead-${id}`, name: `Name ${id}`, scheduledAt: at, kind });

test("alerts: each follow-up alerts once, missed ones first, and a rescheduled one alerts again at its new time", () => {
  const a = item("a", "DUE", "2026-10-09T10:00:00.000Z");
  const b = item("b", "MISSED", "2026-10-09T09:00:00.000Z");
  const c = item("c", "DUE", "2026-10-09T09:30:00.000Z");
  assert.deepEqual(newAlerts([a, b, c], new Set()).map((x) => x.followUpId), ["b", "c", "a"]);
  assert.deepEqual(newAlerts([a, b, c], new Set([alertKey(b)])).map((x) => x.followUpId), ["c", "a"]);
  assert.deepEqual(newAlerts([a], new Set([alertKey(a)])), [], "no repeat buzz for the same thing");
  const moved = { ...a, scheduledAt: "2026-10-09T12:00:00.000Z" };
  assert.equal(newAlerts([moved], new Set([alertKey(a)])).length, 1, "a new time is a new alert");
  assert.notEqual(alertKey({ ...a, kind: "DUE" }), alertKey({ ...a, kind: "MISSED" }), "due and missed alert separately");
});

test("alerts: the vibration is strong but bounded, and missed is stronger than due", () => {
  const total = (p: readonly number[]) => p.reduce((n, x) => n + x, 0);
  assert.ok(total(VIBRATION_PATTERN) >= 2500 && total(VIBRATION_PATTERN) <= 6000);
  assert.ok(total(MISSED_VIBRATION_PATTERN) > total(VIBRATION_PATTERN) && total(MISSED_VIBRATION_PATTERN) <= 8000);
  assert.deepEqual(patternFor("MISSED"), MISSED_VIBRATION_PATTERN);
  assert.match(alertTitle(item("a", "DUE", "x")), /^Follow-up due now: /);
  assert.match(alertTitle(item("a", "MISSED", "x")), /^Missed follow-up: /);
  assert.equal(alertTitle({ ...item("a", "DUE", "x"), name: null }), "Follow-up due now: a lead");
  assert.equal(trimAlerted(Array.from({ length: 500 }, (_, i) => String(i)), 200).length, 200);
  assert.equal(trimAlerted(["x"], 200)[0], "x");
});

test("alerts: only follow-ups whose time has arrived are due, and the payload carries no contact details", () => {
  const now = new Date("2026-10-09T10:00:00.000Z");
  const row = (id: string, at: string) => ({ followUp: { id, leadId: `l-${id}`, scheduledAt: new Date(at) }, lead: { name: id } });
  const items = toAlertItems([row("m", "2026-10-09T08:00:00.000Z")], [row("due", "2026-10-09T09:59:00.000Z"), row("soon", "2026-10-09T10:10:00.000Z")], now);
  assert.deepEqual(items.map((i) => [i.followUpId, i.kind]), [["m", "MISSED"], ["due", "DUE"]], "a follow-up that is merely coming up does not interrupt");
  assert.deepEqual(Object.keys(items[0]).sort(), ["followUpId", "kind", "leadId", "name", "scheduledAt"]);
});

test("alerts: the endpoint is the signed-in team member's own, never cached, and 404 for anyone else", () => {
  const route = read("src/app/api/team/alerts/route.ts");
  assert.match(route, /force-dynamic/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(route, /const employee = await getEmployee\(\);\s*if \(!employee\) return new Response\(null, \{ status: 404/);
  assert.ok(!/searchParams|request\.url|new URL/.test(route), "the scope is the session, not the query");
  assert.match(route, /toAlertItems\(work\.missed, work\.dueNow, now\)/);
  const client = read("src/components/team/follow-up-alerts.tsx");
  assert.match(client, /navigator\.vibrate/);
  assert.match(client, /role="alertdialog"/);
  assert.match(client, /requireInteraction: true/);
  assert.match(client, /Notification\.requestPermission\(\)/, "notifications are asked for only when the person taps the button");
  assert.match(read("public/sw.js"), /notificationclick/);
  assert.ok(!/fetch\(/.test(read("public/sw.js")), "the service worker makes no network requests");
});
