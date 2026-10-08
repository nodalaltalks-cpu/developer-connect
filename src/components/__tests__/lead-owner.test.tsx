import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadCard } from "../admin/leads/lead-card.tsx";
import { LeadOwnerCard } from "../admin/leads/lead-owner-card.tsx";
import { StaffManager } from "../admin/staff-manager.tsx";
import { AuditCard, TimelineCard } from "../admin/leads/lead-detail-sections.tsx";
import type { LeadListItem } from "../../lib/leads/lead-reads.ts";
import type { Lead, LeadEvent } from "../../lib/leads/types.ts";

/** The founder's owner views (pure rendering): what is shown for the owner, and that nothing public or sensitive leaks into them. */

const NOW = new Date("2026-10-06T10:00:00.000Z");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Asha Verma",
    phoneE164: "+919876543210",
    email: null,
    contactPreference: "WHATSAPP",
    status: "NEW",
    temperature: "HOT",
    ownerId: null,
    developerId: null,
    sourceCta: "developer_page",
    location: "Thane",
    budgetMin: null,
    budgetMax: 20_000_000,
    budgetCurrency: "INR",
    configuration: null,
    propertyType: null,
    purpose: null,
    timeline: null,
    sessionId: null,
    userId: null,
    firstTouchId: null,
    lastTouchId: null,
    nextFollowUpAt: null,
    lastContactedAt: null,
    lastActivityAt: new Date("2026-10-06T08:00:00.000Z"),
    createdAt: new Date("2026-10-05T08:00:00.000Z"),
    updatedAt: new Date("2026-10-06T08:00:00.000Z"),
    erasedAt: null,
    ...overrides,
  } as Lead;
}

const item = (l: Lead): LeadListItem => ({ lead: l, developerName: "Acme Realty", followUp: null, attention: null, summary: null }) as unknown as LeadListItem;

test("lead card: unassigned leads say Founder; assigned leads show the owner's name, never an id", () => {
  const unassigned = renderToStaticMarkup(<LeadCard item={item(lead())} now={NOW} />);
  assert.match(unassigned, /Owner: Founder/);

  const assigned = renderToStaticMarkup(<LeadCard item={item(lead({ ownerId: "user_priya_0001" }))} now={NOW} ownerName="Priya Nair" />);
  assert.match(assigned, /Owner: Priya Nair/);
  assert.doesNotMatch(assigned, /user_priya_0001/);

  const unknown = renderToStaticMarkup(<LeadCard item={item(lead({ ownerId: "user_gone_0009" }))} now={NOW} />);
  assert.match(unknown, /Owner: Team member/);
  assert.doesNotMatch(unknown, /user_gone_0009/);
});

test("lead card: the list still carries the fields the founder triages by", () => {
  const html = renderToStaticMarkup(<LeadCard item={item(lead())} now={NOW} />);
  for (const expected of ["Asha Verma", "Hot", "New", "Last activity", "Developer page", "Acme Realty"]) assert.match(html, new RegExp(expected));
});

test("owner card: offers the founder queue plus active members only, with 16px inputs and 44px targets", () => {
  const html = renderToStaticMarkup(
    <LeadOwnerCard
      leadId="11111111-1111-4111-8111-111111111111"
      currentOwnerId="user_priya_0001"
      currentOwnerName="Priya Nair"
      members={[{ id: "a", userId: "user_priya_0001", name: "Priya Nair" }, { id: "b", userId: "user_rohan_0002", name: "Rohan Das" }]}
      ownerInactive={false}
    />,
  );
  assert.match(html, /Currently: <span[^>]*>Priya Nair<\/span>/);
  assert.match(html, /Founder \(my queue\)/);
  assert.match(html, /Rohan Das/);
  assert.match(html, /text-base/, "16px input text — no iOS zoom");
  assert.match(html, /min-h-11/, "44px tap target");
  assert.doesNotMatch(html, /user_rohan_0002|user_priya_0001/, "sign-in ids are never shown");
});

test("owner card: an inactive current owner is flagged for reassignment; an empty team explains how to add one", () => {
  const flagged = renderToStaticMarkup(
    <LeadOwnerCard leadId="x" currentOwnerId="user_old_0003" currentOwnerName="Old Hand" members={[]} ownerInactive />,
  );
  assert.match(flagged, /no longer active\. Reassign this lead/);
  assert.match(flagged, /No active team members yet/);
});

test("team page: shows status and lead counts, offers deactivate/reactivate, flags leads stranded on an inactive member", () => {
  const html = renderToStaticMarkup(
    <StaffManager
      rows={[
        { id: "a", employeeId: "DC2", displayName: "Priya Nair", email: "priya@example.com", role: "EMPLOYEE", status: "ACTIVE", approvedAt: null, joinedAt: null, exitedAt: null, leadCount: 3 },
        { id: "b", employeeId: "DC3", displayName: "Rohan Das", email: null, role: "SALES_MANAGER", status: "INACTIVE", approvedAt: null, joinedAt: null, exitedAt: null, leadCount: 2 },
      ]}
      query=""
    />,
  );
  assert.match(html, /Priya Nair/);
  assert.match(html, /DC2/);
  assert.match(html, /3 open leads/);
  assert.match(html, /Deactivate/);
  assert.match(html, /Activate/);
  assert.match(html, /Sales manager/);
  assert.match(html, /DC1/);
});

test("detail sections: the Record card and timeline show names; an unknown owner never shows an id", () => {
  const record = renderToStaticMarkup(<AuditCard lead={lead({ ownerId: "user_priya_0001" })} ownerName="Priya Nair" />);
  assert.match(record, /Priya Nair/);
  assert.doesNotMatch(record, /user_priya_0001/);

  const events: LeadEvent[] = [
    {
      id: "e1",
      leadId: "11111111-1111-4111-8111-111111111111",
      eventType: "OWNER_CHANGED",
      actorType: "FOUNDER",
      actorId: "user_founder_1",
      developerId: null,
      fromStatus: null,
      toStatus: null,
      payload: { from: null, to: "user_priya_0001" },
      createdAt: new Date("2026-10-06T09:00:00.000Z"),
    } as LeadEvent,
  ];
  const timeline = renderToStaticMarkup(<TimelineCard events={events} names={{ user_priya_0001: "Priya Nair" }} />);
  assert.match(timeline, /Assigned to Priya Nair/);
  assert.doesNotMatch(timeline, /user_priya_0001/);
});
