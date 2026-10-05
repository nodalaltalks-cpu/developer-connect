import type { CaptureAssistanceLeadInput } from "../lead-service.ts";
import type { LeadActor } from "../types.ts";

export const FOUNDER: LeadActor = { actorType: "FOUNDER", actorId: "user_founder_1" };
export const BUYER: LeadActor = { actorType: "BUYER" };
export const SYSTEM: LeadActor = { actorType: "SYSTEM" };

export const DEVELOPER_A = { id: "11111111-1111-4111-8111-111111111111", slug: "acme-realty", displayName: "Acme Realty" };
export const DEVELOPER_B = { id: "22222222-2222-4222-8222-222222222222", slug: "beta-homes", displayName: "Beta Homes" };

export const T0 = new Date("2026-10-05T10:00:00.000Z");
export const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
export const hoursFrom = (base: Date, n: number) => new Date(base.getTime() + n * 3_600_000);

/** A syntactically valid capture input; override any part. */
export function captureInput(overrides: Partial<CaptureAssistanceLeadInput> = {}): CaptureAssistanceLeadInput {
  return {
    phone: "+91 98765 43210",
    name: "Asha Verma",
    email: "asha.verma@example.com",
    contactPreference: "WHATSAPP",
    developer: DEVELOPER_A,
    website: { url: "https://acme.example/", domain: "acme.example", verifiedAt: new Date("2026-09-01T00:00:00.000Z") },
    sourceCta: "developer_page",
    sessionId: "session-1",
    currentTouch: { sessionId: "session-1", landingPath: "/developers/acme-realty", utmSource: "google", utmMedium: "cpc", utmCampaign: "brand" },
    ...overrides,
  };
}
