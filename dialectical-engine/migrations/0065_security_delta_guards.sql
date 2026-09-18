-- 0065 — security hardening 2026-09-01, package DB1
-- (findings DL5-F2, DL5-F5, DL5-F4 of docs/missions/2026-09-01-security-hardening/
-- findings/delta-L5-data-layer.md; DL2-F2 / DL5-F1 land in §4 of this file).
--
-- Forward-only. No landed migration is edited: migrate() keys its ledger on the
-- file name, so an edited applied file is inert, and a standalone replay of an
-- edited file silently restores the OWNER's definition (the lesson 0063:20-39
-- records). This file therefore OWNS every object it creates and never
-- CREATE OR REPLACEs a function another migration defines. Every statement is
-- idempotent and the whole file is replayable.
--
-- §1 TRUNCATE and mutation guards for the 20 relations the 0050-0064 delta
--    added (DL5-F2). 0056 installed core.reject_truncate() on the 78 relations
--    L5 listed and stopped at 0049; the observation set (0057:187-207) is the
--    only delta set that guarded itself. TRUNCATE fires no row trigger and no
--    privilege stops the owner/superuser session, so until this file a single
--    `TRUNCATE support.shred_audit` erased the only record that a shred ever
--    happened — and, because TRUNCATE does not fire the support_shred_dirty_*
--    marks (0054:740-742), it did so without tripping the integrity guard.
--
--    Three treatments, chosen per relation from the grants 0050-0057 actually
--    made (the column-level UPDATE contract at 0054:822-853, 887-969):
--
--    a) APPEND-ONLY (SELECT+INSERT for debateai_support, no column UPDATE
--       grant, no code path that updates or deletes a row): TRUNCATE guard plus
--       `reject_mutation BEFORE UPDATE OR DELETE ... FOR EACH STATEMENT`. The
--       statement-level shape is 0057:187-207's — the delta-era convention and
--       the strictest of the two in the tree, because it also refuses a
--       zero-row UPDATE.
--    b) APPEND-ONLY BUT OWNER-REWRITABLE BY TEST CONTRACT — support.message and
--       support.case_message: TRUNCATE guard only. Both carry the content-v2
--       envelope triggers (0054:176-221) whose refusal of a v1 rewrite is
--       proved by an owner-session UPDATE (tests/integration/support-cases.test.ts:178,
--       tests/integration/support-routes.test.ts:2005), and a statement-level
--       reject_mutation would pre-empt SUPPORT_CONTENT_V2_REQUIRED with 55000.
--       The privilege floor is unchanged either way: debateai_support holds no
--       UPDATE and no DELETE on either table, so the residual is the owner
--       session — the same actor class the TRUNCATE guard now closes. Left to
--       the follow-up package with the content-v2 probes restructured.
--    c) NEVER DELETED BUT COLUMN-MUTABLE — support.session, support."case",
--       support.session_key, support.case_key, support.public_incident and the
--       singleton support._shred_integrity_guard: TRUNCATE guard plus
--       `reject_delete BEFORE DELETE ... FOR EACH STATEMENT`. A blanket
--       reject_mutation would break the shred itself (shredded_at, wrapped_key,
--       destroyed_at are granted UPDATE at 0054:882-885) and the incident CLI
--       (public_incident.ended_at, 0053:35). The trigger carries its own name so
--       it can never be mistaken for, or dropped by, an earlier migration's
--       `DROP TRIGGER IF EXISTS reject_mutation`.
--    d) register.required_row / required_row_version: TRUNCATE guard only.
--       They are a migration-owned manifest, and 0061:2-8 DELETEs from
--       required_row_version by design when a publication profile is rebuilt; a
--       reject trigger fires for the owner too and would brick that migration.
--
-- §2 search_path pin (DL5-F5). core.reject_edge_mutation_except_measurement()
--    (0052_t5:88-125) is the one function in the application schemas with
--    proconfig IS NULL — the L5-F10 class re-introduced after 0056's fixed
--    list. Its body uses only <>, IS DISTINCT FROM and RAISE, all of which
--    resolve through search_path. ALTER FUNCTION only; the body is 0052_t5's
--    and stays untouched.
--
-- §3 Surplus EXECUTE grants (DL5-F4). Four grants to debateai_runtime with no
--    caller bound to a debateai_runtime URL. Revoking an ACL entry that is not
--    there is a no-op, so each REVOKE is idempotent.

-- §1 -------------------------------------------------------------------------

-- a) + b) + c) + d): the TRUNCATE guard, on all 20. core.install_truncate_guard
-- (0056:94-131) creates the guard when absent, leaves an existing enabled
-- BEFORE TRUNCATE statement guard alone, and raises 55000 TRUNCATE_GUARD_CONFLICT
-- for any other shape — it never repairs silently.
SELECT core.install_truncate_guard('support.message');
SELECT core.install_truncate_guard('support.abuse_event');
SELECT core.install_truncate_guard('support.case_event');
SELECT core.install_truncate_guard('support.case_message');
SELECT core.install_truncate_guard('support.rating');
SELECT core.install_truncate_guard('support.tool_call');
SELECT core.install_truncate_guard('support.relay_call');
SELECT core.install_truncate_guard('support.relay_waiter');
SELECT core.install_truncate_guard('support.relay_waiter_event');
SELECT core.install_truncate_guard('support.admission_event');
SELECT core.install_truncate_guard('support.shred_audit');
SELECT core.install_truncate_guard('support.session');
SELECT core.install_truncate_guard('support."case"');
SELECT core.install_truncate_guard('support.session_key');
SELECT core.install_truncate_guard('support.case_key');
SELECT core.install_truncate_guard('support.public_incident');
SELECT core.install_truncate_guard('support._shred_integrity_guard');
SELECT core.install_truncate_guard('serve.synthesis_round');
SELECT core.install_truncate_guard('register.required_row');
SELECT core.install_truncate_guard('register.required_row_version');

-- a) the append-only ten: UPDATE and DELETE closed for every role, owner
-- included. serve.synthesis_round is the T9 loop record the served answer is
-- audited against; its guard was deferred at 0057_t09:32-34 and never landed.
DO $security_delta_append_only_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'support.abuse_event',
    'support.case_event',
    'support.rating',
    'support.tool_call',
    'support.relay_call',
    'support.relay_waiter',
    'support.relay_waiter_event',
    'support.admission_event',
    'support.shred_audit',
    'serve.synthesis_round'
  ] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS reject_mutation ON %s', target);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()', target
    );
  END LOOP;
END
$security_delta_append_only_guards$;

-- c) the never-deleted six: DELETE closed, the granted column UPDATEs kept.
DO $security_delta_never_deleted_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'support.session',
    'support."case"',
    'support.session_key',
    'support.case_key',
    'support.public_incident',
    'support._shred_integrity_guard'
  ] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS reject_delete ON %s', target);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER reject_delete BEFORE DELETE ON %s '
      'FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()', target
    );
  END LOOP;
END
$security_delta_never_deleted_guards$;

-- §2 -------------------------------------------------------------------------

ALTER FUNCTION core.reject_edge_mutation_except_measurement()
  SET search_path = pg_catalog, pg_temp;

-- §3 -------------------------------------------------------------------------

-- register.publish_register_version / import_historical_register_version:
-- the only callers are packages/register/src/register-publication.ts:782,813
-- inside createPostgresRegisterPublicationPort, constructed by
-- apps/runner/src/dev-deployment-register-cli.ts:12 (MIGRATION_DATABASE_URL),
-- dev-deployment-register.ts:768 (adminPool) and dev-auth-data-plane.ts:408 —
-- all migrator-credential CLIs, none of them a debateai_runtime URL. Runtime
-- consumers read a pinned REGISTER_VERSION (apps/api/src/main.ts:143-200) and
-- never publish. The function owner debateai_register_publication_owner keeps
-- EXECUTE implicitly, so the publication path is untouched.
REVOKE EXECUTE ON FUNCTION
  register.publish_register_version(uuid, char, bigint, jsonb, text),
  register.import_historical_register_version(bigint, jsonb, char)
  FROM debateai_runtime;

-- register.assert_required_rows: called only by the 0061:28 trigger, which runs
-- with the definer's rights whatever the caller holds (0050_t16:58-91).
REVOKE EXECUTE ON FUNCTION register.assert_required_rows(bigint)
  FROM debateai_runtime;

-- register.claim_type_composition_map_is_valid: a CHECK function on
-- register.register_row. PostgreSQL privilege-checks a CHECK function at
-- executor init for the role performing the INSERT, which is why 0056:263-265
-- granted it to debateai_runtime. 0055:2019 then revoked INSERT on
-- register.register_row from debateai_runtime and moved every insert to
-- debateai_register_publication_owner (granted at 0055:2015-2016), so the
-- runtime grant has had no executor-init path since. The owner grant stays.
REVOKE EXECUTE ON FUNCTION register.claim_type_composition_map_is_valid(jsonb)
  FROM debateai_runtime;

-- DL7-F9 (observation.threshold_policy INSERT held by the observation agent's
-- own role) is NOT revoked here, and the report says so. The revoke was traced
-- first, as asked: apps/observation-agent/src/oactl/core/thresholds.ts:270
-- (`oactl thresholds apply`) is a live INSERT caller, and
-- apps/observation-agent/src/oactl/core/commands.ts:196-198 opens it with
-- OBSERVATION_DATABASE_URL — the same env key, and therefore the same
-- debateai_observation_agent principal, that the daemon uses at
-- apps/observation-agent/src/main.ts:84,103 (provision.ts:44-50 writes that
-- URL with the agent's own credential). Revoking here would break the
-- documented threshold-apply ritual (OBS-01 SPEC.md step 3) with no other
-- writer to take it over. Closing it needs a second principal
-- (debateai_obs_threshold_operator) plus its credential wiring in
-- apps/observation-agent and deploy/, which package DB1 may not touch.

-- §4 -------------------------------------------------------------------------
--
-- DL2-F2 / DL5-F1. The shred-integrity invariant stays exactly as 0054 defined
-- it; only its enforcement mechanism changes, from one global serialisation
-- point plus a full-schema scan to a per-scope check.
--
-- What 0054 built: five AFTER ... FOR EACH STATEMENT triggers on
-- support.session, session_key, "case", case_key and shred_audit, each calling
-- support.mark_shred_integrity_dirty(), which UPDATEs the single row of
-- support._shred_integrity_guard (0054:540-559). That UPDATE takes a row lock
-- held to COMMIT, so EVERY writer in the support subsystem queues behind every
-- other one, whatever rows it touched. The UPDATE then fires a DEFERRABLE
-- INITIALLY DEFERRED constraint trigger which, at COMMIT, runs
-- support.assert_shred_integrity() — a seven-branch EXISTS with a GROUP BY over
-- ALL support.session and support."case" rows and correlated sub-queries over
-- shred_audit x session, with no predicate on the rows the transaction actually
-- touched (0054:588-680), against a table that has no index on
-- identity_owner_ref. Measured on the audit's probe: 0.33 -> 0.76 ms per
-- session+key commit as N went 300 -> 1200 (slope ~0.48 microseconds per
-- existing session per commit; a trigger-free control table cost 0.13 ms), and
-- a concurrent session INSERT sat in wait_event_type=Lock,
-- wait_event=transactionid for 735 ms. Support rows are never deleted, and
-- anonymous session creation is open to the internet, so N only grows: the
-- subsystem's own availability decays with its own traffic.
--
-- What this file installs instead: one DEFERRABLE INITIALLY DEFERRED
-- CONSTRAINT TRIGGER ... FOR EACH ROW on the same five relations, calling
-- support.assert_shred_integrity_row(), which resolves the touched row to its
-- SCOPE — one session, or the owner / anonymous-session target the shred audit
-- is keyed on — and calls support.assert_shred_integrity_scope(), which runs
-- 0054's seven branches restricted to that scope. Both functions are new and
-- belong to this file; 0054's two functions are not redefined (their bodies are
-- pinned by body hash at 0054:507-538 and 753-787, and the 0063:20-39 rule
-- forbids replacing another migration's function), they are simply no longer
-- reachable from a trigger.
--
-- Cross-transaction ordering is preserved, and moved from global to per scope.
-- assert_shred_integrity_scope() opens by taking the scope's session rows
-- FOR UPDATE, in session_id order, before it reads anything else. Two commits
-- whose scopes overlap therefore still serialise exactly as the singleton made
-- them, and the second one re-reads after the first commits and sees the
-- violation (the 0054 regression the SUP-07 suite pins: an owner shred and a
-- new session for that owner must not both commit). Two commits with disjoint
-- scopes — the anonymous-session case that drives N — no longer meet at all.
-- Deterministic lock order (ORDER BY session_id) keeps the guard deadlock-free.
--
-- Residual, deliberate and named: the singleton UPDATE also produced a
-- first-updater-wins conflict under REPEATABLE READ and SERIALIZABLE for ANY
-- pair of support writers. The scoped guard reproduces that only for
-- overlapping scopes (via the row locks). No application path is affected:
-- every support writer runs withSupportTransaction, i.e. READ COMMITTED
-- (packages/db/src/support.ts:324-340), owner-bound session creation and the
-- owner shred both hold the same per-owner advisory lock for the whole
-- transaction (support.ts:390-398 and 1482-1489), and under SERIALIZABLE
-- create()'s read of support.shred_audit against shredOwner()'s INSERT there is
-- an rw-antidependency SSI aborts on its own.
--
-- support.session gets the index the full scan never had; it is partial because
-- anonymous sessions (identity_owner_ref IS NULL) are the bulk and are never an
-- owner scope.
--
-- Replay note for the migration ledger (B28 / DL5-F9): this file drops all six
-- of 0054's guard triggers, so a standalone replay of 0054 — which
-- tests/integration/support-shred.test.ts exercises, and which 0063:20-39
-- records as legal in production — finds none of them, re-creates all six and
-- passes its own contract. Both mechanisms then enforce the same invariant and
-- the slow one is back until 0065 is replayed. Dropping only some of the six
-- would instead abort that replay with SUPPORT_SHRED_DEFINITION_DRIFT.

CREATE INDEX IF NOT EXISTS support_session_identity_owner_ref_idx
  ON support.session (identity_owner_ref)
  WHERE identity_owner_ref IS NOT NULL;

-- The cases of a session were only reachable through support."case"'s primary
-- key or the partial support_case_trigger_generation_unique index, so every
-- `WHERE session_id = ...` — the scoped guard's, and lockShredTargetRows'
-- (packages/db/src/support.ts:1401-1407) — planned as a sequential scan.
CREATE INDEX IF NOT EXISTS support_case_session_id_idx
  ON support."case" (session_id);

CREATE OR REPLACE FUNCTION support.assert_shred_integrity_scope(
  p_session_id uuid,
  p_target_kind text,
  p_target_ref text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
-- Measured, and the reason this line exists: plpgsql caches a generic plan for
-- each statement in the body after a few calls, and a backend that first ran
-- this guard against an empty support.session keeps a sequential-scan plan as
-- the table grows — the O(N) commit this section exists to remove, re-created
-- through the plan cache. (Probe: 0.449 ms/commit at N=200, 0.739 ms on the same
-- pooled connection at N=2200, 0.400 ms on a fresh connection at the same N.)
-- Every predicate here is a highly selective equality on one to a handful of
-- ids, so re-planning per call is both correct and cheap, and its cost does not
-- depend on N.
SET plan_cache_mode = force_custom_plan
AS $support_shred_scope_function$
DECLARE
  v_kind text := p_target_kind;
  v_ref text := p_target_ref;
  v_owner uuid;
  v_anonymous uuid;
  v_sessions uuid[];
  v_invalid boolean;
  v_count integer;
BEGIN
  IF p_session_id IS NULL AND v_kind IS NULL THEN
    RETURN;
  END IF;
  IF v_kind IS NULL THEN
    SELECT CASE WHEN scoped.identity_owner_ref IS NULL THEN 'session' ELSE 'owner' END,
      CASE WHEN scoped.identity_owner_ref IS NULL
        THEN scoped.session_id::text ELSE scoped.identity_owner_ref::text END
    INTO v_kind, v_ref
    FROM support.session AS scoped
    WHERE scoped.session_id = p_session_id;
  END IF;
  IF v_kind = 'owner' THEN
    v_owner := v_ref::uuid;
  ELSIF v_kind = 'session' THEN
    v_anonymous := v_ref::uuid;
  END IF;

  -- Collect the scope with one index lookup per source; never an OR over the
  -- whole table, which would plan as a sequential scan and put the O(N) cost
  -- straight back. session_id hits the primary key; identity_owner_ref hits the
  -- partial index this file adds.
  v_sessions := ARRAY[]::uuid[];
  IF p_session_id IS NOT NULL THEN
    v_sessions := v_sessions || p_session_id;
  END IF;
  IF v_anonymous IS NOT NULL THEN
    v_sessions := v_sessions || v_anonymous;
  END IF;
  IF v_owner IS NOT NULL THEN
    v_sessions := v_sessions || COALESCE((
      SELECT array_agg(owned.session_id)
      FROM support.session AS owned
      WHERE owned.identity_owner_ref = v_owner
    ), ARRAY[]::uuid[]);
  END IF;
  SELECT COALESCE(array_agg(DISTINCT member.session_id), ARRAY[]::uuid[])
  INTO v_sessions
  FROM pg_catalog.unnest(v_sessions) AS member(session_id);

  -- The serialisation point, scoped: the rows of this scope are locked before
  -- anything is read, in session_id order so the guard cannot deadlock with
  -- itself, and as the definer (debateai_support holds only column UPDATEs
  -- here, and none at all on shred_audit — see DL2-F1). Two commits whose
  -- scopes overlap therefore still order exactly as the 0054 singleton made
  -- them; two commits on unrelated sessions never meet.
  PERFORM 1
  FROM support.session AS locked
  WHERE locked.session_id = ANY(v_sessions)
  ORDER BY locked.session_id
  FOR UPDATE;

  SELECT EXISTS (
    -- exactly one live key per session, and the tombstone markers agree
    SELECT 1 FROM support.session AS parent
    LEFT JOIN support.session_key AS key ON key.session_id=parent.session_id
    WHERE parent.session_id = ANY(v_sessions)
    GROUP BY parent.session_id,parent.shredded_at
    HAVING pg_catalog.count(key.session_id)<>1
      OR pg_catalog.bool_or(
        (parent.shredded_at IS NULL) IS DISTINCT FROM (key.destroyed_at IS NULL)
      )
    UNION ALL
    -- the same for every case of a session in scope
    SELECT 1 FROM support."case" AS parent
    LEFT JOIN support.case_key AS key ON key.case_id=parent.case_id
    WHERE parent.session_id = ANY(v_sessions)
    GROUP BY parent.case_id,parent.shredded_at
    HAVING pg_catalog.count(key.case_id)<>1
      OR pg_catalog.bool_or(
        (parent.shredded_at IS NULL) IS DISTINCT FROM (key.destroyed_at IS NULL)
      )
    UNION ALL
    -- a shredded session leaves no unshredded case behind
    SELECT 1 FROM support."case" AS child
    JOIN support.session AS parent ON parent.session_id=child.session_id
    WHERE parent.session_id = ANY(v_sessions)
      AND parent.shredded_at IS NOT NULL AND child.shredded_at IS NULL
    UNION ALL
    -- every shredded session is covered by its audit row
    SELECT 1 FROM support.session AS object
    WHERE object.session_id = ANY(v_sessions) AND object.shredded_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM support.shred_audit AS audit
        WHERE audit.target_kind = CASE
            WHEN object.identity_owner_ref IS NULL THEN 'session' ELSE 'owner' END
          AND audit.target_ref = COALESCE(
            object.identity_owner_ref, object.session_id
          )::text
      )
    UNION ALL
    -- and so is every shredded case, through its parent
    SELECT 1 FROM support."case" AS object
    JOIN support.session AS parent ON parent.session_id=object.session_id
    WHERE parent.session_id = ANY(v_sessions) AND object.shredded_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM support.shred_audit AS audit
        WHERE audit.target_kind = CASE
            WHEN parent.identity_owner_ref IS NULL THEN 'session' ELSE 'owner' END
          AND audit.target_ref = COALESCE(
            parent.identity_owner_ref, parent.session_id
          )::text
      )
    UNION ALL
    -- an owner audit row means: that owner has sessions, all of them and all of
    -- their cases are shredded, and keys_destroyed counts exactly their keys
    SELECT 1 FROM support.shred_audit AS audit
    WHERE audit.target_kind='owner' AND v_owner IS NOT NULL
      AND audit.target_ref = v_owner::text
      AND (
        NOT EXISTS (SELECT 1 FROM support.session AS owned
          WHERE owned.identity_owner_ref=v_owner)
        OR EXISTS (SELECT 1 FROM support.session AS owned
          WHERE owned.identity_owner_ref=v_owner AND owned.shredded_at IS NULL)
        OR EXISTS (SELECT 1 FROM support."case" AS owned_case
          JOIN support.session AS owned ON owned.session_id=owned_case.session_id
          WHERE owned.identity_owner_ref=v_owner AND owned_case.shredded_at IS NULL)
        OR audit.keys_destroyed<>(
          SELECT pg_catalog.count(*)::integer FROM (
            SELECT owned_key.session_id FROM support.session_key AS owned_key
            JOIN support.session AS owned ON owned.session_id=owned_key.session_id
            WHERE owned.identity_owner_ref=v_owner
            UNION ALL
            SELECT owned_case_key.case_id FROM support.case_key AS owned_case_key
            JOIN support."case" AS owned_case
              ON owned_case.case_id=owned_case_key.case_id
            JOIN support.session AS owned ON owned.session_id=owned_case.session_id
            WHERE owned.identity_owner_ref=v_owner
          ) AS owner_keys
        )
      )
    UNION ALL
    -- a session audit row means: exactly one anonymous session with that id,
    -- shredded, its cases shredded, keys_destroyed counting its keys
    SELECT 1 FROM support.shred_audit AS audit
    WHERE audit.target_kind='session' AND v_anonymous IS NOT NULL
      AND audit.target_ref = v_anonymous::text
      AND (
        (SELECT pg_catalog.count(*) FROM support.session AS anonymous
          WHERE anonymous.session_id=v_anonymous
            AND anonymous.identity_owner_ref IS NULL)<>1
        OR EXISTS (SELECT 1 FROM support.session AS anonymous
          WHERE anonymous.session_id=v_anonymous AND anonymous.shredded_at IS NULL)
        OR EXISTS (SELECT 1 FROM support."case" AS anonymous_case
          WHERE anonymous_case.session_id=v_anonymous
            AND anonymous_case.shredded_at IS NULL)
        OR audit.keys_destroyed<>(
          SELECT pg_catalog.count(*)::integer FROM (
            SELECT anonymous_key.session_id FROM support.session_key AS anonymous_key
            WHERE anonymous_key.session_id=v_anonymous
            UNION ALL
            SELECT anonymous_case_key.case_id FROM support.case_key AS anonymous_case_key
            JOIN support."case" AS anonymous_case
              ON anonymous_case.case_id=anonymous_case_key.case_id
            WHERE anonymous_case.session_id=v_anonymous
          ) AS anonymous_keys
        )
      )
  ) INTO v_invalid;

  IF v_invalid THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_INTEGRITY_INVALID';
  END IF;

  -- Observable proof that the guard ran, for the SUP-07 suite: one increment per
  -- scope checked, transaction-local (0054 counted whole-schema scans instead).
  v_count:=COALESCE(NULLIF(pg_catalog.current_setting(
    'debateai.support_shred_validation_count',true
  ),'')::integer,0)+1;
  PERFORM pg_catalog.set_config(
    'debateai.support_shred_validation_count',v_count::text,true
  );
END
$support_shred_scope_function$;

CREATE OR REPLACE FUNCTION support.assert_shred_integrity_row()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET plan_cache_mode = force_custom_plan
AS $support_shred_row_function$
DECLARE
  v_row jsonb;
  v_session uuid;
  v_kind text;
  v_ref text;
BEGIN
  IF TG_OP='DELETE' THEN
    v_row:=pg_catalog.to_jsonb(OLD);
  ELSE
    v_row:=pg_catalog.to_jsonb(NEW);
  END IF;
  IF TG_TABLE_NAME='shred_audit' THEN
    v_kind:=v_row->>'target_kind';
    v_ref:=v_row->>'target_ref';
  ELSIF TG_TABLE_NAME='case_key' THEN
    SELECT parent.session_id INTO v_session
    FROM support."case" AS parent
    WHERE parent.case_id=(v_row->>'case_id')::uuid;
  ELSE
    v_session:=(v_row->>'session_id')::uuid;
  END IF;
  PERFORM support.assert_shred_integrity_scope(v_session,v_kind,v_ref);
  RETURN NULL;
END
$support_shred_row_function$;

REVOKE ALL ON FUNCTION support.assert_shred_integrity_scope(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION support.assert_shred_integrity_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION support.assert_shred_integrity_scope(uuid, text, text)
  FROM debateai_support;
REVOKE ALL ON FUNCTION support.assert_shred_integrity_row() FROM debateai_support;

-- Retire 0054's global mechanism. The constraint trigger goes last and only
-- after SET CONSTRAINTS fires whatever this transaction already queued for it:
-- 0054's closing statement (0054:985-988) bumps mutation_generation to schedule
-- one validation, and PostgreSQL resolves a deferred event's trigger at COMMIT,
-- so dropping it with an event outstanding would fail the whole migration.
DO $security_delta_retire_global_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid='support._shred_integrity_guard'::regclass
      AND trigger.tgname='support_shred_integrity_guard_trigger'
      AND NOT trigger.tgisinternal
  ) THEN
    SET CONSTRAINTS support.support_shred_integrity_guard_trigger IMMEDIATE;
    DROP TRIGGER support_shred_integrity_guard_trigger
      ON support._shred_integrity_guard;
  END IF;
END
$security_delta_retire_global_guard$;

DROP TRIGGER IF EXISTS support_shred_dirty_session ON support.session;
DROP TRIGGER IF EXISTS support_shred_dirty_session_key ON support.session_key;
DROP TRIGGER IF EXISTS support_shred_dirty_case ON support."case";
DROP TRIGGER IF EXISTS support_shred_dirty_case_key ON support.case_key;
DROP TRIGGER IF EXISTS support_shred_dirty_audit ON support.shred_audit;

DO $security_delta_install_scope_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'support.session',
    'support.session_key',
    'support."case"',
    'support.case_key',
    'support.shred_audit'
  ] LOOP
    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS support_shred_row_guard ON %s', target
    );
    EXECUTE pg_catalog.format(
      'CREATE CONSTRAINT TRIGGER support_shred_row_guard '
      'AFTER INSERT OR UPDATE OR DELETE ON %s '
      'DEFERRABLE INITIALLY DEFERRED '
      'FOR EACH ROW EXECUTE FUNCTION support.assert_shred_integrity_row()', target
    );
  END LOOP;
END
$security_delta_install_scope_guards$;

DO $security_delta_scope_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgname='support_shred_row_guard'
      AND trigger.tgfoid='support.assert_shred_integrity_row()'::regprocedure
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid=ANY(ARRAY[
        'support.session'::regclass,'support.session_key'::regclass,
        'support."case"'::regclass,'support.case_key'::regclass,
        'support.shred_audit'::regclass
      ])
  )<>5 OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgfoid=ANY(ARRAY[
        'support.mark_shred_integrity_dirty()'::regprocedure,
        'support.assert_shred_integrity()'::regprocedure
      ])
  ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_SCOPE_GUARD_INVALID';
  END IF;
END
$security_delta_scope_guard_contract$;
