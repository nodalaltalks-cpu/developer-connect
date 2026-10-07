CREATE TABLE "marketing_spend" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"campaign_id" uuid,
	"spent_on" text NOT NULL,
	"currency" "lead_currency" NOT NULL,
	"amount" bigint NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text,
	CONSTRAINT "marketing_spend_amount_ck" CHECK ("marketing_spend"."amount" > 0),
	CONSTRAINT "marketing_spend_void_ck" CHECK (("marketing_spend"."voided_at" is null) = ("marketing_spend"."voided_by" is null)),
	CONSTRAINT "marketing_spend_channel_ck" CHECK ("marketing_spend"."channel" in ('GOOGLE_ADS', 'META', 'INSTAGRAM', 'WHATSAPP', 'REFERRAL', 'ORGANIC_SEARCH', 'OTHER_DIGITAL', 'DIRECT_OR_UNKNOWN', 'CSV_IMPORT', 'COLD_CALLING', 'SELF_GENERATED_OTHER'))
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "marketing_spend" ADD CONSTRAINT "marketing_spend_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_spend_spent_on_idx" ON "marketing_spend" USING btree ("spent_on");--> statement-breakpoint
CREATE INDEX "marketing_spend_campaign_idx" ON "marketing_spend" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Spend is a financial record: never deleted, never edited. The ONLY change allowed is voiding an entry, once.
CREATE OR REPLACE FUNCTION guard_marketing_spend_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'marketing_spend: DELETE is not permitted (void the entry instead)';
  END IF;
  IF NEW.id <> OLD.id OR NEW.channel <> OLD.channel OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.spent_on <> OLD.spent_on
     OR NEW.currency <> OLD.currency OR NEW.amount <> OLD.amount OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'marketing_spend: an entry cannot be edited (void it and record a new one)';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'marketing_spend: a voided entry cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER marketing_spend_guard
BEFORE UPDATE OR DELETE ON marketing_spend
FOR EACH ROW EXECUTE FUNCTION guard_marketing_spend_mutation();
