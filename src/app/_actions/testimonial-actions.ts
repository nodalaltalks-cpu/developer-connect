"use server";

import { createPostgresTestimonialRepository } from "@/lib/testimonials/postgres-repository";
import { TestimonialValidationError } from "@/lib/testimonials/model";
import { TestimonialNotFoundError, TestimonialStateError, submitByRequestToken } from "@/lib/testimonials/service";

/**
 * The one public testimonial write. The secret in the buyer's private link is the entire credential: no account, no Founder
 * session. It validates what was typed, accepts a link exactly once, and answers with plain text only.
 */

export type SubmitTestimonialResult = { ok: true } | { ok: false; error: string; field?: string };

export async function submitTestimonialAction(token: string, payload: Record<string, unknown>): Promise<SubmitTestimonialResult> {
  if (typeof token !== "string" || !payload || typeof payload !== "object") return { ok: false, error: "This link is not available." };
  try {
    await submitByRequestToken(createPostgresTestimonialRepository(), token, {
      name: payload.name,
      displayMode: payload.displayMode,
      city: payload.city,
      country: payload.country,
      helpedWith: payload.helpedWith,
      experience: payload.experience,
      project: payload.project,
      rating: payload.rating,
      permissionPublish: payload.permissionPublish,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof TestimonialValidationError) return { ok: false, error: error.message, field: error.field };
    if (error instanceof TestimonialNotFoundError || error instanceof TestimonialStateError) return { ok: false, error: "This link is not available. It may already have been used." };
    console.error("testimonial submission failed:", error);
    return { ok: false, error: "Something went wrong. Please try again in a moment." };
  }
}
