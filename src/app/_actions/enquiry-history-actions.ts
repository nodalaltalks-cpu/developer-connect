"use server";

import { auth } from "@clerk/nextjs/server";
import { currentUser, requireUserIdForAction } from "@/lib/auth";
import { createPostgresBuyerEnquiryRepository } from "@/lib/enquiries/db/postgres-repository";
import { createFounderRatingNotifier } from "@/lib/enquiries/founder-notifier";
import {
  advisorContactEntry,
  cleanText,
  EnquiryRatingError,
  isAdvisorChannel,
  rateEnquiry,
  recordEnquiry,
} from "@/lib/enquiries/service";
import type { BuyerEnquiry } from "@/lib/enquiries/types";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";

/**
 * The signed-in buyer's own enquiry history and ratings. Every function takes the user from the session (never from the browser),
 * so one person can never read or rate another person's entries. Recording an advisor contact is fire-and-forget and a no-op for
 * a visitor who is not signed in.
 */

export interface EnquiryView {
  id: string;
  kind: BuyerEnquiry["kind"];
  title: string;
  detail: string | null;
  createdAt: string;
  rating: number | null;
  comment: string | null;
  ratedAt: string | null;
}

function toView(e: BuyerEnquiry): EnquiryView {
  return {
    id: e.id,
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    createdAt: e.createdAt.toISOString(),
    rating: e.rating,
    comment: e.comment,
    ratedAt: e.ratedAt ? e.ratedAt.toISOString() : null,
  };
}

export async function getMyEnquiriesAction(): Promise<EnquiryView[]> {
  const userId = await requireUserIdForAction();
  try {
    return (await createPostgresBuyerEnquiryRepository().listForUser(userId, 200)).map(toView);
  } catch {
    return [];
  }
}

export type RateResult = { ok: true; entry: EnquiryView } | { ok: false; message: string };

export async function rateEnquiryAction(enquiryId: string, rating: number, comment: string): Promise<RateResult> {
  const userId = await requireUserIdForAction();
  try {
    const user = await currentUser();
    const name = user ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.fullName || null : null;
    const entry = await rateEnquiry(
      createPostgresBuyerEnquiryRepository(),
      createFounderRatingNotifier(createPostgresNotificationRepository()),
      { userId, userName: name, enquiryId, rating, comment },
    );
    return { ok: true, entry: toView(entry) };
  } catch (error) {
    if (error instanceof EnquiryRatingError) return { ok: false, message: error.message };
    return { ok: false, message: "We could not save your rating. Please try again." };
  }
}

/**
 * A signed-in visitor chose WhatsApp, call or email in the "Talk to an Advisor" sheet. Recorded in their history so they can see it
 * and rate the service. Never throws and never blocks the contact itself.
 */
export async function recordAdvisorContactAction(channel: string, subject?: string): Promise<void> {
  try {
    const { userId } = await auth();
    if (!userId || !isAdvisorChannel(channel)) return;
    await recordEnquiry(createPostgresBuyerEnquiryRepository(), advisorContactEntry(channel, cleanText(subject, 80), new Date(), userId));
  } catch {
    // history is a convenience; the contact has already happened
  }
}
