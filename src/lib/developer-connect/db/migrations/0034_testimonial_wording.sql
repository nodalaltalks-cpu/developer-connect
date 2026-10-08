-- Testimonial wording: the client's original words stay in `experience`; `published_text` is the Founder-approved wording (verbatim or a confirmed paraphrase). Additive columns plus checks.
ALTER TABLE "testimonials" DROP CONSTRAINT "testimonials_text_len_ck";--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "published_text" text;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "is_paraphrased" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "attribution_detail" text;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "entered_via" text DEFAULT 'FORM' NOT NULL;--> statement-breakpoint
-- Any row already approved or published keeps showing exactly the words it showed before (published wording = the original, unparaphrased).
UPDATE "testimonials" SET "published_text" = "experience" WHERE "published_text" IS NULL AND "status" IN ('APPROVED', 'PUBLISHED');--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_entered_via_ck" CHECK ("testimonials"."entered_via" in ('FORM', 'FOUNDER_ENTERED'));--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_published_text_ck" CHECK ("testimonials"."status" not in ('APPROVED', 'PUBLISHED') or "testimonials"."published_text" is not null);--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_text_len_ck" CHECK (char_length(coalesce("testimonials"."experience", '')) <= 2000 and char_length(coalesce("testimonials"."helped_with", '')) <= 500 and char_length(coalesce("testimonials"."author_name", '')) <= 120 and char_length(coalesce("testimonials"."published_text", '')) <= 2000 and char_length(coalesce("testimonials"."attribution_detail", '')) <= 160);