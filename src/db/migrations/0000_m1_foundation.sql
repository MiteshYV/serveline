CREATE TYPE "public"."actor_type" AS ENUM('customer', 'staff', 'platform', 'system', 'ai');--> statement-breakpoint
CREATE TYPE "public"."address_source" AS ENUM('page', 'voice_rough', 'staff');--> statement-breakpoint
CREATE TYPE "public"."address_status" AS ENUM('na', 'pending', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."consent_channel" AS ENUM('call', 'page', 'staff');--> statement-breakpoint
CREATE TYPE "public"."customer_source" AS ENUM('win_back', 'organic_call', 'table', 'page', 'staff');--> statement-breakpoint
CREATE TYPE "public"."discount_kind" AS ENUM('win_back_card', 'manual');--> statement-breakpoint
CREATE TYPE "public"."fulfilment" AS ENUM('delivery', 'pickup', 'dine_in');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('hi', 'en', 'kn');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('ai_call', 'page_table', 'page_delivery', 'staff_manual');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('received', 'address_pending', 'awaiting_payment', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'needs_attention');--> statement-breakpoint
CREATE TYPE "public"."outlet_status" AS ENUM('active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('upi_link', 'cod', 'pay_at_table');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'awaiting', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('agent', 'admin');--> statement-breakpoint
CREATE TYPE "public"."restaurant_status" AS ENUM('trialing', 'active', 'suspended', 'churned');--> statement-breakpoint
CREATE TYPE "public"."sms_kind" AS ENUM('otp', 'order_confirm', 'payment_link', 'page_link', 'address_link');--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."spice_level" AS ENUM('none', 'mild', 'medium', 'hot');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"notice_version" varchar(32) NOT NULL,
	"purposes" text[] DEFAULT '{}' NOT NULL,
	"channel" "consent_channel" NOT NULL,
	"language" "language" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(16) NOT NULL,
	"phone_hash" varchar(64) NOT NULL,
	"name" text,
	"preferred_language" "language",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"label" text,
	"line1" text NOT NULL,
	"landmark" text,
	"area" text,
	"pincode" varchar(6),
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"source" "address_source" NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_preference" (
	"customer_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"dietary" text[] DEFAULT '{}' NOT NULL,
	"allergies" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	CONSTRAINT "customer_preference_customer_id_restaurant_id_pk" PRIMARY KEY("customer_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "customer_restaurant" (
	"customer_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"source" "customer_source" NOT NULL,
	"first_channel" "order_channel",
	"consent_id" uuid,
	"order_count" integer DEFAULT 0 NOT NULL,
	"last_order_at" timestamp with time zone,
	"ltv_paise" integer DEFAULT 0 NOT NULL,
	"usual_order" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	CONSTRAINT "customer_restaurant_customer_id_restaurant_id_pk" PRIMARY KEY("customer_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "outlet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line" text NOT NULL,
	"area" text NOT NULL,
	"pincode" varchar(6) NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"display_phone" varchar(16),
	"virtual_number" varchar(16),
	"forwarding_verified_at" timestamp with time zone,
	"owner_mobile" varchar(16),
	"handoff_number" varchar(16),
	"hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"holiday_dates" date[] DEFAULT '{}' NOT NULL,
	"delivery_radius_km" numeric(4, 1) DEFAULT '5.0' NOT NULL,
	"serviceable_pincodes" text[] DEFAULT '{}' NOT NULL,
	"languages" "language"[] DEFAULT '{"hi","en","kn"}' NOT NULL,
	"greeting_override" text,
	"cod_enabled" boolean DEFAULT true NOT NULL,
	"status" "outlet_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(16) NOT NULL,
	"phone_hash" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"role" "platform_role" DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	"brand_colour" varchar(7) DEFAULT '#1F6F5C' NOT NULL,
	"plan" text DEFAULT 'standard' NOT NULL,
	"status" "restaurant_status" DEFAULT 'trialing' NOT NULL,
	"trial_started_at" timestamp with time zone,
	"trial_call_limit" integer DEFAULT 150 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"phone" varchar(16) NOT NULL,
	"phone_hash" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" DEFAULT 'staff' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_delta_paise" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_option_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_delta_paise" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_paise" integer NOT NULL,
	"is_veg" boolean DEFAULT false NOT NULL,
	"spice_level" "spice_level" DEFAULT 'none' NOT NULL,
	"allergens" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"customer_id" uuid,
	"channel" "order_channel" NOT NULL,
	"fulfilment" "fulfilment" NOT NULL,
	"table_no" varchar(16),
	"status" "order_status" DEFAULT 'received' NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"discount_code_id" uuid,
	"total_paise" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"address_id" uuid,
	"address_status" "address_status" DEFAULT 'na' NOT NULL,
	"notes" text,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_reason" text,
	"correction_flag" boolean DEFAULT false NOT NULL,
	"corrected_at" timestamp with time zone,
	"corrected_by" uuid
);
--> statement-breakpoint
CREATE TABLE "order_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"name_snapshot" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"link_id" text,
	"payment_id" text,
	"amount_paise" integer NOT NULL,
	"status" "payment_status" NOT NULL,
	"method_detail" text,
	"webhook_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "card_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"pdf_s3_key" text,
	"printed_at" timestamp with time zone,
	"placed_at" timestamp with time zone,
	"placement_audited_at" timestamp with time zone,
	"audited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_redemption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" "order_channel" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"percent" integer NOT NULL,
	"batch_id" uuid,
	"per_customer_limit" integer DEFAULT 1 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_order_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"swiggy_orders" integer DEFAULT 0 NOT NULL,
	"zomato_orders" integer DEFAULT 0 NOT NULL,
	"other_orders" integer DEFAULT 0 NOT NULL,
	"entered_by" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"to_phone_hash" varchar(64) NOT NULL,
	"kind" "sms_kind" NOT NULL,
	"dlt_template_id" varchar(32),
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" "sms_status" DEFAULT 'queued' NOT NULL,
	"cost_paise" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preference" ADD CONSTRAINT "customer_preference_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preference" ADD CONSTRAINT "customer_preference_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restaurant" ADD CONSTRAINT "customer_restaurant_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restaurant" ADD CONSTRAINT "customer_restaurant_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restaurant" ADD CONSTRAINT "customer_restaurant_consent_id_consent_record_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consent_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet" ADD CONSTRAINT "outlet_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_option" ADD CONSTRAINT "item_option_group_id_item_option_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_option_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_option_group" ADD CONSTRAINT "item_option_group_item_id_menu_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variant" ADD CONSTRAINT "item_variant_item_id_menu_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu" ADD CONSTRAINT "menu_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu" ADD CONSTRAINT "menu_published_by_staff_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_category" ADD CONSTRAINT "menu_category_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_category_id_menu_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_discount_code_id_discount_code_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_code"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_address_id_customer_address_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_address"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_corrected_by_staff_user_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_item_id_menu_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_variant_id_item_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_batch" ADD CONSTRAINT "card_batch_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_batch" ADD CONSTRAINT "card_batch_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_batch" ADD CONSTRAINT "card_batch_audited_by_platform_user_id_fk" FOREIGN KEY ("audited_by") REFERENCES "public"."platform_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_redemption" ADD CONSTRAINT "code_redemption_code_id_discount_code_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."discount_code"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_redemption" ADD CONSTRAINT "code_redemption_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_redemption" ADD CONSTRAINT "code_redemption_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code" ADD CONSTRAINT "discount_code_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code" ADD CONSTRAINT "discount_code_batch_id_card_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."card_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_order_count" ADD CONSTRAINT "external_order_count_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_message" ADD CONSTRAINT "sms_message_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_record_customer_restaurant_idx" ON "consent_record" USING btree ("customer_id","restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_phone_uq" ON "customer" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customer_phone_hash_idx" ON "customer" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "customer_address_customer_restaurant_idx" ON "customer_address" USING btree ("customer_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "customer_restaurant_restaurant_idx" ON "customer_restaurant" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "outlet_restaurant_idx" ON "outlet" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_user_phone_uq" ON "platform_user" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_slug_uq" ON "restaurant" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_restaurant_phone_uq" ON "staff_user" USING btree ("restaurant_id","phone");--> statement-breakpoint
CREATE INDEX "staff_user_phone_hash_idx" ON "staff_user" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "item_option_group_idx" ON "item_option" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "item_option_group_item_idx" ON "item_option_group" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_variant_item_idx" ON "item_variant" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_outlet_version_uq" ON "menu" USING btree ("outlet_id","version");--> statement-breakpoint
CREATE INDEX "menu_category_menu_idx" ON "menu_category" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "menu_item_menu_category_idx" ON "menu_item" USING btree ("menu_id","category_id");--> statement-breakpoint
CREATE INDEX "order_outlet_placed_idx" ON "order" USING btree ("outlet_id","placed_at");--> statement-breakpoint
CREATE INDEX "order_customer_placed_idx" ON "order" USING btree ("customer_id","placed_at");--> statement-breakpoint
CREATE INDEX "order_event_order_idx" ON "order_event" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_order_idx" ON "payment" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "card_batch_restaurant_idx" ON "card_batch" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_redemption_code_customer_uq" ON "code_redemption" USING btree ("code_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_code_restaurant_code_uq" ON "discount_code" USING btree ("restaurant_id","code");--> statement-breakpoint
CREATE INDEX "discount_code_batch_idx" ON "discount_code" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_order_count_outlet_week_uq" ON "external_order_count" USING btree ("outlet_id","week_start");--> statement-breakpoint
CREATE INDEX "sms_message_restaurant_idx" ON "sms_message" USING btree ("restaurant_id");