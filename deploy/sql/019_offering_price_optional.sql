-- Fixlynk migration 019 — allow a service offering with no price yet.
--
-- WHY
--
-- A new professional or business now picks the services they offer during
-- registration, BEFORE they are logged in and before they have decided what
-- to charge. The price is filled in later on My Services.
--
-- `service_offerings.price_amount` was NOT NULL, so the only ways forward were
-- both wrong:
--   * storing 0 — which would render as a real "call out from R0" to customers,
--     i.e. inventing a price the provider never agreed to. AGENTS.md section 12
--     is explicit that Fixlynk must not invent or process prices.
--   * inventing a plausible default — same problem, less obviously wrong.
--
-- So NULL now means exactly what it should: this provider offers the service
-- and has not stated a starting price yet. Every surface that renders an
-- offering price must treat NULL as "not set" and omit it rather than
-- substituting a figure.
--
-- The existing CHECK is unaffected: `NULL >= 0` evaluates to NULL, which a
-- CHECK constraint does not reject. Only a negative price still fails.
--
-- No backfill: existing rows all carry a real price and are left alone.

-- +migrate Up
ALTER TABLE `service_offerings`
  MODIFY COLUMN `price_amount` DECIMAL(10,2) NULL
    COMMENT 'Indicative starting price in ZAR, informational only, never charged. NULL means the provider has not set one yet (e.g. chosen at registration before login); render it as "not set" rather than substituting a figure.';

-- +migrate Down
ALTER TABLE `service_offerings`
  MODIFY COLUMN `price_amount` DECIMAL(10,2) NOT NULL
    COMMENT 'Indicative starting price in ZAR. Informational only; never charged by the platform.';
