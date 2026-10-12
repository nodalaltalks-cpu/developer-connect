"use server";

import { auth } from "@clerk/nextjs/server";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { submitEnquiry } from "@/lib/social/enquiry-service";
import { postgresEnquiryStore } from "@/lib/social/db/postgres-social";
import { getOrCreateSessionId } from "@/lib/session";

/**
 * The public tap-to-select enquiry form. The browser sends only the tapped answers, the optional name, the number and how the
 * visit began; who the visitor is (the session), the time and every id come from the server. The result carries no lead id.
 */

export interface EnquiryPayload {
  answers: unknown;
  name?: string;
  phone: string;
  phoneCountry?: "IN" | "AE";
  /** A hidden field real visitors never fill: a script that does is quietly ignored. */
  website?: string;
  landingPath?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export type EnquiryActionResult = { ok: true } | { ok: false; message: string; field?: string };

export async function submitEnquiryAction(payload: EnquiryPayload): Promise<EnquiryActionResult> {
  if (!payload || typeof payload !== "object") return { ok: false, message: "We could not save your enquiry. Please try again." };
  if (typeof payload.website === "string" && payload.website.trim() !== "") return { ok: true };
  try {
    const sessionId = await getOrCreateSessionId();
    const { userId } = await auth();
    const result = await submitEnquiry(
      { leads: createPostgresLeadRepositories(), store: postgresEnquiryStore },
      { sessionId, userId: userId ?? null },
      {
        answers: payload.answers,
        name: payload.name,
        phone: payload.phone,
        phoneCountry: payload.phoneCountry,
        touch: {
          sessionId,
          landingPath: typeof payload.landingPath === "string" ? payload.landingPath : null,
          referrer: typeof payload.referrer === "string" ? payload.referrer : null,
          utmSource: typeof payload.utmSource === "string" ? payload.utmSource : null,
          utmMedium: typeof payload.utmMedium === "string" ? payload.utmMedium : null,
          utmCampaign: typeof payload.utmCampaign === "string" ? payload.utmCampaign : null,
        },
      },
    );
    return result.ok ? { ok: true } : { ok: false, message: result.message, field: result.field };
  } catch {
    return { ok: false, message: "We could not save your enquiry. Please try again." };
  }
}
