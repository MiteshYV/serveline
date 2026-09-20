CREATE TYPE "public"."answered_by" AS ENUM('ai', 'fallback_human', 'none');--> statement-breakpoint
CREATE TYPE "public"."call_intent" AS ENUM('order', 'enquiry', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."call_outcome" AS ENUM('completed', 'handoff', 'abandoned', 'deflected_sms', 'failed', 'cap_transfer');--> statement-breakpoint
CREATE TYPE "public"."call_speaker" AS ENUM('customer', 'ai');--> statement-breakpoint
CREATE TYPE "public"."call_tag" AS ENUM('misheard_item', 'address', 'intent', 'vendor', 'complaint', 'other');--> statement-breakpoint
CREATE TYPE "public"."call_transport" AS ENUM('browser', 'exotel');--> statement-breakpoint
CREATE TABLE "call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"transport" "call_transport" NOT NULL,
	"provider_call_sid" varchar(64),
	"from_phone_hash" varchar(64),
	"customer_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_by" "answered_by" DEFAULT 'ai' NOT NULL,
	"language_detected" "language",
	"intent" "call_intent" DEFAULT 'unknown' NOT NULL,
	"outcome" "call_outcome",
	"handoff_reason" text,
	"order_id" uuid,
	"duration_sec" integer,
	"counts_toward_allowance" boolean DEFAULT false NOT NULL,
	"tag" "call_tag",
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "call_cost" (
	"call_id" uuid NOT NULL,
	"telephony_paise" integer DEFAULT 0 NOT NULL,
	"stt_paise" integer DEFAULT 0 NOT NULL,
	"llm_paise" integer DEFAULT 0 NOT NULL,
	"tts_paise" integer DEFAULT 0 NOT NULL,
	"sms_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"stt_seconds" integer DEFAULT 0 NOT NULL,
	"tts_chars" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "call_cost_call_id_pk" PRIMARY KEY("call_id")
);
--> statement-breakpoint
CREATE TABLE "call_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"speaker" "call_speaker" NOT NULL,
	"text" text NOT NULL,
	"language" "language",
	"asr_confidence" real,
	"started_ms" integer,
	"ended_ms" integer,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "call_id" uuid;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_cost" ADD CONSTRAINT "call_cost_call_id_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_turn" ADD CONSTRAINT "call_turn_call_id_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_outlet_started_idx" ON "call" USING btree ("outlet_id","started_at");--> statement-breakpoint
CREATE INDEX "call_customer_idx" ON "call" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "call_turn_call_seq_idx" ON "call_turn" USING btree ("call_id","seq");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_call_id_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."call"("id") ON DELETE set null ON UPDATE no action;