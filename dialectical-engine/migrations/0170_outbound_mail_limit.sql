-- 0170 · The daily outbound mail limit, kept in the database (owner's rulings of 2026-11-01; replaces closed PR #113).
-- Built as 0153 on dev (#234); renumbered to 0170 on the V4 line (owner, 2026-11-07), where 0153 is the finished dig's mark.
--
-- Plain words. Every account mail asks the API's gate just before it starts the mail program. The gate's count used to live in the API's
-- memory (#113): a restart or an upload reset it, and each side-by-side API copy counted alone. It lives here now, so every copy shares
-- one count and a restart forgets nothing.
--   identity.outbound_mail_daily_count   one row per UTC day: how many mails of each class were handed over, and when each alert was
--                                        taken. Counts and times only: no address, no digest, no user.
--   identity.outbound_mail_suppression   keyed digests of addresses that bounced for good or complained, never a plain address. It stays
--                                        EMPTY until bounce and complaint reports flow back from Amazon: that feed is still owed.
-- The API logins hold no right on either table. They hold EXECUTE on the four functions below and nothing else, through debateai_runtime,
-- which both request logins inherit. No login can SELECT these tables, so they are outside row-level security's rule (SPEC-v4 R1: a relation
-- is in scope when an API login can SELECT it) and hold no account's row; tests/integration/outbound-mail-limit.test.ts proves both.
--
-- Atomic. reserve_outbound_mail's one UPDATE carries the room check in its WHERE. Two copies asking for the last slot queue on the row's lock,
-- and under READ COMMITTED the second re-reads the row and finds no room. Under a stricter isolation level it fails rather than over-counts.
-- Each alert is taken by one UPDATE the same way, so of all the copies exactly one sends it, once a day, across restarts.
-- The day is the database's UTC day, so copies never disagree about it. Rows older than 35 days go when a new day's row is first written.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          two new tables and four new functions; the release before reads none of them.
--   keeps-verifier  no billing relation or function, so lineage/verify-effective-capabilities-130.sql stays in force.

CREATE TABLE IF NOT EXISTS identity.outbound_mail_daily_count (
  day date PRIMARY KEY,
  standard_sent integer NOT NULL DEFAULT 0 CHECK (standard_sent >= 0),
  security_sent integer NOT NULL DEFAULT 0 CHECK (security_sent >= 0),
  alert_share_at timestamptz,
  standard_limit_at timestamptz,
  daily_limit_at timestamptz
);

CREATE TABLE IF NOT EXISTS identity.outbound_mail_suppression (
  recipient_digest bytea PRIMARY KEY CHECK (octet_length(recipient_digest) = 32),
  reason text NOT NULL CHECK (reason IN ('HARD_BOUNCE', 'COMPLAINT')),
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  event_count integer NOT NULL DEFAULT 1 CHECK (event_count >= 1)
);

SELECT core.install_truncate_guard('identity.outbound_mail_daily_count');
SELECT core.install_truncate_guard('identity.outbound_mail_suppression');

-- Counts one hand-off only while the day's total, both classes together, is below p_ceiling.
CREATE OR REPLACE FUNCTION identity.reserve_outbound_mail(p_class text, p_ceiling integer)
RETURNS TABLE (admitted boolean, total_sent integer, count_day date)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_day date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_total integer;
BEGIN
  IF p_class IS NULL OR p_class NOT IN ('standard', 'security') OR p_ceiling IS NULL OR p_ceiling < 1 THEN
    RAISE EXCEPTION 'OUTBOUND_MAIL_RESERVATION_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO identity.outbound_mail_daily_count AS c (day) VALUES (v_day) ON CONFLICT (day) DO NOTHING;
  IF FOUND THEN
    DELETE FROM identity.outbound_mail_daily_count AS c WHERE c.day < v_day - 35;
  END IF;
  UPDATE identity.outbound_mail_daily_count AS c
    SET standard_sent = c.standard_sent + CASE WHEN p_class = 'standard' THEN 1 ELSE 0 END,
        security_sent = c.security_sent + CASE WHEN p_class = 'security' THEN 1 ELSE 0 END
    WHERE c.day = v_day AND c.standard_sent + c.security_sent < p_ceiling
    RETURNING c.standard_sent + c.security_sent INTO v_total;
  IF FOUND THEN
    RETURN QUERY SELECT true, v_total, v_day;
    RETURN;
  END IF;
  SELECT c.standard_sent + c.security_sent INTO v_total FROM identity.outbound_mail_daily_count AS c WHERE c.day = v_day;
  RETURN QUERY SELECT false, v_total, v_day;
END
$$;

-- The day's count, for the question sign-up and resend ask before any account work.
CREATE OR REPLACE FUNCTION identity.outbound_mail_today()
RETURNS TABLE (total_sent integer, count_day date)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_day date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  RETURN QUERY SELECT coalesce((SELECT c.standard_sent + c.security_sent FROM identity.outbound_mail_daily_count AS c WHERE c.day = v_day), 0), v_day;
END
$$;

-- True for exactly one caller per kind per day. The day is the count's own day, so an alert taken across midnight stays on the day it is about.
CREATE OR REPLACE FUNCTION identity.claim_outbound_mail_alert(p_kind text, p_day date)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('ALERT_SHARE', 'STANDARD_LIMIT', 'DAILY_LIMIT') OR p_day IS NULL OR p_day > v_today OR p_day < v_today - 1 THEN
    RAISE EXCEPTION 'OUTBOUND_MAIL_ALERT_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO identity.outbound_mail_daily_count AS c (day) VALUES (p_day) ON CONFLICT (day) DO NOTHING;
  UPDATE identity.outbound_mail_daily_count AS c
    SET alert_share_at = CASE WHEN p_kind = 'ALERT_SHARE' THEN pg_catalog.clock_timestamp() ELSE c.alert_share_at END,
        standard_limit_at = CASE WHEN p_kind = 'STANDARD_LIMIT' THEN pg_catalog.clock_timestamp() ELSE c.standard_limit_at END,
        daily_limit_at = CASE WHEN p_kind = 'DAILY_LIMIT' THEN pg_catalog.clock_timestamp() ELSE c.daily_limit_at END
    WHERE c.day = p_day AND CASE p_kind
      WHEN 'ALERT_SHARE' THEN c.alert_share_at IS NULL
      WHEN 'STANDARD_LIMIT' THEN c.standard_limit_at IS NULL
      ELSE c.daily_limit_at IS NULL END;
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION identity.outbound_mail_recipient_suppressed(p_digest bytea)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_digest IS NULL OR pg_catalog.octet_length(p_digest) <> 32 THEN
    RAISE EXCEPTION 'OUTBOUND_MAIL_DIGEST_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN EXISTS (SELECT 1 FROM identity.outbound_mail_suppression AS s WHERE s.recipient_digest = p_digest);
END
$$;

-- Owned by whoever owns identity's other functions (the house pattern of 0100), so they read these tables as those do.
-- n1: reviewed sets the owner of the objects this step creates; the release before reads none of them.
DO $outbound_mail_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.read_email_settings(uuid,uuid)'::regprocedure;
  EXECUTE format('ALTER TABLE identity.outbound_mail_daily_count OWNER TO %I', v_owner);
  EXECUTE format('ALTER TABLE identity.outbound_mail_suppression OWNER TO %I', v_owner);
  EXECUTE format('ALTER FUNCTION identity.reserve_outbound_mail(text,integer) OWNER TO %I', v_owner);
  EXECUTE format('ALTER FUNCTION identity.outbound_mail_today() OWNER TO %I', v_owner);
  EXECUTE format('ALTER FUNCTION identity.claim_outbound_mail_alert(text,date) OWNER TO %I', v_owner);
  EXECUTE format('ALTER FUNCTION identity.outbound_mail_recipient_suppressed(bytea) OWNER TO %I', v_owner);
END
$outbound_mail_owner$;

REVOKE ALL ON TABLE identity.outbound_mail_daily_count, identity.outbound_mail_suppression FROM PUBLIC, debateai_runtime;
REVOKE ALL ON FUNCTION identity.reserve_outbound_mail(text,integer), identity.outbound_mail_today(),
  identity.claim_outbound_mail_alert(text,date), identity.outbound_mail_recipient_suppressed(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.reserve_outbound_mail(text,integer), identity.outbound_mail_today(),
  identity.claim_outbound_mail_alert(text,date), identity.outbound_mail_recipient_suppressed(bytea) TO debateai_runtime;
