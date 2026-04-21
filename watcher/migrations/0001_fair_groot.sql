DROP INDEX "pending_confirmations_eoa_chat_ix";--> statement-breakpoint
CREATE INDEX "pending_confirmations_eoa_ix" ON "pending_confirmations" USING btree ("eoa");--> statement-breakpoint
ALTER TABLE "pending_confirmations" DROP COLUMN "telegram_chat_id";