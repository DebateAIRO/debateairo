-- 0092 — paid plans, Part 4 P4-M (P2-M43, Part 2's final review M4; the owner's ruling of 3 October 2026, "Fix all
-- five now"). 0091 is Part 2b's erasure commit; this is the next free prefix.
-- Several recurring billing queries read a whole append-only table that grows for ten years (A15's retention). Each
-- index below serves one of them, named in the comment above it; a partial index carries the query's own filter, so
-- the query's WHERE implies its predicate (tests/integration/billing-migrations.test.ts plans each query as the
-- repository sends it and finds its index). Measured at P4-M's head on a copy with 200,000 subscription events,
-- 180,000 entitlement events, 100,000 charges and notices, 300,000 charge events and 200,000 outbox jobs: every scan
-- named here became an index scan.
-- Indexes only: no table, column, function or grant changes. The runner applies a file inside its one migration
-- transaction (packages/db/src/index.ts, migrate), so these are plain CREATE INDEX (CONCURRENTLY cannot run in a
-- transaction); each holds its table's SHARE lock (reads go on, writes wait) for the moment the build takes, which is
-- short at launch volumes. IF NOT EXISTS, as 0065's ledger hygiene requires, so a replay is harmless.

-- checkoutPaymentSignals (packages/db/src/billing-jobs.ts): the notices of one charge, by our externalOrderId in
-- the charge's xMoney system. A notice may carry no externalOrderId; the query's equality never matches those.
CREATE INDEX IF NOT EXISTS xmoney_notice_external_order_idx
  ON billing.xmoney_notice (external_order_id, xmoney_environment) WHERE external_order_id IS NOT NULL;

-- checkoutPaymentSignals: an open job's notice, joined as written, `origin.notice_id::text = payload->>'notice_id'`
-- (the payload's notice_id may be null, so the query compares text and never casts the payload).
CREATE INDEX IF NOT EXISTS xmoney_notice_id_text_idx
  ON billing.xmoney_notice ((notice_id::text));

-- checkoutPaymentSignals: the open VERIFY_PAYMENT jobs that name the charge, by either payload field it reads
-- (`payload->>'external_order_id' = $1 OR payload->>'charge_id' = $1`: one index per field, read as a bitmap OR).
CREATE INDEX IF NOT EXISTS outbox_live_verify_external_order_idx
  ON billing.outbox ((payload ->> 'external_order_id'))
  WHERE kind = 'VERIFY_PAYMENT' AND done_at IS NULL AND dead_at IS NULL;
CREATE INDEX IF NOT EXISTS outbox_live_verify_charge_idx
  ON billing.outbox ((payload ->> 'charge_id'))
  WHERE kind = 'VERIFY_PAYMENT' AND done_at IS NULL AND dead_at IS NULL;

-- withdrawalsAwaitingOwner (packages/db/src/billing.ts): the withdrawals handed to the owner (WITHDRAWN with
-- `data.refund_by_owner`), in the list's order. One owner's list also has 0085's (owner_ref, seq).
CREATE INDEX IF NOT EXISTS subscription_event_withdrawn_by_owner_idx
  ON billing.subscription_event (at, subscription_id)
  WHERE kind = 'WITHDRAWN' AND (data ->> 'refund_by_owner') = 'true';

-- deadRefunds and invoiceUnknownItems (packages/db/src/billing.ts): the dead jobs of a kind, in deadRefunds' order
-- (dead_at, ref). deadEmails and unrecordedRefunds read dead jobs by kind too, and use it.
CREATE INDEX IF NOT EXISTS outbox_dead_idx
  ON billing.outbox (kind, dead_at, ref) WHERE dead_at IS NOT NULL;

-- invoiceUnknownItems: "the latest job of its kind and ref" (a newer job, open, done or dead, replaces a dead one).
-- Not partial: the lookup's kind is the outer job's, so no predicate on kind could be proved (deadEmails' same
-- lookup uses it too).
CREATE INDEX IF NOT EXISTS outbox_kind_ref_created_idx
  ON billing.outbox (kind, ref, created_at);

-- invoiceUnknownItems: the dashboard refunds P9c recorded on the payment itself (PROVIDER_REFUND, no
-- refunds_transaction_id), whose amount is unknown; 0086's (kind, at) would read every refund ever recorded.
CREATE INDEX IF NOT EXISTS charge_event_dashboard_refund_idx
  ON billing.charge_event (charge_id)
  WHERE kind = 'REFUNDED' AND error_code = 'PROVIDER_REFUND' AND refunds_transaction_id IS NULL;

-- blockedRenewals (packages/db/src/billing.ts): the RENEWAL_PENDING holds whose paid_through has passed. A hold is
-- written only while a renewal waits (an outage, a refused tax request, an unverified rebill, an unsettled
-- upgrade), so this stays small. P4-M changed the query to start from these rows and keep one only when no event of
-- its owner in force comes after it (0084's entitlement_event_owner_latest_idx answers that per owner), because
-- its DISTINCT ON over every owner's latest event read the whole table whatever the index; the result is the same.
CREATE INDEX IF NOT EXISTS entitlement_event_renewal_pending_idx
  ON billing.entitlement_event (paid_through)
  WHERE cause = 'RENEWAL_PENDING' AND subscription_id IS NOT NULL;

-- recordsDatedAhead (packages/db/src/billing.ts; W14, P2-I19): what is dated more than a day ahead of a live
-- boot's clock. Not partial: the bound moves with the clock. charge_event needs none of its own (PostgreSQL 18's
-- skip scan reads 0086's charge_event_kind_at_idx by `at` alone), and the open jobs use 0087's outbox_due_idx.
CREATE INDEX IF NOT EXISTS subscription_event_at_idx
  ON billing.subscription_event (at);
CREATE INDEX IF NOT EXISTS entitlement_event_effective_at_idx
  ON billing.entitlement_event (effective_at);
CREATE INDEX IF NOT EXISTS charge_created_at_idx
  ON billing.charge (created_at);
