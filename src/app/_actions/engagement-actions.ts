"use server";

import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import { submitInaccuracyReport, submitContactMessage, subscribeToNewsletter } from "@/lib/engagement/engagement-service";
import { getCurrentUserId } from "@/lib/auth";
import type { InaccuracyReportCategory, ContactReason } from "@/lib/engagement/types";

/**
 * The public journey's entry points into the engagement domain (Report
 * Inaccurate Information, Contact Us, Newsletter) — same shape as
 * public-actions.ts: every function returns a structured `{ ok, error }`
 * result, never throws across the Server Action boundary, and never
 * exposes DISCOVERED/unpublished developer data (submitInaccuracyReport
 * only needs a developerId the public page already had).
 */

export interface SubmitInaccuracyReportInput {
  developerId: string;
  category: InaccuracyReportCategory;
  details: string;
  reporterEmail?: string;
}

export interface SubmitInaccuracyReportResult {
  ok: boolean;
  error?: string;
}

export async function submitInaccuracyReportAction(
  input: SubmitInaccuracyReportInput,
): Promise<SubmitInaccuracyReportResult> {
  const devRepos = createPostgresRepositories();
  const engagement = createEngagementRepositories();
  try {
    await submitInaccuracyReport(engagement, devRepos.developers, input);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not submit this report." };
  }
}

export interface SubmitContactMessageInput {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
}

export interface SubmitContactMessageResult {
  ok: boolean;
  error?: string;
}

export async function submitContactMessageAction(
  input: SubmitContactMessageInput,
): Promise<SubmitContactMessageResult> {
  const engagement = createEngagementRepositories();
  try {
    const userId = await getCurrentUserId();
    await submitContactMessage(engagement, { ...input, userId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not send your message." };
  }
}

export interface SubscribeNewsletterInput {
  email: string;
  /** Where on the site the signup happened — e.g. "footer" or "homepage". */
  source?: string;
}

export interface SubscribeNewsletterResult {
  ok: boolean;
  alreadySubscribed?: boolean;
  error?: string;
}

export async function subscribeNewsletterAction(
  input: SubscribeNewsletterInput,
): Promise<SubscribeNewsletterResult> {
  const engagement = createEngagementRepositories();
  try {
    const userId = await getCurrentUserId();
    const { alreadySubscribed } = await subscribeToNewsletter(engagement, { ...input, userId });
    return { ok: true, alreadySubscribed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not subscribe right now." };
  }
}
