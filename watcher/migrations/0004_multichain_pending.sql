-- Reshapes pending_confirmations from a single chain_id integer into a
-- chain_ids integer[] so the website's "subscribe to every monitored
-- chain in one click" flow can be expressed as a single pending row.
--
-- Backfill rule: every existing single-chain row turns into a
-- one-element array, so in-flight confirmations don't break across the
-- migration boundary.

ALTER TABLE pending_confirmations
  ADD COLUMN chain_ids integer[] NOT NULL DEFAULT '{}'::integer[];

UPDATE pending_confirmations
  SET chain_ids = ARRAY[chain_id]::integer[];

ALTER TABLE pending_confirmations
  ALTER COLUMN chain_ids DROP DEFAULT;

ALTER TABLE pending_confirmations
  DROP COLUMN chain_id;

ALTER TABLE pending_confirmations
  ADD CONSTRAINT pending_confirmations_chain_ids_nonempty_ck
  CHECK (cardinality(chain_ids) > 0);
