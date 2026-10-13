ALTER TYPE "public"."notification_type" ADD VALUE 'SERVICE_RATING';--> statement-breakpoint
CREATE TABLE "buyer_enquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lead_id" uuid,
	"kind" text NOT NULL,
	"developer_id" uuid,
	"title" text NOT NULL,
	"detail" text,
	"rater_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rating" smallint,
	"comment" text,
	"rated_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	CONSTRAINT "buyer_enquiries_rating_range_ck" CHECK ("buyer_enquiries"."rating" is null or ("buyer_enquiries"."rating" between 1 and 5))
);
--> statement-breakpoint
ALTER TABLE "buyer_enquiries" ADD CONSTRAINT "buyer_enquiries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyer_enquiries_user_created_idx" ON "buyer_enquiries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "buyer_enquiries_rated_idx" ON "buyer_enquiries" USING btree ("rated_at") WHERE "buyer_enquiries"."rated_at" is not null;