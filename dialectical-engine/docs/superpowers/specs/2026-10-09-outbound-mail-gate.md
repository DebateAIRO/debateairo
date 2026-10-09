# Outbound mail gate: the daily counter and the suppression list (storage design)

Date: 2026-10-09. Part of the open sign-up mail plan (design §3(a) option A3, §3(f) PR 3). Owner decisions G1 (plain
Postfix plus an in-app gate), G2 (2 000/day preview, 10 000/day live, 20% reserved for security mail, refuse sign-up
and resend with "try later" at the cap and alert the owner) and G3 (suppress on complaints too).

## What ships in PR 3 (code only, no migration)

- `apps/api/src/outbound-mail-gate.ts`: `OutboundMailGate`, asked by all eight account-mail senders immediately before
  the `MAIL_SENDMAIL_PATH` spawn. Order: address shape (the shared rule), suppression (keyed digest), daily budget.
- The gate's storage sits behind two interfaces: `OutboundMailLedger` (the day's count) and `MailSuppressionList`
  (keyed digests). `InMemoryOutboundMailStore` implements both.
- Register row `outboundMailPolicy` (`daily_cap`, `reserved_for_security_pct`, `alert_at_pct`), code-owned at
  2 000 / 20 / 50, hosted override for live (10 000).

### The interim storage, and why

Until the counter table below has a migration number, the running API uses `InMemoryOutboundMailStore`: an
**in-process daily counter**, documented as **preview-only**.

The other option was "counter unavailable: allow the mail and log a fixed code once a day", which is exactly
today's behaviour and so protects nothing. The in-process counter really enforces the cap on the preview, which
runs one API process. Its limits, accepted for the preview only:

- a restart starts the day's count from zero again, so the worst case is the cap times the number of restarts in a
  day (the SES quota of 50 000 a day and the CloudWatch Send alarm in design §3(b) B-min still stand behind it);
- two API processes would each count separately, so the live site must not open on it;
- the suppression list is empty: until bounce and complaint events flow back into the app (design §3(b) B-full),
  SES's account-level suppression list is what drops mail to hard-bounced and complaining addresses.

## The migration to write later ("numbered at merge")

The database lineage is sealed and moves by forward steps. Two other branches are about to take 0111 (payments) and
0112 (auth batch), so this migration takes the next free number when it merges. It must not be written into
`migrations/` before then. The SQL it needs:

```sql
-- NNNN_outbound_mail_gate.sql (number assigned at merge)
-- Plain CREATE (no IF NOT EXISTS): in a forward-only lineage, drift must fail loudly.
CREATE SCHEMA mail;

-- One row per UTC day and purpose class. No address, no digest, no user: counts only.
CREATE TABLE mail.daily_send_budget (
  day date NOT NULL,
  purpose_class text NOT NULL CHECK (purpose_class IN ('standard','security')),
  sent integer NOT NULL DEFAULT 0 CHECK (sent >= 0),
  PRIMARY KEY (day, purpose_class)
);

-- Keyed digests of addresses that bounced for good or complained (G3). The address itself is never stored.
CREATE TABLE identity.mail_suppression (
  blind_index bytea PRIMARY KEY CHECK (octet_length(blind_index) = 32),
  reason text NOT NULL CHECK (reason IN ('BOUNCE','COMPLAINT')),
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  event_count integer NOT NULL DEFAULT 1 CHECK (event_count >= 1)
);

-- Atomic reservation: counts one hand-off only while the day's total (both classes) is below p_ceiling.
-- The per-day advisory lock serialises the two class rows of one day, so "standard" and "security" can never
-- both take the last unit. The lock key is two integers (a constant and the day number), independent of DateStyle.
-- Lock-then-sum is only exact under READ COMMITTED (a REPEATABLE READ snapshot would sum stale rows), so the
-- function refuses any other isolation level; the API calls it in autocommit.
CREATE OR REPLACE FUNCTION mail.reserve_daily_send(p_day date, p_class text, p_ceiling integer)
RETURNS TABLE (admitted boolean, total integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_total integer;
BEGIN
  IF p_class NOT IN ('standard','security') OR p_ceiling IS NULL OR p_ceiling < 0 OR p_day IS NULL THEN
    RAISE EXCEPTION 'OUTBOUND_MAIL_RESERVATION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'OUTBOUND_MAIL_RESERVATION_ISOLATION' USING ERRCODE = '25001';
  END IF;
  -- 0x6d61696c = 'mail': the lock family; the second key is the day number.
  PERFORM pg_catalog.pg_advisory_xact_lock(1835100524, (p_day - DATE '1970-01-01'));
  SELECT COALESCE(pg_catalog.sum(b.sent), 0)::integer INTO v_total FROM mail.daily_send_budget b WHERE b.day = p_day;
  IF v_total >= p_ceiling THEN
    RETURN QUERY SELECT false, v_total;
    RETURN;
  END IF;
  INSERT INTO mail.daily_send_budget AS b (day, purpose_class, sent) VALUES (p_day, p_class, 1)
  ON CONFLICT (day, purpose_class) DO UPDATE SET sent = b.sent + 1;
  RETURN QUERY SELECT true, v_total + 1;
END $$;

CREATE OR REPLACE FUNCTION mail.daily_send_total(p_day date) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE(pg_catalog.sum(b.sent), 0)::integer FROM mail.daily_send_budget b WHERE b.day = p_day
$$;

CREATE OR REPLACE FUNCTION identity.mail_recipient_suppressed(p_blind_index bytea) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.mail_suppression s WHERE s.blind_index = p_blind_index)
$$;

-- Ownership and grants follow the house pattern (see 0100):
-- - the new schema `mail`, both tables and the three functions are owned by the identity schema's NOLOGIN owner
--   (looked up from pg_proc as 0100 does), never by a login role;
-- - REVOKE ALL on both tables, and REVOKE EXECUTE on the three functions, FROM PUBLIC and every runtime role
--   (functions are executable by PUBLIC by default); truncate guard installed on both tables;
-- - GRANT USAGE ON SCHEMA mail (and identity, if not already held) and EXECUTE on the three functions only, to the
--   role(s) the API's mail senders run as (debateai_runtime and debateai_authorization_runtime, to be confirmed
--   against the senders' pools at merge). No role gets table rights.
-- Retention: a purge step deletes mail.daily_send_budget rows older than 35 days.
```

Then `PostgresOutboundMailStore` implements the same two interfaces over these functions, main.ts swaps it in, and
the integration suite proves: 50 concurrent reservations at a ceiling of 10 admit exactly 10; the day rolls over at
UTC midnight; standard mail stops at 80% while security mail reaches 100%; no table holds an address (scan the
bytes).

## Deploying this release on the preview

The API now refuses to start without the `outboundMailPolicy` row (`OUTBOUND_MAIL_POLICY_UNRESOLVED`). The preview
kit (`deploy/preview-auth-dev/v1/publish-register.ts`) adds the row as one of its "additions", but its composer
expects the preview's ORIGINAL base (65 rows, none of the additions). A preview that has already published once
through the kit therefore needs its next register version composed from its current version (or a v2 kit) before
the API restarts on this code; the operator must not restart first.

The sealed preview-mail kit (`deploy/preview-mail/v4-20261005/test-source-producer.mjs`) builds the senders
without a gate and is hash-pinned; it is retired by the preview cut-over (design §3(f) PR 5) and is left untouched.

## Still open for the owner

- How the owner hears an alert. Today the gate writes one fixed-code line (`[OUTBOUND_MAIL_ALERT] code=…`) to the
  API's log once a day per threshold. Wiring it to mail needs either a new staff-alert event (a migration in the
  staff outbox) or the SES CloudWatch Send alarm of design §3(b) B-min, which already reaches the owner by SNS.
- Whether billing mail (M1-M11, O1-O3) belongs to the "standard" class (today) or the security reserve.
- Password reset and account recovery are public flows in the security class: a flood of them, limited only by
  their own per-source limits, can use the whole cap, reserve included.
- Each MAIL_DAILY_LIMIT answer is a 503, so the API writes one content-free `api.request.failed` line per refused
  request; in a flood that is noisy.
