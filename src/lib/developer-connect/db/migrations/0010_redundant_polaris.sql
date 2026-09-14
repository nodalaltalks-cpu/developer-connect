CREATE TYPE "public"."contact_reason" AS ENUM('GENERAL_QUESTION', 'REPORT_INACCURATE_INFO', 'DEVELOPER_LISTING', 'PARTNERSHIP', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('NEW', 'READ', 'RESPONDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."inaccuracy_report_category" AS ENUM('OFFICIAL_WEBSITE', 'DEVELOPER_NAME', 'HEADQUARTERS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."inaccuracy_report_status" AS ENUM('NEW', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."newsletter_status" AS ENUM('SUBSCRIBED', 'UNSUBSCRIBED');--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"reason" "contact_reason" NOT NULL,
	"message" text NOT NULL,
	"user_id" text,
	"status" "contact_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inaccuracy_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"developer_id" uuid NOT NULL,
	"category" "inaccuracy_report_category" NOT NULL,
	"details" text NOT NULL,
	"reporter_email" text,
	"status" "inaccuracy_report_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" "newsletter_status" DEFAULT 'SUBSCRIBED' NOT NULL,
	"source" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inaccuracy_reports" ADD CONSTRAINT "inaccuracy_reports_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_submissions_status_created_idx" ON "contact_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "inaccuracy_reports_developer_idx" ON "inaccuracy_reports" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "inaccuracy_reports_status_created_idx" ON "inaccuracy_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers" USING btree ("email");