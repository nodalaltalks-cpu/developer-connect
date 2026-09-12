CREATE TABLE "developer_edit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"developer_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_edit_events" ADD CONSTRAINT "developer_edit_events_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_edit_events_developer_idx" ON "developer_edit_events" USING btree ("developer_id");