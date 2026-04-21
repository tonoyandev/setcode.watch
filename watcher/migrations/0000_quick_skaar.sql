CREATE TABLE "alerts_sent" (
	"id" serial PRIMARY KEY NOT NULL,
	"eoa" text NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"old_target" text,
	"new_target" text,
	"old_classification" text NOT NULL,
	"new_classification" text NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_sent_eoa_lowerhex_ck" CHECK (eoa ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "alerts_sent_tx_hash_lowerhex_ck" CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "alerts_sent_old_target_lowerhex_ck" CHECK ((old_target IS NULL OR old_target ~ '^0x[0-9a-f]{40}$')),
	CONSTRAINT "alerts_sent_new_target_lowerhex_ck" CHECK ((new_target IS NULL OR new_target ~ '^0x[0-9a-f]{40}$')),
	CONSTRAINT "alerts_sent_old_classification_ck" CHECK (old_classification IN ('unknown', 'verified', 'malicious')),
	CONSTRAINT "alerts_sent_new_classification_ck" CHECK (new_classification IN ('unknown', 'verified', 'malicious'))
);
--> statement-breakpoint
CREATE TABLE "manage_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pending_confirmations" (
	"code" text PRIMARY KEY NOT NULL,
	"eoa" text NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_confirmations_eoa_lowerhex_ck" CHECK (eoa ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"eoa" text NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_username" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "subscriptions_eoa_lowerhex_ck" CHECK (eoa ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_sent_tx_chat_uq" ON "alerts_sent" USING btree ("tx_hash","telegram_chat_id");--> statement-breakpoint
CREATE INDEX "alerts_sent_sent_at_ix" ON "alerts_sent" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "alerts_sent_eoa_ix" ON "alerts_sent" USING btree ("eoa");--> statement-breakpoint
CREATE INDEX "manage_tokens_chat_ix" ON "manage_tokens" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "pending_confirmations_expires_ix" ON "pending_confirmations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "pending_confirmations_eoa_chat_ix" ON "pending_confirmations" USING btree ("eoa","telegram_chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_eoa_chat_uq" ON "subscriptions" USING btree ("eoa","telegram_chat_id");--> statement-breakpoint
CREATE INDEX "subscriptions_eoa_ix" ON "subscriptions" USING btree ("eoa");--> statement-breakpoint
CREATE INDEX "subscriptions_chat_ix" ON "subscriptions" USING btree ("telegram_chat_id");