DROP INDEX "subscriptions_eoa_chat_uq";--> statement-breakpoint
DROP INDEX "subscriptions_eoa_ix";--> statement-breakpoint
-- Backfill strategy: any pre-existing rows belong to Ethereum mainnet
-- (the only chain we monitored before this change). Add the column with
-- a default of 1, then immediately strip the default so future inserts
-- must specify chain_id explicitly — application code is the source of
-- truth, not the schema.
ALTER TABLE "pending_confirmations" ADD COLUMN "chain_id" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "pending_confirmations" ALTER COLUMN "chain_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "chain_id" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "chain_id" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_eoa_chain_chat_uq" ON "subscriptions" USING btree ("eoa","chain_id","telegram_chat_id");--> statement-breakpoint
CREATE INDEX "subscriptions_eoa_chain_ix" ON "subscriptions" USING btree ("eoa","chain_id");
