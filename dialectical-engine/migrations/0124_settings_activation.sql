-- 0124 · Settings changes without an upload (side-by-side spec §13; plan 2026-10-21-side-by-side-S-settings Task S1).
-- Spec docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md §13, §11; plan decisions D1 and D8.
--
-- The owner activates a sealed debate-settings version with one command, and new questions use it without a restart.
-- This file is the database half: an append-only activation pointer, an append-only verdict log, and the check the
-- release switch makes, all serialized on the release switch's lock (0123's EXCLUSIVE transaction-level advisory lock
-- on hashtextextended('debateai:release-switch', 0)):
--   * register.settings_activation     one row per activation; the latest row is the active version (the pointer).
--                                      Going back is a NEW row, never an edit. No row = each release on its own site
--                                      version (today's behaviour, D1);
--   * register.settings_verdict        one row per dry boot of (release, version): PASS or FAIL and the report digest;
--                                      the latest row for the pair decides;
--   * register.settings_switch_check   one row per release switch, checked at COMMIT by a deferred constraint trigger,
--                                      so a switch and an activation may share one transaction in either order;
--   * register.settings_version_passed(text,bigint)   D1: a release always passes its own site version (the number in
--                                      its key r<v>-...), else its latest verdict for the version must be PASS;
--                                      'legacy' passes nothing;
--   * register.read_passed_settings_versions(text)    the runner's boot preload (never the pointer);
--   * register.read_active_settings_version()         the pointer's ONE reader (the API's admission path, D8);
--   * register.record_settings_verdict(...)           the verdict log's one writer (operator only, no lock);
--   * register.activate_settings_version(...)         the pointer's one writer: compare-and-swap on the current release
--                                      and the pointer, then a sealed GENERAL version the current release has passed;
--   * register.release_switch_settings_hook(...)      called by 0123's switch: the pointer must be what the caller saw;
--   * register.settings_switch_check_at_commit()      at COMMIT, the current release must have passed the pointer;
--   * three SECURITY INVOKER insert guards: only the release owner (inside the definers above) writes the tables.
--
-- n1 (spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          additive only: three new tables and ten new functions; nothing older is altered, dropped, renamed,
--                   revoked or replaced, so the release before keeps running beside it.
--   keeps-verifier  no billing relation or billing function, so the effective-capability verifier in force (0111's,
--                   migrations/lineage/README.md step 3) stays in force and the manifest names it.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: this file replaces no function another migration defines; 0123's
-- core.record_release_switch calls register.release_switch_settings_hook when it exists (0123 §3, the guarded call
-- after its compare-and-swap), so the switch's settings check needs no change to 0123. 0123's objects are not touched
-- (their postcondition digest covers their ACLs and triggers): no grant on, trigger on or alteration of any of them.
-- 0123's note says "0124 grants EXECUTE on its hook": no grant is needed, because the hook and the commit check are
-- owned by debateai_release_owner, the role 0123's definer switch runs as, and an owner may always execute (ruling
-- R5). The functions read the pointer only through register.read_active_settings_version() (ruling R1).
--
-- Additive and replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): CREATE TABLE IF
-- NOT EXISTS with its constraints inline, CREATE OR REPLACE FUNCTION of names no earlier migration defines, every
-- trigger dropped IF EXISTS first. Nothing historical is rewritten.

-- 1. The three tables ------------------------------------------------------------
-- Codes and numbers only. A key is 0123's shape r<site settings version>-<12 hex> and never 'legacy'. activated_by
-- names who activated (an operator label), reason a short operator note without control characters.
CREATE TABLE IF NOT EXISTS register.settings_activation (
  activation_seq bigserial PRIMARY KEY,
  register_version bigint NOT NULL REFERENCES register.register_version (register_version),
  expected_previous bigint NULL REFERENCES register.register_version (register_version),
  release_key text NOT NULL CHECK (release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'),
  activated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  activated_by text NOT NULL CHECK (activated_by ~ '^[A-Za-z0-9][A-Za-z0-9 ._@-]{0,127}$'),
  reason text NOT NULL CHECK (pg_catalog.char_length(reason) BETWEEN 1 AND 512 AND reason !~ '[[:cntrl:]]')
);
CREATE TABLE IF NOT EXISTS register.settings_verdict (
  release_key text NOT NULL CHECK (release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'),
  register_version bigint NOT NULL REFERENCES register.register_version (register_version),
  verdict text NOT NULL CHECK (verdict IN ('PASS', 'FAIL')),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  checked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (release_key, register_version, checked_at)
);
CREATE TABLE IF NOT EXISTS register.settings_switch_check (
  check_seq bigserial PRIMARY KEY,
  release_key text NOT NULL CHECK (release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'),
  expected_active_settings bigint NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- 2. Guards: append-only (0122's form), 0056's truncate guard, and a writer guard (0118's form) --------------------
-- The writer guard is SECURITY INVOKER on purpose: current_user is the inserting role, which is the release owner only
-- inside the definer functions below. Anyone else, the migrator included, is refused (42501).
CREATE OR REPLACE FUNCTION register.settings_activation_insert_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user <> 'debateai_release_owner' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SETTINGS_ACTIVATION_WRITER_INVALID';
  END IF;
  RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION register.settings_verdict_insert_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user <> 'debateai_release_owner' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SETTINGS_ACTIVATION_WRITER_INVALID';
  END IF;
  RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION register.settings_switch_check_insert_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user <> 'debateai_release_owner' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SETTINGS_ACTIVATION_WRITER_INVALID';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON register.settings_activation FROM PUBLIC;
DROP TRIGGER IF EXISTS reject_mutation ON register.settings_activation;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON register.settings_activation FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
SELECT core.install_truncate_guard('register.settings_activation');
DROP TRIGGER IF EXISTS settings_activation_insert_guard ON register.settings_activation;
CREATE TRIGGER settings_activation_insert_guard BEFORE INSERT ON register.settings_activation FOR EACH ROW EXECUTE FUNCTION register.settings_activation_insert_guard();

REVOKE ALL ON register.settings_verdict FROM PUBLIC;
DROP TRIGGER IF EXISTS reject_mutation ON register.settings_verdict;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON register.settings_verdict FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
SELECT core.install_truncate_guard('register.settings_verdict');
DROP TRIGGER IF EXISTS settings_verdict_insert_guard ON register.settings_verdict;
CREATE TRIGGER settings_verdict_insert_guard BEFORE INSERT ON register.settings_verdict FOR EACH ROW EXECUTE FUNCTION register.settings_verdict_insert_guard();

REVOKE ALL ON register.settings_switch_check FROM PUBLIC;
DROP TRIGGER IF EXISTS reject_mutation ON register.settings_switch_check;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON register.settings_switch_check FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
SELECT core.install_truncate_guard('register.settings_switch_check');
DROP TRIGGER IF EXISTS settings_switch_check_insert_guard ON register.settings_switch_check;
CREATE TRIGGER settings_switch_check_insert_guard BEFORE INSERT ON register.settings_switch_check FOR EACH ROW EXECUTE FUNCTION register.settings_switch_check_insert_guard();

-- 3. The readers -------------------------------------------------------------------
-- D1: true when the version is the number in the release's own key (compared as text, so an over-long key cannot
-- overflow a cast; both sides are canonical decimals), or when the release's latest verdict for it is PASS. A NULL
-- input, 'legacy' or any malformed key reads false.
CREATE OR REPLACE FUNCTION register.settings_version_passed(p_release_key text, p_version bigint) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    p_release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'
    AND p_version IS NOT NULL
    AND (
      pg_catalog.substring(p_release_key, '^r([1-9][0-9]*)-') = p_version::text
      OR coalesce((
        SELECT v.verdict = 'PASS' FROM register.settings_verdict AS v
        WHERE v.release_key = p_release_key AND v.register_version = p_version
        ORDER BY v.checked_at DESC LIMIT 1
      ), false)
    ),
    false)
$$;

-- The runner's boot preload: the release's site version, and every version whose latest verdict for the release is
-- PASS, in ascending order. Empty for 'legacy' and any malformed key.
CREATE OR REPLACE FUNCTION register.read_passed_settings_versions(p_release_key text) RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT passed.register_version FROM (
    SELECT pg_catalog.substring(p_release_key, '^r([1-9][0-9]*)-')::bigint AS register_version
    WHERE p_release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'
    UNION
    SELECT latest.register_version FROM (
      SELECT DISTINCT ON (v.register_version) v.register_version, v.verdict
      FROM register.settings_verdict AS v
      WHERE v.release_key = p_release_key
      ORDER BY v.register_version, v.checked_at DESC
    ) AS latest
    WHERE latest.verdict = 'PASS'
  ) AS passed
  ORDER BY passed.register_version
$$;

-- The pointer: the latest activation's version, NULL when nothing was ever activated. The ONE place that reads
-- register.settings_activation's rows (ruling R1); the functions below call it.
CREATE OR REPLACE FUNCTION register.read_active_settings_version() RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT a.register_version FROM register.settings_activation AS a ORDER BY a.activation_seq DESC LIMIT 1
$$;

-- 4. The writers -------------------------------------------------------------------
-- A verdict is a fact about one dry boot, not a decision, so it takes no lock. SETTINGS_VERDICT_INVALID (22023): a
-- malformed or 'legacy' key, a version that is not sealed, a word other than PASS or FAIL, a digest that is not 64
-- lowercase hex.
CREATE OR REPLACE FUNCTION register.record_settings_verdict(p_release_key text, p_version bigint, p_verdict text, p_digest text) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_release_key IS NULL OR p_release_key !~ '^r[1-9][0-9]*-[0-9a-f]{12}$'
    OR p_version IS NULL
    OR NOT EXISTS (SELECT 1 FROM register.register_version AS v WHERE v.register_version = p_version AND v.sealed)
    OR p_verdict IS NULL OR p_verdict NOT IN ('PASS', 'FAIL')
    OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SETTINGS_VERDICT_INVALID';
  END IF;
  INSERT INTO register.settings_verdict(release_key, register_version, verdict, digest)
  VALUES (p_release_key, p_version, p_verdict, p_digest);
END
$$;

-- The activation, under the release switch's lock, every read after it. READ COMMITTED is required (as 0123's switch
-- requires it): each statement after the lock then reads what the lock's previous holder committed, while an older
-- snapshot would read a stale current release or pointer. In order:
--   SETTINGS_ACTIVATION_CONFLICT (40001)  no current release, the current release is not p_expected_current_release,
--                                         or the pointer is not p_expected_previous (NULL = never activated);
--   SETTINGS_VERSION_KIND_INVALID (22023) p_version is not a sealed GENERAL version (a support publication, or none);
--   SETTINGS_ACTIVATION_UNCHANGED (22023) p_version is already the active version;
--   SETTINGS_VERSION_NOT_PASSED (55000)   the current release has not passed p_version (D1, settings_version_passed).
-- Then one new row; going back to an older version is a new row too. Returns its activation_seq (the CLI's receipt).
CREATE OR REPLACE FUNCTION register.activate_settings_version(p_version bigint, p_expected_previous bigint, p_expected_current_release text, p_activated_by text, p_reason text) RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_current text;
  v_pointer bigint;
  v_activation_seq bigint;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', DETAIL = 'READ_COMMITTED_REQUIRED', MESSAGE = 'SETTINGS_ACTIVATION_CONFLICT';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:release-switch', 0));
  SELECT c.release_key INTO v_current FROM core.read_current_release() AS c;
  v_pointer := register.read_active_settings_version();
  IF v_current IS NULL OR v_current IS DISTINCT FROM p_expected_current_release
    OR v_pointer IS DISTINCT FROM p_expected_previous THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SETTINGS_ACTIVATION_CONFLICT';
  END IF;
  IF p_version IS NULL OR NOT EXISTS (
    SELECT 1 FROM register.register_version AS v
    WHERE v.register_version = p_version AND v.sealed
      AND (v.publication_kind IS NULL OR v.publication_kind = 'GENERAL')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SETTINGS_VERSION_KIND_INVALID';
  END IF;
  IF p_version = v_pointer THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SETTINGS_ACTIVATION_UNCHANGED';
  END IF;
  IF NOT register.settings_version_passed(v_current, p_version) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SETTINGS_VERSION_NOT_PASSED';
  END IF;
  INSERT INTO register.settings_activation(register_version, expected_previous, release_key, activated_by, reason)
  VALUES (p_version, v_pointer, v_current, p_activated_by, p_reason)
  RETURNING activation_seq INTO v_activation_seq;
  RETURN v_activation_seq;
END
$$;

-- 5. The release switch's check -------------------------------------------------------
-- Called by 0123's core.record_release_switch, as its owner, after its compare-and-swap and before its CURRENT row.
-- It takes the release switch's lock again (re-entrant: the switch already holds it in this transaction) and refuses
-- SETTINGS_ACTIVATION_CONFLICT (40001) when the pointer is not what the caller saw. It does NOT require that the new
-- release has passed the pointer: it records a check row, and the deferred trigger below makes that check at COMMIT,
-- so a switch to a release that has not passed the current pointer commits only if the same transaction activates a
-- version it has passed (spec §13 "the switch activates it in the same transaction"; §11 rollback).
CREATE OR REPLACE FUNCTION register.release_switch_settings_hook(p_new text, p_expected_active_settings bigint) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:release-switch', 0));
  IF register.read_active_settings_version() IS DISTINCT FROM p_expected_active_settings THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SETTINGS_ACTIVATION_CONFLICT';
  END IF;
  INSERT INTO register.settings_switch_check(release_key, expected_active_settings)
  VALUES (p_new, p_expected_active_settings);
END
$$;

-- At COMMIT of a transaction that switched: the current release must have passed the active version (a NULL pointer
-- passes: each release on its own site version, D1). SETTINGS_VERSION_NOT_PASSED (55000) otherwise, and the whole
-- transaction (the switch's rows and the check row) rolls back.
CREATE OR REPLACE FUNCTION register.settings_switch_check_at_commit() RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_current text;
  v_pointer bigint;
BEGIN
  SELECT c.release_key INTO v_current FROM core.read_current_release() AS c;
  v_pointer := register.read_active_settings_version();
  IF v_pointer IS NOT NULL AND NOT register.settings_version_passed(v_current, v_pointer) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SETTINGS_VERSION_NOT_PASSED';
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS settings_switch_check_at_commit ON register.settings_switch_check;
CREATE CONSTRAINT TRIGGER settings_switch_check_at_commit AFTER INSERT ON register.settings_switch_check DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION register.settings_switch_check_at_commit();

-- 6. Ownership and grants ----------------------------------------------------------------
-- All ten functions belong to 0123's NOLOGIN NOINHERIT debateai_release_owner (ruling R9), which holds SELECT, INSERT on
-- the three tables and SELECT on register.register_version, nothing else of 0124; its USAGE on the schema is 0123's.
-- The hook and the commit check get no grant: 0123's switch runs as their owner. debateai_billing_runtime (the API's
-- role, P3 membershipGrants) alone of the runtimes reads the pointer, so the runner's login cannot (D8); the runtime
-- reads verdicts through the two pass readers. debateai_release_operator runs the operator commands. One grantee per
-- GRANT line, so each P3-disclosed grant stands alone (tests/architecture/p3-production-database-principals.test.ts).
ALTER FUNCTION register.settings_version_passed(text,bigint) OWNER TO debateai_release_owner;
ALTER FUNCTION register.read_passed_settings_versions(text) OWNER TO debateai_release_owner;
ALTER FUNCTION register.read_active_settings_version() OWNER TO debateai_release_owner;
ALTER FUNCTION register.record_settings_verdict(text,bigint,text,text) OWNER TO debateai_release_owner;
ALTER FUNCTION register.activate_settings_version(bigint,bigint,text,text,text) OWNER TO debateai_release_owner;
ALTER FUNCTION register.release_switch_settings_hook(text,bigint) OWNER TO debateai_release_owner;
ALTER FUNCTION register.settings_switch_check_at_commit() OWNER TO debateai_release_owner;
ALTER FUNCTION register.settings_activation_insert_guard() OWNER TO debateai_release_owner;
ALTER FUNCTION register.settings_verdict_insert_guard() OWNER TO debateai_release_owner;
ALTER FUNCTION register.settings_switch_check_insert_guard() OWNER TO debateai_release_owner;

GRANT USAGE ON SCHEMA register TO debateai_release_operator;
GRANT SELECT ON register.register_version TO debateai_release_owner;
GRANT SELECT, INSERT ON register.settings_activation, register.settings_verdict, register.settings_switch_check TO debateai_release_owner;
GRANT USAGE ON SEQUENCE register.settings_activation_activation_seq_seq, register.settings_switch_check_check_seq_seq TO debateai_release_owner;

REVOKE ALL ON FUNCTION register.settings_version_passed(text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.read_passed_settings_versions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.read_active_settings_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION register.record_settings_verdict(text,bigint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.activate_settings_version(bigint,bigint,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.release_switch_settings_hook(text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.settings_switch_check_at_commit() FROM PUBLIC;
REVOKE ALL ON FUNCTION register.settings_activation_insert_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION register.settings_verdict_insert_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION register.settings_switch_check_insert_guard() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION register.read_active_settings_version() TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION register.read_active_settings_version() TO debateai_release_operator;
GRANT EXECUTE ON FUNCTION register.settings_version_passed(text,bigint), register.read_passed_settings_versions(text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION register.settings_version_passed(text,bigint), register.read_passed_settings_versions(text) TO debateai_release_operator;
GRANT EXECUTE ON FUNCTION register.activate_settings_version(bigint,bigint,text,text,text), register.record_settings_verdict(text,bigint,text,text) TO debateai_release_operator;
GRANT SELECT ON register.settings_activation, register.settings_verdict TO debateai_release_operator;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0122's closing shape): each of the three tables carries
-- its append-only, truncate and writer guards, enabled (3 × 3), and the switch check its deferred constraint trigger.
DO $settings_activation_contract$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS class_row ON class_row.oid = trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = class_row.relnamespace
      WHERE ns.nspname = 'register' AND NOT trigger_row.tgisinternal AND trigger_row.tgenabled IN ('O', 'A')
        AND class_row.relname IN ('settings_activation', 'settings_verdict', 'settings_switch_check')
        AND (trigger_row.tgname IN ('reject_mutation', 'reject_truncate')
          OR trigger_row.tgname = class_row.relname || '_insert_guard')) <> 9
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = 'register.settings_switch_check'::regclass
        AND trigger_row.tgname = 'settings_switch_check_at_commit' AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled IN ('O', 'A') AND trigger_row.tgconstraint <> 0
        AND trigger_row.tgdeferrable AND trigger_row.tginitdeferred
        AND trigger_row.tgfoid = 'register.settings_switch_check_at_commit()'::regprocedure) THEN
    RAISE EXCEPTION 'SETTINGS_ACTIVATION_GUARD_CONTRACT_INCOMPLETE';
  END IF;
END
$settings_activation_contract$;
