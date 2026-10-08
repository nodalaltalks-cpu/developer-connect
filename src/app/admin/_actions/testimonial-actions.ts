"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { TestimonialValidationError, requestMailtoHref, requestMessage, requestWhatsappHref, type RequestChannel } from "@/lib/testimonials/model";
import { createPostgresTestimonialRepository } from "@/lib/testimonials/postgres-repository";
import * as testimonials from "@/lib/testimonials/service";

/**
 * Founder-only testimonial actions. Each one resolves the Founder FIRST (a Server Action is its own network-callable endpoint),
 * then calls the one workflow service, which writes the audit event. Errors a Founder can act on are returned as text; anything
 * else is a generic failure so nothing internal leaks.
 */

export type TestimonialActionResult = { ok: true } | { ok: false; error: string };
export type CreateRequestResult =
  | { ok: true; id: string; link: string; whatsappHref: string; mailtoHref: string }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE = "https://developerconnects.com";

async function run(id: string, work: (actorId: string) => Promise<unknown>): Promise<TestimonialActionResult> {
  const actorId = await requireFounderForAction();
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "Not found." };
  try {
    await work(actorId);
    revalidatePath("/admin/testimonials");
    return { ok: true };
  } catch (error) {
    if (error instanceof testimonials.TestimonialStateError || error instanceof testimonials.TestimonialNotFoundError) return { ok: false, error: error.message };
    console.error("testimonial action failed:", error);
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}

const founder = (actorId: string) => ({ actorType: "FOUNDER" as const, actorId });

export async function createTestimonialRequestAction(recipientName: string): Promise<CreateRequestResult> {
  const actorId = await requireFounderForAction();
  try {
    const name = typeof recipientName === "string" ? recipientName.slice(0, 120) : "";
    const { testimonial, token } = await testimonials.createRequest(createPostgresTestimonialRepository(), { recipientName: name }, founder(actorId));
    const link = `${SITE}/testimonial/${token}`;
    const message = requestMessage({ name, link });
    revalidatePath("/admin/testimonials");
    return { ok: true, id: testimonial.id, link, whatsappHref: requestWhatsappHref(message), mailtoHref: requestMailtoHref(message) };
  } catch (error) {
    console.error("testimonial request failed:", error);
    return { ok: false, error: "Could not create the request." };
  }
}

export async function markTestimonialSentAction(id: string, channel: RequestChannel): Promise<TestimonialActionResult> {
  return run(id, (actorId) => testimonials.markSent(createPostgresTestimonialRepository(), id, ["WHATSAPP", "EMAIL", "LINK"].includes(channel) ? channel : "LINK", founder(actorId)));
}

export async function moveTestimonialToReviewAction(id: string): Promise<TestimonialActionResult> {
  return run(id, (actorId) => testimonials.moveToReview(createPostgresTestimonialRepository(), id, founder(actorId)));
}

export async function approveTestimonialAction(id: string): Promise<TestimonialActionResult> {
  return run(id, (actorId) => testimonials.approve(createPostgresTestimonialRepository(), id, founder(actorId)));
}

export async function rejectTestimonialAction(id: string, reason: string): Promise<TestimonialActionResult> {
  return run(id, (actorId) => testimonials.reject(createPostgresTestimonialRepository(), id, typeof reason === "string" ? reason : "", founder(actorId)));
}

export async function publishTestimonialAction(id: string): Promise<TestimonialActionResult> {
  const result = await run(id, (actorId) => testimonials.publish(createPostgresTestimonialRepository(), id, founder(actorId)));
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/about");
  }
  return result;
}

export async function archiveTestimonialAction(id: string): Promise<TestimonialActionResult> {
  const result = await run(id, (actorId) => testimonials.archive(createPostgresTestimonialRepository(), id, founder(actorId)));
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/about");
  }
  return result;
}

export async function seedIllustrativeTestimonialsAction(): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const actorId = await requireFounderForAction();
  try {
    const { created } = await testimonials.seedIllustrativeDrafts(createPostgresTestimonialRepository(), founder(actorId));
    revalidatePath("/admin/testimonials");
    return { ok: true, created };
  } catch (error) {
    console.error("seeding illustrative testimonials failed:", error);
    return { ok: false, error: "Could not create the drafts." };
  }
}

export interface FounderEntryPayload {
  originalText: string;
  name: string;
  displayMode: string;
  attributionDetail: string;
  city: string;
  country: string;
  helpedWith: string;
  project: string;
  permissionPublish: boolean;
}

/** Feedback a real client gave another way: stored exactly as pasted, then reviewed like any other. */
export async function recordClientFeedbackAction(payload: FounderEntryPayload): Promise<TestimonialActionResult> {
  const actorId = await requireFounderForAction();
  if (!payload || typeof payload !== "object") return { ok: false, error: "Nothing to save." };
  try {
    await testimonials.recordFounderEntered(createPostgresTestimonialRepository(), {
      originalText: payload.originalText,
      name: payload.name,
      displayMode: payload.displayMode,
      attributionDetail: payload.attributionDetail,
      city: payload.city,
      country: payload.country,
      helpedWith: payload.helpedWith,
      project: payload.project,
      permissionPublish: payload.permissionPublish === true,
    }, founder(actorId));
    revalidatePath("/admin/testimonials");
    return { ok: true };
  } catch (error) {
    if (error instanceof TestimonialValidationError) return { ok: false, error: error.message };
    console.error("recording client feedback failed:", error);
    return { ok: false, error: "Could not save the feedback." };
  }
}

/** Choose what is published: the client's own words, or a paraphrase the Founder confirms is faithful. */
export async function setTestimonialWordingAction(id: string, input: { text: string; paraphrased: boolean; confirmedFaithful: boolean }): Promise<TestimonialActionResult> {
  const actorId = await requireFounderForAction();
  if (typeof id !== "string" || !UUID.test(id) || !input || typeof input !== "object") return { ok: false, error: "Not found." };
  try {
    await testimonials.setPublishedWording(createPostgresTestimonialRepository(), id, { text: input.text, paraphrased: input.paraphrased === true, confirmedFaithful: input.confirmedFaithful === true }, founder(actorId));
    revalidatePath("/admin/testimonials");
    return { ok: true };
  } catch (error) {
    if (error instanceof TestimonialValidationError || error instanceof testimonials.TestimonialStateError || error instanceof testimonials.TestimonialNotFoundError) return { ok: false, error: error.message };
    console.error("setting testimonial wording failed:", error);
    return { ok: false, error: "Could not save the wording." };
  }
}
