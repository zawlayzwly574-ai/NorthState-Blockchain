CREATE TABLE "wallet_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"type" text NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(30, 12) NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"status" text NOT NULL,
	"transaction_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "futures_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"asset" text NOT NULL,
	"direction" text NOT NULL,
	"margin" numeric(20, 8) NOT NULL,
	"leverage" integer NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"close_price" numeric(20, 8),
	"realized_pnl" numeric(20, 8),
	"status" text DEFAULT 'active' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "futures_positions_margin_positive" CHECK ("futures_positions"."margin" > 0),
	CONSTRAINT "futures_positions_leverage_range" CHECK ("futures_positions"."leverage" BETWEEN 1 AND 100),
	CONSTRAINT "futures_positions_direction_valid" CHECK ("futures_positions"."direction" IN ('long', 'short')),
	CONSTRAINT "futures_positions_status_valid" CHECK ("futures_positions"."status" IN ('active', 'closed', 'liquidated'))
);
--> statement-breakpoint
CREATE TABLE "wallet_holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(30, 12) NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"allocation" numeric(6, 2) NOT NULL,
	"change_24h" numeric(8, 2) NOT NULL,
	"color" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"country" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"occupation" text DEFAULT '' NOT NULL,
	"ssn" text DEFAULT '' NOT NULL,
	"document_type" text NOT NULL,
	"document_image_base64" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mining_investments" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"asset_name" text NOT NULL,
	"category" text NOT NULL,
	"requested_amount" numeric(20, 8) NOT NULL,
	"approved_amount" numeric(20, 8),
	"units" numeric(30, 12),
	"entry_price" numeric(20, 8) NOT NULL,
	"current_value" numeric(20, 8) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_passkeys" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"device_name" text DEFAULT 'Passkey' NOT NULL,
	"transports" text,
	"counter" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"sender_role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_threads_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"asset" text NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"timeframe_secs" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"result" text,
	"admin_override" text,
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8),
	"payout" numeric(20, 8),
	"payout_rate" numeric(5, 4) DEFAULT '0.85' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"balance" numeric(20, 8) DEFAULT '0' NOT NULL,
	"futures_balance" numeric(20, 8) DEFAULT '0' NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"trade_outcome_mode" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trading_accounts_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "trading_accounts_separate_balances_nonnegative" CHECK ("trading_accounts"."balance" >= 0 AND "trading_accounts"."futures_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"type" text NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(30, 12) NOT NULL,
	"destination" text,
	"tx_hash" text,
	"proof_path" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"referral_code" text NOT NULL,
	"referral_invited_count" integer DEFAULT 0 NOT NULL,
	"referral_reward" numeric(18, 2) DEFAULT '0' NOT NULL,
	"totp_secret" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"sms_phone_number" text,
	"sms_phone_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_profiles_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "wallet_profiles_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE INDEX "futures_positions_user_status_idx" ON "futures_positions" USING btree ("clerk_user_id","status");