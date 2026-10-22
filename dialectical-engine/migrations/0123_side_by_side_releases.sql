-- 0123 · Side-by-side releases (spec docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md §1, §4, §5,
-- §9; plan docs/superpowers/plans/2026-10-21-side-by-side-A-database.md, tasks A1-A5; INTERFACE "Database").
--
-- The transition release T's one migration: everything the database needs so a later upload can run next to the
-- release before it. Built section by section, each section numbered and each object it adds checked by the closing
-- contract block (and digested by the loader, packages/db/src/migration-forward0123.ts):
--   §1  core.run.release_key, the stamp of the release that runs each debate (A1);
--   §2  core.create_encrypted_run redefined in place so the encrypted insert path writes that stamp (A1);
--   §3  core.release_event, its view core.release_state_v, its two readers and its two writers serialized on one
--       advisory lock, owned by the new NOLOGIN role debateai_release_owner (A2);
--   §4  re-admission records: core.run_supersession and its guard, core.resolve_run_ref, core.run_waiting_v redefined
--       so a superseded run no longer waits, the readmitted run's key provision, the re-admissions whose START never
--       committed (core.list_unstarted_readmissions, plan C11 review), and the API runtime's reads (A3);
--   §5  core.run_wait_reason.waits_for widened with SITE_BUSY and SWITCHING (A3);
--   §6  the five funding functions that tied a grant to the selection's or the run's version, redefined in place
--       without that comparison, staff.read_self_allowance_command naming a revoke's grant's own version, and
--       staff.read_internal_funding_policy_at, the funding publication at a version (A4);
--   §7  ledger.model_spend_waiver, the append-only spend waiver of a set-aside debate, and
--       billing.read_internal_grant_spent redefined in place so a funded person's window leaves waived runs out (A5).
--
-- n1 (spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         T is uploaded the old way, with no debate waiting or running (spec "The transition"), so this file
--                   may add a NOT NULL column with a default and redefine functions earlier files define; every later
--                   upload's step must instead be `expand` (additive only, safe while the old release runs).
--   keeps-verifier  0123 adds no billing relation and no billing function, so the effective-capability verifier in
--                   force (0111's, migrations/lineage/README.md step 3) stays in force and the manifest names it.
--
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): ADD COLUMN IF NOT EXISTS, each
-- CHECK dropped IF EXISTS before it is added, CREATE TABLE / INDEX IF NOT EXISTS, each trigger dropped IF EXISTS first,
-- each role created only when absent, CREATE OR REPLACE FUNCTION / VIEW; §5 finds 0083's unnamed waits_for CHECK by
-- its definition before it adds the widened one. Nothing historical is rewritten.

-- §1. core.run.release_key ------------------------------------------------------
-- Written once with the row, in the same INSERT as register_version (packages/db/src/index.ts startRun), because core.run
-- is never updated (0000's reject_mutation). Old rows, and a run written without a key, read 'legacy'. No runner serves
-- 'legacy' (packages/kernel/src/release-key.ts), so a forgotten admission path fails loudly instead of running a debate
-- on the wrong release (ruling O1). The CHECK repeats the kernel's form: r<site settings version>-<12 lowercase hex>.
-- Adding a NOT NULL column with a constant default rewrites no row; the CHECK reads the table once (T is drained).
ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS release_key text NOT NULL DEFAULT 'legacy',
  DROP CONSTRAINT IF EXISTS run_release_key_shape,
  ADD CONSTRAINT run_release_key_shape CHECK (release_key = 'legacy' OR release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$');

COMMENT ON COLUMN core.run.release_key IS
  'The release that runs this debate (side-by-side spec §1): r<site settings version>-<12 hex of the source revision>, or legacy for a run written before 0123 or without a key. Written once at insert; only that release may touch the run. A code, never content: retained after private-run erasure like register_version.';

-- §2. core.create_encrypted_run writes the stamp --------------------------------
-- 0072's body byte for byte, with three changes: 'releaseKey' joins the closed key list, the INSERT writes
-- release_key = COALESCE(p_run->>'releaseKey','legacy'), and an intent §4's core.prepare_readmitted_run_key_provision
-- marked (readmitted_from_run_id) commits through core.lock_readmitted_run_key_provision_for_commit (no live session,
-- the re-admission's own checks) and ONLY through it, while every unmarked intent keeps 0040's lock (a live session).
-- The CASE evaluates one branch, so a marked intent whose session happens to be live still takes the readmit checks
-- (A3 review). A malformed key fails §1's CHECK inside the function, whose
-- handler answers false like any other refused document (check_violation), so nothing of the run is written.
-- startRun's capability probe still finds 'planTier' and 'argumentLanguageTag' in this definition, and it never strips
-- 'releaseKey': a database without this step refuses a stamped document instead of silently dropping the stamp.
--
-- 0063's rule ("never CREATE OR REPLACE a function another migration defines") is broken here, for this one function,
-- as 0067 and 0072 broke it before: the encrypted insert path has exactly one writer, and a second function would leave
-- the old one able to write an unstamped run. A replay of 0072 cannot undo it: the native migrate() never runs an
-- applied file twice, and the loader digests this definition on every later migrate() (0120's precedent).
-- CREATE OR REPLACE keeps 0040's owner; SECURITY DEFINER, the pinned search_path and the EXECUTE set (0040:6141-6143,
-- 6363-6369: debateai_content_provision only) are written again below and checked by the closing block.
CREATE OR REPLACE FUNCTION core.create_encrypted_run(
  p_run jsonb,p_user_id uuid,p_owner_ref uuid,p_battery_rows jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid;
  v_execution_ref uuid;
  v_battery_row jsonb;
BEGIN
  IF jsonb_typeof(p_run)<>'object' OR p_run-ARRAY[
    'runId','questionLine','askerId','executionRef','callerScope','asOf',
    'askerRiskTier','riskTier','tierSource','tierProvenanceRef',
    'compositionBudgetTier','planTier','argumentLanguageTag',
    'argumentLanguageName','depthParams','discoveredPanel','strangerSampleRate',
    'envelopeBasis','registerVersion','batteryVersion','askContract',
    'contentCiphertext','contentAttestation','contentAttestationSecret','releaseKey'
  ]::text[]<>'{}'::jsonb
    OR jsonb_typeof(p_battery_rows)<>'array'
    OR jsonb_array_length(p_battery_rows)>100 THEN
    RETURN false;
  END IF;
  v_run_id := (p_run->>'runId')::uuid;
  v_execution_ref := (p_run->>'executionRef')::uuid;
  IF p_run->>'questionLine'<>'⟦DEBATEAI:CIPHERTEXT:V1⟧'
    OR p_run->>'askerId'<>'owner:'||p_owner_ref::text
    OR p_run->'askContract'<>'{"ciphertext":true,"v":1}'::jsonb
    OR NOT (CASE WHEN EXISTS (
        SELECT 1 FROM core.run_key_provision_intent AS marked
        WHERE marked.run_id=v_run_id AND marked.readmitted_from_run_id IS NOT NULL
      ) THEN core.lock_readmitted_run_key_provision_for_commit(
        v_run_id,p_user_id,p_owner_ref,v_execution_ref
      ) ELSE core.lock_run_key_provision_for_commit(
        v_run_id,p_user_id,p_owner_ref,v_execution_ref
      ) END) THEN
    RETURN false;
  END IF;
  IF octet_length(decode(p_run->>'contentAttestationSecret','base64'))<>32
    OR octet_length(decode(p_run->>'contentAttestation','base64'))<>32 THEN
    RETURN false;
  END IF;
  FOR v_battery_row IN SELECT value FROM jsonb_array_elements(p_battery_rows)
  LOOP
    IF jsonb_typeof(v_battery_row)<>'object' OR v_battery_row-ARRAY[
      'batteryRowId','predicateRef','openingState','predicateInputs','skipEvidence'
    ]::text[]<>'{}'::jsonb THEN
      RETURN false;
    END IF;
  END LOOP;
  INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at)
  VALUES (v_run_id,decode(p_run->>'contentAttestationSecret','base64'),clock_timestamp());
  INSERT INTO core.run(
    run_id,question_line,asker_id,session_id,caller_scope,as_of,
    asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
    composition_budget_tier,plan_tier,argument_language_tag,
    argument_language_name,depth_params,agent_count,
    discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,
    ask_contract,created_at_seq,content_encryption_version,
    question_blind_index_version,question_blind_index,content_ciphertext,content_attestation,
    release_key
  ) VALUES (
    v_run_id,p_run->>'questionLine',p_run->>'askerId',v_execution_ref::text,
    p_run->>'callerScope',(p_run->>'asOf')::timestamptz,
    p_run->>'askerRiskTier',p_run->>'riskTier',p_run->>'tierSource',
    p_run->>'tierProvenanceRef',p_run->>'compositionBudgetTier',p_run->>'planTier',
    COALESCE(p_run->>'argumentLanguageTag','und'),
    COALESCE(p_run->>'argumentLanguageName','the same language as the question'),
    p_run->'depthParams',jsonb_array_length(p_run->'discoveredPanel'),
    p_run->'discoveredPanel',(p_run->>'strangerSampleRate')::double precision,
    p_run->'envelopeBasis',(p_run->>'registerVersion')::bigint,
    p_run->>'batteryVersion',p_run->'askContract',ledger.allocate_sequence(),
    1,2,NULL,p_run->'contentCiphertext',decode(p_run->>'contentAttestation','base64'),
    COALESCE(p_run->>'releaseKey','legacy')
  );
  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);
  INSERT INTO core.question_liveness_event(run_id,kind,occurred_at,at_seq)
  VALUES (v_run_id,'QUERY',clock_timestamp(),ledger.allocate_sequence());
  INSERT INTO core.run_progress_event(run_id,at_seq,kind,value_json) VALUES
    (v_run_id,ledger.allocate_sequence(),'PHASE',to_jsonb('EMPIRICAL'::text)),
    (v_run_id,ledger.allocate_sequence(),'ENVELOPE_STATE',to_jsonb('WITHIN'::text)),
    (v_run_id,ledger.allocate_sequence(),'ENVELOPE_CONSUMED',to_jsonb(0));
  FOR v_battery_row IN SELECT value FROM jsonb_array_elements(p_battery_rows)
  LOOP
    INSERT INTO core.run_row_activation(run_id,battery_row_id,predicate_ref)
    VALUES (v_run_id,v_battery_row->>'batteryRowId',v_battery_row->>'predicateRef');
    INSERT INTO core.run_row_activation_event(
      run_id,battery_row_id,at_seq,state,predicate_inputs,skip_evidence
    ) VALUES (
      v_run_id,v_battery_row->>'batteryRowId',ledger.allocate_sequence(),
      v_battery_row->>'openingState',v_battery_row->'predicateInputs',
      CASE WHEN jsonb_typeof(v_battery_row->'skipEvidence')='null'
        THEN NULL ELSE v_battery_row->'skipEvidence' END
    );
  END LOOP;
  IF NOT core.complete_run_key_provision(
    v_run_id,p_user_id,p_owner_ref,v_execution_ref
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_KEY_PROVISION_INTENT_INCOMPLETE';
  END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION core.create_encrypted_run(jsonb,uuid,uuid,jsonb)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION core.create_encrypted_run(jsonb,uuid,uuid,jsonb) TO debateai_content_provision;

-- §3. The release table, its state view and its two serialized writers (spec §4, §6) -----------------------------
-- Which release takes the site's traffic is a record, never a file on one machine: core.release_event is the
-- append-only list of what happened to each release (STAGED, CURRENT, DRAINING, FRONT_PAIR_STOPPED, RETIRE_REQUESTED,
-- RETIRED), core.release_state_v reads one row per release from it, and every writer first takes ONE advisory lock, so
-- two switches can never both win (the second reads the first's CURRENT row and refuses RELEASE_SWITCH_CONFLICT).
-- At most two releases are ever live (spec non-goal): a switch refuses while a third release still drains. A release
-- still drains from its DRAINING event until a later RETIRED event, whatever it was marked since: a draining release
-- STAGED again for a rollback that never switched keeps its drained debates running, so it stays live.
--
-- Two NOLOGIN NOINHERIT roles, created and asserted as 0055 creates its own (0055:7-58):
--   debateai_release_owner     owns the four functions below and holds SELECT, INSERT on the table (USAGE on its
--                              sequence) and SELECT on the view, nothing else; nobody is its member;
--   debateai_release_operator  EXECUTE on the two writers only. Phase 1 provisions no login in it: the preview runs the
--                              writers as postgres through root (plan D), the tests as the superuser.
-- The runtime reads the state through the two read functions only (EXECUTE for debateai_runtime); it never reads the
-- table or the view and never writes. The table is the migrator's; no application role holds a grant on it.
DO $release_role_contract$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'debateai_release_owner') THEN
    CREATE ROLE debateai_release_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'debateai_release_operator') THEN
    CREATE ROLE debateai_release_operator NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN ('debateai_release_owner', 'debateai_release_operator')
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RELEASE_ROLE_INVALID';
  END IF;
  -- Nobody acts as the owner, and neither role is a member of anything.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = 'debateai_release_owner'::regrole
      OR membership.member = ANY(ARRAY['debateai_release_owner'::regrole, 'debateai_release_operator'::regrole])
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RELEASE_ROLE_INVALID';
  END IF;
  -- No runtime, replay or support role may switch releases.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS forbidden
    WHERE forbidden.rolname IN ('debateai_runtime', 'debateai_replay', 'debateai_support')
      AND pg_catalog.pg_has_role(forbidden.oid, 'debateai_release_operator'::regrole, 'MEMBER')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RELEASE_ROLE_INVALID';
  END IF;
END
$release_role_contract$;

-- The record. A key is §1's shape and never 'legacy' (no release serves it). take_traffic_from is set on exactly the
-- CURRENT rows: the instant from which that release's front takes the traffic (spec §6). recorded_by names who wrote
-- the row ('root:switch', 'root:rollback', ...), reason an optional code ('DRAINED', 'NOT_SWITCHED'). Codes, never content.
CREATE TABLE IF NOT EXISTS core.release_event (
  event_seq bigserial PRIMARY KEY,
  release_key text NOT NULL,
  kind text NOT NULL,
  take_traffic_from timestamptz NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by text NOT NULL,
  reason text NULL,
  CONSTRAINT release_event_key_shape CHECK (release_key <> 'legacy' AND release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'),
  CONSTRAINT release_event_kind_closed CHECK (
    kind IN ('STAGED', 'CURRENT', 'DRAINING', 'FRONT_PAIR_STOPPED', 'RETIRE_REQUESTED', 'RETIRED')),
  CONSTRAINT release_event_take_traffic_current CHECK ((kind = 'CURRENT') = (take_traffic_from IS NOT NULL)),
  CONSTRAINT release_event_recorded_by_shape CHECK (length(btrim(recorded_by)) BETWEEN 1 AND 128),
  CONSTRAINT release_event_reason_shape CHECK (reason IS NULL OR length(reason) <= 500)
);
CREATE INDEX IF NOT EXISTS release_event_key_seq_idx ON core.release_event (release_key, event_seq DESC);

-- Guards: 0056's truncate guard and the statement-level append-only trigger (0122's form). Nobody updates or deletes.
SELECT core.install_truncate_guard('core.release_event');
DROP TRIGGER IF EXISTS reject_mutation ON core.release_event;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.release_event
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- One row per release. state: its latest STAGED/CURRENT/DRAINING/RETIRED event. The two flags count only events
-- recorded AFTER the release's latest STAGED, CURRENT or DRAINING event (addendum item 1), so a release staged again,
-- switched to or drained starts clean, while RETIRED keeps them. take_traffic_from: its latest CURRENT event's.
CREATE OR REPLACE VIEW core.release_state_v AS
WITH keyed AS (
  SELECT event.release_key,
    max(event.event_seq) FILTER (WHERE event.kind IN ('STAGED', 'CURRENT', 'DRAINING', 'RETIRED')) AS state_seq,
    max(event.event_seq) FILTER (WHERE event.kind IN ('STAGED', 'CURRENT', 'DRAINING')) AS epoch_seq,
    max(event.event_seq) FILTER (WHERE event.kind = 'CURRENT') AS current_seq
  FROM core.release_event AS event
  GROUP BY event.release_key
)
SELECT keyed.release_key,
  state_event.kind AS state,
  EXISTS (
    SELECT 1 FROM core.release_event AS flag
    WHERE flag.release_key = keyed.release_key AND flag.kind = 'FRONT_PAIR_STOPPED'
      AND flag.event_seq > coalesce(keyed.epoch_seq, 0)) AS front_pair_stopped,
  EXISTS (
    SELECT 1 FROM core.release_event AS flag
    WHERE flag.release_key = keyed.release_key AND flag.kind = 'RETIRE_REQUESTED'
      AND flag.event_seq > coalesce(keyed.epoch_seq, 0)) AS retire_requested,
  current_event.take_traffic_from,
  coalesce(state_event.kind = 'CURRENT', false) AS current
FROM keyed
LEFT JOIN core.release_event AS state_event ON state_event.event_seq = keyed.state_seq
LEFT JOIN core.release_event AS current_event ON current_event.event_seq = keyed.current_seq;

-- The two readers (the API's /readyz and background loops, the runner's retirement check). A release never recorded,
-- and 'legacy', read no row. The switch keeps at most one release CURRENT, so read_current_release reads 0 or 1 row.
CREATE OR REPLACE FUNCTION core.read_current_release()
RETURNS TABLE(release_key text, take_traffic_from timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT release.release_key, release.take_traffic_from FROM core.release_state_v AS release WHERE release.current
$$;

-- still_draining (final review A4): a DRAINING event with no later RETIRED event, the same test record_release_event
-- makes below, so a draining release staged again for a rollback (latest state STAGED) still reads true while its
-- drained debates may run, and a release that never drained, or drained and retired, reads false. A release switched
-- back to CURRENT by that rollback reads true as well until it drains and retires: harmless, CURRENT serves every run.
CREATE OR REPLACE FUNCTION core.read_release_state(p_release_key text)
RETURNS TABLE(state text, front_pair_stopped boolean, retire_requested boolean, still_draining boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT release.state, release.front_pair_stopped, release.retire_requested,
    EXISTS (
      SELECT 1 FROM core.release_event AS drained
      WHERE drained.release_key = release.release_key AND drained.kind = 'DRAINING'
        AND NOT EXISTS (
          SELECT 1 FROM core.release_event AS retired
          WHERE retired.release_key = drained.release_key AND retired.kind = 'RETIRED'
            AND retired.event_seq > drained.event_seq)) AS still_draining
  FROM core.release_state_v AS release
  WHERE release.release_key = p_release_key AND p_release_key <> 'legacy'
$$;

-- The switch: the lock first, then every read under it, then the two inserts. READ COMMITTED is required (as 0055:1625
-- requires it): each statement after the lock then reads what the lock's previous holder committed, while an older
-- snapshot would read a stale current release. RELEASE_SWITCH_CONFLICT (40001): the current release is not
-- p_expected_current (NULL = none yet), or a release other than p_new and the current one still drains (a DRAINING
-- event with no later RETIRED event, even if it was STAGED again since).
-- RELEASE_EVENT_INVALID (22023): a malformed key or recorder, no p_take_traffic_from, p_new already current, or p_new's
-- latest state is not STAGED (addendum item 4: a draining or retired release is STAGED again first, as plan D's
-- rollback does). Then Phase 2's settings hook (addendum item 5, plan S): PL/pgSQL resolves a function at the
-- statement's first execution, so the guarded call is safe before 0124 exists, and 0124 never replaces this function.
-- Without the hook a non-NULL p_expected_active_settings refuses SETTINGS_ACTIVATION_CONFLICT. It writes CURRENT for
-- p_new and, if there was a current release, DRAINING for it, in that order, and returns the CURRENT row's event_seq.
CREATE OR REPLACE FUNCTION core.record_release_switch(
  p_new text,
  p_expected_current text,
  p_take_traffic_from timestamptz,
  p_recorded_by text,
  p_expected_active_settings bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_current text;
  v_new_state text;
  v_event_seq bigint;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RELEASE_EVENT_INVALID', DETAIL = 'READ_COMMITTED_REQUIRED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:release-switch', 0));
  IF p_new IS NULL OR p_new = 'legacy' OR p_new !~ '^r[1-9][0-9]*-[0-9a-f]{12}$'
    OR p_take_traffic_from IS NULL
    OR p_recorded_by IS NULL OR length(btrim(p_recorded_by)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RELEASE_EVENT_INVALID';
  END IF;
  SELECT state.release_key INTO v_current FROM core.release_state_v AS state WHERE state.current;
  IF v_current IS DISTINCT FROM p_expected_current THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'RELEASE_SWITCH_CONFLICT';
  END IF;
  IF p_new = v_current THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RELEASE_EVENT_INVALID';
  END IF;
  SELECT state.state INTO v_new_state FROM core.release_state_v AS state WHERE state.release_key = p_new;
  IF v_new_state IS DISTINCT FROM 'STAGED' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RELEASE_EVENT_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM core.release_event AS drained
    WHERE drained.kind = 'DRAINING' AND drained.release_key <> p_new AND drained.release_key IS DISTINCT FROM v_current
      AND NOT EXISTS (
        SELECT 1 FROM core.release_event AS retired
        WHERE retired.release_key = drained.release_key AND retired.kind = 'RETIRED'
          AND retired.event_seq > drained.event_seq)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'RELEASE_SWITCH_CONFLICT';
  END IF;
  IF pg_catalog.to_regprocedure('register.release_switch_settings_hook(text,bigint)') IS NOT NULL THEN
    PERFORM register.release_switch_settings_hook(p_new, p_expected_active_settings);
  ELSIF p_expected_active_settings IS NOT NULL THEN
    RAISE EXCEPTION 'SETTINGS_ACTIVATION_CONFLICT';
  END IF;
  INSERT INTO core.release_event(release_key, kind, take_traffic_from, recorded_by)
  VALUES (p_new, 'CURRENT', p_take_traffic_from, p_recorded_by)
  RETURNING event_seq INTO v_event_seq;
  IF v_current IS NOT NULL THEN
    INSERT INTO core.release_event(release_key, kind, recorded_by) VALUES (v_current, 'DRAINING', p_recorded_by);
  END IF;
  RETURN v_event_seq;
END;
$$;

-- Every other event, under the same lock and the same READ COMMITTED rule. RELEASE_EVENT_INVALID (22023) for a
-- malformed key, recorder or reason, any kind outside these five, and a disallowed transition:
--   STAGED              no state yet, or DRAINING or RETIRED (addendum item 2: a rollback stages an older release
--                       again);
--   FRONT_PAIR_STOPPED  a known release that is not the current one;
--   RETIRE_REQUESTED    DRAINING only;
--   RETIRED             STAGED (addendum item 3: never switched to, 'NOT_SWITCHED') or DRAINING ('DRAINED'); never a
--                       STAGED release that still drains (a DRAINING event with no later RETIRED event: staged again
--                       for a rollback that never switched, its drained debates may still run). Such a release retires
--                       only through the drain path: DRAINING again (below), then RETIRE_REQUESTED, then RETIRED;
--   DRAINING            only a STAGED release that still drains ("abandon the re-stage", controller ruling 2026-10-21):
--                       it goes back to finishing its own debates; its flags count from this new DRAINING event, so
--                       root records FRONT_PAIR_STOPPED again and the normal retirement path follows.
-- CURRENT is written by the switch alone, and so is every other DRAINING (the old current release at a switch).
CREATE OR REPLACE FUNCTION core.record_release_event(
  p_release_key text,
  p_kind text,
  p_recorded_by text,
  p_reason text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_state text;
  v_still_draining boolean;
  v_allowed boolean;
  v_event_seq bigint;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RELEASE_EVENT_INVALID', DETAIL = 'READ_COMMITTED_REQUIRED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:release-switch', 0));
  IF p_release_key IS NULL OR p_release_key = 'legacy' OR p_release_key !~ '^r[1-9][0-9]*-[0-9a-f]{12}$'
    OR p_kind IS NULL OR p_kind NOT IN ('STAGED', 'DRAINING', 'FRONT_PAIR_STOPPED', 'RETIRE_REQUESTED', 'RETIRED')
    OR p_recorded_by IS NULL OR length(btrim(p_recorded_by)) NOT BETWEEN 1 AND 128
    OR length(p_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RELEASE_EVENT_INVALID';
  END IF;
  SELECT state.state INTO v_state FROM core.release_state_v AS state WHERE state.release_key = p_release_key;
  v_still_draining := EXISTS (
    SELECT 1 FROM core.release_event AS drained
    WHERE drained.release_key = p_release_key AND drained.kind = 'DRAINING'
      AND NOT EXISTS (
        SELECT 1 FROM core.release_event AS retired
        WHERE retired.release_key = drained.release_key AND retired.kind = 'RETIRED'
          AND retired.event_seq > drained.event_seq));
  v_allowed := CASE p_kind
    WHEN 'STAGED' THEN v_state IS NULL OR v_state IN ('DRAINING', 'RETIRED')
    WHEN 'DRAINING' THEN v_state IS NOT DISTINCT FROM 'STAGED' AND v_still_draining
    WHEN 'FRONT_PAIR_STOPPED' THEN v_state IS NOT NULL AND v_state <> 'CURRENT'
    WHEN 'RETIRE_REQUESTED' THEN v_state IS NOT DISTINCT FROM 'DRAINING'
    WHEN 'RETIRED' THEN v_state IS NOT DISTINCT FROM 'DRAINING'
      OR (v_state IS NOT DISTINCT FROM 'STAGED' AND NOT v_still_draining)
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RELEASE_EVENT_INVALID';
  END IF;
  INSERT INTO core.release_event(release_key, kind, recorded_by, reason)
  VALUES (p_release_key, p_kind, p_recorded_by, p_reason)
  RETURNING event_seq INTO v_event_seq;
  RETURN v_event_seq;
END;
$$;

ALTER FUNCTION core.read_current_release() OWNER TO debateai_release_owner;
ALTER FUNCTION core.read_release_state(text) OWNER TO debateai_release_owner;
ALTER FUNCTION core.record_release_switch(text,text,timestamptz,text,bigint) OWNER TO debateai_release_owner;
ALTER FUNCTION core.record_release_event(text,text,text,text) OWNER TO debateai_release_owner;

REVOKE ALL ON core.release_event FROM PUBLIC;
REVOKE ALL ON SEQUENCE core.release_event_event_seq_seq FROM PUBLIC;
REVOKE ALL ON core.release_state_v FROM PUBLIC;
GRANT USAGE ON SCHEMA core TO debateai_release_owner, debateai_release_operator;
-- The switch's guarded settings hook (addendum item 5) names register.release_switch_settings_hook: to_regprocedure looks
-- the name up as the owner, which needs USAGE on the schema (without it the lookup itself is refused, 42501). USAGE
-- grants no object; 0124 grants EXECUTE on its hook when it defines one.
GRANT USAGE ON SCHEMA register TO debateai_release_owner;
GRANT SELECT, INSERT ON core.release_event TO debateai_release_owner;
GRANT USAGE, SELECT ON SEQUENCE core.release_event_event_seq_seq TO debateai_release_owner;
GRANT SELECT ON core.release_state_v TO debateai_release_owner;

REVOKE ALL ON FUNCTION core.read_current_release() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.read_release_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.record_release_switch(text,text,timestamptz,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.record_release_event(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.read_current_release() TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_release_state(text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.record_release_switch(text,text,timestamptz,text,bigint) TO debateai_release_operator;
GRANT EXECUTE ON FUNCTION core.record_release_event(text,text,text,text) TO debateai_release_operator;

-- §4. Re-admission records (spec §4, §9, §13; INTERFACE "Database") ----------------------------------------------
-- A debate that waits while a new release takes the traffic is re-admitted under the current release as a NEW run (plan
-- C, START): the old row is never touched (core.run is never updated), so its re-admission is a record.
-- core.run_supersession is that record, append-only: old_run_id → new_run_id, reason READMITTED. Its guard refuses an
-- edge unless the old run still waits (a core.run_wait row and no core.run_wait_start row: a started debate is never
-- re-admitted, ruling O1, plan A review focus 4; and still in core.run_waiting_v, below: not FAILED, its content not
-- erased, its account active, final review P3) and the new run has no edge of its own, so a cycle cannot form (an
-- edge X → Y needs Y without an outgoing edge). The new run must also be live (no FAILED work item) and, when its
-- execution binding marks it as a re-admission (readmitted_from_run_id, below), the re-admission of this old run (A3
-- review). The guard takes ONE advisory lock, so two edges written at once are checked one after the other, and it
-- locks the old run's wait row FOR UPDATE, which waits for a transaction starting that run (its run_wait_start insert
-- holds KEY SHARE on the row) and then reads its start. The primary key refuses a second edge out of a run (23505),
-- UNIQUE new_run_id a second edge into one. Both runs must belong to the same person (A3 review): their principal, read
-- as core.run_waiting_v reads it (the latest ownership event's owner, otherwise the asker id), must be the same, so an
-- old id can never resolve to another person's run. Both race guards rely on READ COMMITTED, the isolation every writer
-- of the line uses: after waiting for the lock, the guard's next statement takes a new snapshot and so reads what the
-- lock's holder committed. The API writes the edge inside START, as debateai_billing_runtime: the API's own capability
-- role (0093; the API's login holds it, the runner's does not), so the runner can neither record nor resolve a
-- supersession (least privilege, controller ruling 2026-10-22 on A-x2). The other direction is guarded too: once a run
-- is superseded, starting it is refused RUN_SUPERSEDED (below).
CREATE TABLE IF NOT EXISTS core.run_supersession (
  old_run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  new_run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT run_supersession_reason_closed CHECK (reason IN ('READMITTED')),
  CONSTRAINT run_supersession_changes_the_run CHECK (old_run_id <> new_run_id)
);

-- RUN_SUPERSESSION_INVALID (23514, the CHECK family: a refused row). A definer, because the FOR UPDATE row lock needs a
-- right the runtime does not hold on core.run_wait (it holds SELECT, INSERT only); it reads codes and ids, nothing else.
CREATE OR REPLACE FUNCTION core.guard_run_supersession()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_old_principal text;
  v_new_principal text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:run-supersession', 0));
  PERFORM 1 FROM core.run_wait AS wait WHERE wait.run_id = NEW.old_run_id FOR UPDATE;
  IF NOT FOUND
    OR EXISTS (SELECT 1 FROM core.run_wait_start AS started WHERE started.run_id = NEW.old_run_id)
    -- The old run still waits as the line reads it (final review P3): START writes the edge after createRun committed
    -- the new run on its own connection, so an erasure (or a set-aside) committed in between is read here, after the
    -- lock, and a deleted question never restarts under a new id.
    OR NOT EXISTS (SELECT 1 FROM core.run_waiting_v AS line WHERE line.run_id = NEW.old_run_id)
    OR EXISTS (SELECT 1 FROM core.run_supersession AS onward WHERE onward.old_run_id = NEW.new_run_id)
    -- The edge points only at the live re-admission of that same run (A3 review): never at a run recorded FAILED (it
    -- never runs, so the old run must keep its place), never at a run whose binding marks it as another run's.
    OR EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = NEW.new_run_id AND work.state = 'FAILED')
    OR EXISTS (
      SELECT 1 FROM identity.run_execution_binding AS marked
      WHERE marked.run_id = NEW.new_run_id AND marked.readmitted_from_run_id IS NOT NULL
        AND marked.readmitted_from_run_id <> NEW.old_run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RUN_SUPERSESSION_INVALID';
  END IF;
  -- Each run's person: 'owner:<ref>' from its latest ownership event, else its asker id ('owner:<ref>' or a legacy id).
  SELECT CASE WHEN latest.owner_ref IS NOT NULL THEN 'owner:' || latest.owner_ref::text ELSE run.asker_id END
  INTO v_old_principal
  FROM core.run AS run
  LEFT JOIN LATERAL (
    SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id = run.run_id ORDER BY event.at_seq DESC LIMIT 1
  ) AS latest ON true
  WHERE run.run_id = NEW.old_run_id;
  SELECT CASE WHEN latest.owner_ref IS NOT NULL THEN 'owner:' || latest.owner_ref::text ELSE run.asker_id END
  INTO v_new_principal
  FROM core.run AS run
  LEFT JOIN LATERAL (
    SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id = run.run_id ORDER BY event.at_seq DESC LIMIT 1
  ) AS latest ON true
  WHERE run.run_id = NEW.new_run_id;
  IF v_old_principal IS NULL OR v_old_principal IS DISTINCT FROM v_new_principal THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RUN_SUPERSESSION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION core.guard_run_supersession() FROM PUBLIC;

-- Guards: 0056's truncate guard, the statement-level append-only trigger (0122's form), and the edge guard.
SELECT core.install_truncate_guard('core.run_supersession');
DROP TRIGGER IF EXISTS reject_mutation ON core.run_supersession;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_supersession
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS guard_run_supersession ON core.run_supersession;
CREATE TRIGGER guard_run_supersession BEFORE INSERT ON core.run_supersession
  FOR EACH ROW EXECUTE FUNCTION core.guard_run_supersession();

-- An old run id keeps working (plan C9: routes, the person's list, the export): the newest run its chain reaches, or the
-- input itself when it has no edge, without checking that such a run exists. Re-admission happens once per upload a
-- debate waits through, so a chain longer than 16 is a fault, never a real history: RUN_SUPERSESSION_CHAIN_INVALID
-- (55000). The guard already makes a cycle impossible; the bound also stops one written past it. Owned by
-- debateai_release_owner (SELECT on the table, nothing else), callable by the API's role alone.
CREATE OR REPLACE FUNCTION core.resolve_run_ref(p_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid := p_run_id;
  v_next uuid;
  v_hops integer := 0;
BEGIN
  LOOP
    SELECT edge.new_run_id INTO v_next FROM core.run_supersession AS edge WHERE edge.old_run_id = v_run_id;
    EXIT WHEN NOT FOUND;
    v_hops := v_hops + 1;
    IF v_hops > 16 THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_SUPERSESSION_CHAIN_INVALID';
    END IF;
    v_run_id := v_next;
  END LOOP;
  RETURN v_run_id;
END;
$$;
ALTER FUNCTION core.resolve_run_ref(uuid) OWNER TO debateai_release_owner;
REVOKE ALL ON FUNCTION core.resolve_run_ref(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.resolve_run_ref(uuid) TO debateai_billing_runtime;

REVOKE ALL ON core.run_supersession FROM PUBLIC;
GRANT SELECT, INSERT ON core.run_supersession TO debateai_billing_runtime;
GRANT SELECT ON core.run_supersession TO debateai_release_owner;

-- A SUPERSEDED RUN NEVER STARTS (the reverse of the guard above, controller ruling 2026-10-22). A BEFORE INSERT row
-- trigger on 0083's core.run_wait_start (a new trigger: no 0083 object is redefined) refuses RUN_SUPERSEDED (23514)
-- when the run has a supersession row. It first takes KEY SHARE on the run's wait row, which waits for a transaction
-- writing an edge out of that run (the guard holds the row FOR UPDATE) and then reads its committed edge; the other
-- order is the guard's (it waits for this start's KEY SHARE, then reads the start). Like the guard, this relies on READ
-- COMMITTED: the read after the lock wait is a new statement, with a new snapshot. A definer, because the row lock and
-- the read of core.run_supersession need rights the runtime (the waker's role) does not hold; it reads ids only.
CREATE OR REPLACE FUNCTION core.refuse_starting_superseded_run()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM 1 FROM core.run_wait AS wait WHERE wait.run_id = NEW.run_id FOR KEY SHARE;
  IF EXISTS (SELECT 1 FROM core.run_supersession AS edge WHERE edge.old_run_id = NEW.run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RUN_SUPERSEDED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION core.refuse_starting_superseded_run() FROM PUBLIC;
DROP TRIGGER IF EXISTS refuse_starting_superseded_run ON core.run_wait_start;
CREATE TRIGGER refuse_starting_superseded_run BEFORE INSERT ON core.run_wait_start
  FOR EACH ROW EXECUTE FUNCTION core.refuse_starting_superseded_run();

-- THE LINE AS IT IS READ, a superseded run excluded: 0083:127-171's view, its columns in the same order, plus the last
-- NOT EXISTS (a superseded run's new run takes its place in line; the old one never starts). 0063's rule is broken
-- here for this one view, as plan A allows a drained upload to (0123's header): the line has one reader shape, and a
-- second view would leave every existing reader counting a re-admitted debate twice. 0083's grant is written again.
CREATE OR REPLACE VIEW core.run_waiting_v AS
SELECT wait.run_id,
       wait.waiting_since,
       run_owner.owner_ref,
       CASE WHEN run_owner.owner_ref IS NULL THEN run.asker_id END AS legacy_asker_id,
       run.plan_tier,
       run.composition_budget_tier,
       COALESCE((run.depth_params->>'depth')::integer, 1) AS depth,
       jsonb_array_length(run.discovered_panel) AS maker_count,
       reason.waits_for,
       reason.person_recheck_at,
       reason.evaluated_at AS reason_at,
       reason.recorded_at AS reason_recorded_at
FROM core.run_wait AS wait
JOIN core.run AS run ON run.run_id = wait.run_id
LEFT JOIN LATERAL (
  SELECT event.owner_ref
  FROM core.run_ownership_event AS event
  WHERE event.run_id = wait.run_id
  ORDER BY event.at_seq DESC
  LIMIT 1
) AS latest ON true
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN latest.owner_ref IS NOT NULL THEN latest.owner_ref
           WHEN run.asker_id LIKE 'owner:%' THEN substr(run.asker_id, 7)::uuid
         END AS owner_ref
) AS run_owner
LEFT JOIN LATERAL (
  SELECT recorded.waits_for, recorded.person_recheck_at, recorded.evaluated_at, recorded.recorded_at
  FROM core.run_wait_reason AS recorded
  WHERE recorded.run_id = wait.run_id
  ORDER BY recorded.recorded_at DESC, recorded.reason_id DESC
  LIMIT 1
) AS reason ON true
WHERE NOT EXISTS (SELECT 1 FROM core.run_wait_start AS started WHERE started.run_id = wait.run_id)
  AND NOT EXISTS (
    SELECT 1 FROM core.work_item AS work WHERE work.run_id = wait.run_id AND work.state = 'FAILED'
  )
  AND (run.content_encryption_version IS DISTINCT FROM 1
    OR core.run_private_content_is_live(wait.run_id))
  AND (run_owner.owner_ref IS NULL OR EXISTS (
    SELECT 1 FROM identity."user" AS account
    WHERE account.owner_ref = run_owner.owner_ref AND account.state = 'active'
  ))
  AND NOT EXISTS (SELECT 1 FROM core.run_supersession s WHERE s.old_run_id = wait.run_id);
GRANT SELECT ON core.run_waiting_v TO debateai_runtime;

-- THE READMITTED RUN'S KEY PROVISION (addendum A-x1, plan C11). An owner's encrypted waiting run outlives the session it
-- was asked in, and today's core.prepare_run_key_provision and core.lock_run_key_provision_for_commit (0040, 0085, 0099)
-- both need that session live. The re-admission (content-provision login, its own connection) instead prepares the NEW
-- run's provision from the OLD run's binding: the same user and identity session, a fresh execution ref, and an intent
-- marked readmitted_from_run_id. The account must still be active and still map to the old run's owner. The commit
-- (§2's core.create_encrypted_run) then takes the marked intent through core.lock_readmitted_run_key_provision_for_commit,
-- which checks everything the ordinary lock checks except the session, and that the old run still waits. An unmarked
-- intent never commits without a live session.
--
-- ONE LIVE RE-ADMISSION PER OLD RUN (A3 review): otherwise one waiting run could mint any number of session-free
-- encrypted runs, since it keeps waiting until START writes its edge on another login. The marker is therefore also
-- written, durably, on the new run's identity.run_execution_binding (which outlives the intent: it is removed only with
-- its account, or by 0040's sweep together with an intent that never became a run). Prepare refuses
-- RUN_READMISSION_TAKEN while any earlier re-admission of the same old run is pending (its binding has no run yet) or
-- alive (its run exists without a FAILED job). A re-admitted run recorded FAILED (plan C11's orphan path,
-- RUN_SETUP_FAILED:READMISSION: the START transaction failed after the new run committed) frees the old run for the
-- next tick, so the debate is never stranded; such a run never ran and never runs. One whose FAILED record never
-- landed (a crash between its row and its START) is listed by core.list_unstarted_readmissions below, and recorded
-- then. Prepare decides this under the account's advisory lock (two prepares for one person run one after the other),
-- and a partial UNIQUE index keeps at most one pending intent per old run regardless.
ALTER TABLE core.run_key_provision_intent ADD COLUMN IF NOT EXISTS readmitted_from_run_id uuid NULL;
COMMENT ON COLUMN core.run_key_provision_intent.readmitted_from_run_id IS
  'Side-by-side spec §4 (0123 §4): set only by core.prepare_readmitted_run_key_provision, the waiting run this provision re-admits; the commit then needs no live session. NULL for every ordinary provision.';
CREATE UNIQUE INDEX IF NOT EXISTS run_key_provision_intent_one_readmission_idx
  ON core.run_key_provision_intent (readmitted_from_run_id) WHERE readmitted_from_run_id IS NOT NULL;
ALTER TABLE identity.run_execution_binding ADD COLUMN IF NOT EXISTS readmitted_from_run_id uuid NULL;
COMMENT ON COLUMN identity.run_execution_binding.readmitted_from_run_id IS
  'Side-by-side spec §4 (0123 §4): the waiting run this run re-admits, written by core.prepare_readmitted_run_key_provision; NULL for every ordinary run. An id, never content.';
CREATE INDEX IF NOT EXISTS run_execution_binding_readmitted_from_idx
  ON identity.run_execution_binding (readmitted_from_run_id) WHERE readmitted_from_run_id IS NOT NULL;

-- RUN_READMISSION_INVALID (55000): the old run is not an owner's encrypted run, does not wait any more (started, FAILED,
-- content erased, already superseded: core.run_waiting_v above), or the new run id is taken or equal to it.
-- RUN_READMISSION_OWNER_GONE (55000): the old run's binding is gone with its account, or the account is no longer
-- active (suspended, held, age-frozen, erased) or no longer maps to the run's owner.
-- RUN_READMISSION_TAKEN (55000): an earlier re-admission of the same old run is pending or alive (above), decided after
-- the account's lock. Locks in today's order: the
-- security subject, then the account (0085's prepare_run_key_provision). Returns the new run's execution ref and the
-- user the content key is provisioned for (plan C11: cipher.provisionRun(newRunId, { userId, ownerRef })).
CREATE OR REPLACE FUNCTION core.prepare_readmitted_run_key_provision(p_old_run_id uuid, p_new_run_id uuid)
RETURNS TABLE(execution_ref uuid, user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_owner_ref uuid;
  v_user_id uuid;
  v_session_id uuid;
  v_account record;
  v_execution_ref uuid;
  v_attempt integer := 0;
BEGIN
  IF p_old_run_id IS NULL OR p_new_run_id IS NULL OR p_old_run_id = p_new_run_id
    OR EXISTS (SELECT 1 FROM core.run AS taken WHERE taken.run_id = p_new_run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_READMISSION_INVALID';
  END IF;
  SELECT owner.owner_ref INTO v_owner_ref
  FROM core.run AS old_run
  JOIN LATERAL (
    SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id = old_run.run_id ORDER BY event.at_seq DESC LIMIT 1
  ) AS owner ON true
  WHERE old_run.run_id = p_old_run_id AND old_run.content_encryption_version = 1
    AND old_run.asker_id = 'owner:' || owner.owner_ref::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_READMISSION_INVALID';
  END IF;
  SELECT binding.user_id, binding.identity_session_id INTO v_user_id, v_session_id
  FROM identity.run_execution_binding AS binding WHERE binding.run_id = p_old_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_READMISSION_OWNER_GONE';
  END IF;
  PERFORM identity.lock_security_subjects(ARRAY[v_user_id]);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:account:' || v_user_id::text, 0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id, true);
  IF v_account.owner_ref IS DISTINCT FROM v_owner_ref THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_READMISSION_OWNER_GONE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.run_waiting_v AS line WHERE line.run_id = p_old_run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_READMISSION_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity.run_execution_binding AS earlier
    WHERE earlier.readmitted_from_run_id = p_old_run_id
      AND NOT EXISTS (
        SELECT 1 FROM core.work_item AS work WHERE work.run_id = earlier.run_id AND work.state = 'FAILED')
  ) OR EXISTS (
    SELECT 1 FROM core.run_key_provision_intent AS pending WHERE pending.readmitted_from_run_id = p_old_run_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_READMISSION_TAKEN';
  END IF;
  LOOP
    v_attempt := v_attempt + 1;
    v_execution_ref := gen_random_uuid();
    CONTINUE WHEN v_execution_ref IN (p_old_run_id, p_new_run_id, v_user_id, v_owner_ref, v_session_id, v_account.audit_token);
    BEGIN
      INSERT INTO core.publication_ref_tombstone(ref, ref_kind, created_at)
      VALUES (v_execution_ref, 'run_execution_ref', v_now);
      INSERT INTO identity.run_execution_binding(
        execution_ref, user_id, identity_session_id, run_id, created_at, readmitted_from_run_id
      ) VALUES (v_execution_ref, v_user_id, v_session_id, p_new_run_id, v_now, p_old_run_id);
      INSERT INTO core.run_key_provision_intent(
        run_id, user_id, owner_ref, identity_session_id, execution_ref, requested_at, expires_at, readmitted_from_run_id
      ) VALUES (
        p_new_run_id, v_user_id, v_owner_ref, v_session_id, v_execution_ref, v_now, v_now + interval '5 minutes', p_old_run_id
      );
      RETURN QUERY SELECT v_execution_ref, v_user_id;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 8 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_EXECUTION_REF_ALLOCATION_FAILED';
      END IF;
    END;
  END LOOP;
END;
$$;

-- The commit lock for a marked intent: 0040's core.lock_run_key_provision_for_commit without the session check, in the
-- same lock order, plus "the run it re-admits still waits". Called only by §2's core.create_encrypted_run (same owner),
-- so no role is granted it.
CREATE OR REPLACE FUNCTION core.lock_readmitted_run_key_provision_for_commit(
  p_run_id uuid, p_user_id uuid, p_owner_ref uuid, p_execution_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account record;
  v_old_run_id uuid;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:account:' || p_user_id::text, 0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id, true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.run_execution_binding AS binding
  WHERE binding.execution_ref = p_execution_ref AND binding.run_id = p_run_id AND binding.user_id = p_user_id
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT intent.readmitted_from_run_id INTO v_old_run_id
  FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id = p_run_id AND intent.user_id = p_user_id AND intent.owner_ref = p_owner_ref
    AND intent.execution_ref = p_execution_ref AND intent.cleanup_state = 'PREPARED'
    AND intent.expires_at > clock_timestamp() AND intent.readmitted_from_run_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM core.run_waiting_v AS line WHERE line.run_id = v_old_run_id AND line.owner_ref = p_owner_ref);
END;
$$;

REVOKE ALL ON FUNCTION core.prepare_readmitted_run_key_provision(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION core.prepare_readmitted_run_key_provision(uuid,uuid) TO debateai_content_provision;
REVOKE ALL ON FUNCTION core.lock_readmitted_run_key_provision_for_commit(uuid,uuid,uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;

-- THE RE-ADMISSIONS WHOSE START NEVER COMMITTED (plan C11 review, controller ruling 2026-10-22). START commits the new
-- run's row first, on its own connection, and then the edge, the hold and the first job in ONE transaction (plan C11),
-- so a process that dies between the two, or a FAILED record that never lands after a failed START, leaves a new run
-- that never runs: no edge into it, no work item. For an owner's run, prepare above would then refuse
-- RUN_READMISSION_TAKEN at every tick, and the debate would wait for ever. The API asks this reader only under the old
-- run's owner ask-admission lease, where no START of that person is in flight, so every run it lists is such an orphan,
-- which the API records FAILED (RUN_SETUP_FAILED:READMISSION, plan C11's orphan path, which frees the old run). Two
-- kinds:
--   · an owner's re-admission: a run whose execution binding names the old run (readmitted_from_run_id, above);
--   · a legacy asker's: the plain insert copies the old row's asker id, session id and question (in the clear) under
--     the current release and writes no binding, so it is a plain run of the same asker, session and question, written
--     after the old run (created_at_seq) under another release, that never took a place in line (no core.run_wait row).
-- Either way the run exists (a provision still pending has no run yet: 0040's sweep removes it with its intent), and it
-- has no edge and no work item. A STABLE definer, because no runtime may read identity.run_execution_binding; it
-- returns ids only. Owned, like this section's other definers that read the binding, by the migration's owner; callable
-- by the API's role alone (debateai_billing_runtime, as core.resolve_run_ref), never by the runner's.
CREATE OR REPLACE FUNCTION core.list_unstarted_readmissions(p_old_run_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT marked.run_id
  FROM identity.run_execution_binding AS marked
  JOIN core.run AS run ON run.run_id = marked.run_id
  WHERE marked.readmitted_from_run_id = p_old_run_id
    AND NOT EXISTS (SELECT 1 FROM core.run_supersession AS edge WHERE edge.new_run_id = marked.run_id)
    AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = marked.run_id)
  UNION
  SELECT copy.run_id
  FROM core.run AS old_run
  JOIN core.run AS copy
    ON copy.asker_id = old_run.asker_id AND copy.session_id = old_run.session_id
   AND copy.question_line = old_run.question_line AND copy.created_at_seq > old_run.created_at_seq
   AND copy.release_key <> old_run.release_key
  WHERE old_run.run_id = p_old_run_id
    AND old_run.content_encryption_version IS DISTINCT FROM 1
    AND copy.content_encryption_version IS DISTINCT FROM 1
    AND NOT EXISTS (SELECT 1 FROM core.run_wait AS wait WHERE wait.run_id = copy.run_id)
    AND NOT EXISTS (
      SELECT 1 FROM core.run_supersession AS edge WHERE edge.new_run_id = copy.run_id OR edge.old_run_id = copy.run_id)
    AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = copy.run_id)
  ORDER BY 1
$$;
REVOKE ALL ON FUNCTION core.list_unstarted_readmissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.list_unstarted_readmissions(uuid) TO debateai_billing_runtime;

-- THE RUNTIMES' REACH (addendum A-x2, controller ruling 2026-10-22). Both the API's login and the runner's hold
-- debateai_runtime: it reads core.run.release_key and calls §3's two readers (the runner's retirement reads its
-- release's state). Only the API's role, debateai_billing_runtime (a member of debateai_runtime, 0093), also writes
-- core.run_supersession and calls core.resolve_run_ref and core.list_unstarted_readmissions (granted above). The
-- runtime's table-wide SELECT on core.run (0000:301) already covers the stamp, so no column grant is added; the closing
-- block checks all of it.

-- §5. Two new wait reasons (spec §9, §13; INTERFACE "Database") -------------------------------------------------------
-- SITE_BUSY: the site runs as many debates as its runners take (plan C, SITE_CONCURRENT_DEBATES). SWITCHING: a release
-- switch is under way. Both are site-like: readers treat every reason but PERSON as the site's
-- (packages/db/src/run-wait.ts), so such a run keeps its place in line and the waker still reads it; area C decides when
-- each is written. 0083 wrote the CHECK inline, unnamed: it is found by its definition (it names waits_for and not
-- person_recheck_at, unlike run_wait_reason_names_its_recheck, which stays, so both new values carry no recheck instant)
-- and dropped, then the widened CHECK is added NOT VALID and validated as its own step (T is drained, so this widening
-- is allowed here; plan A8's N-1 rule binds only `n1: expand` files). A replay finds and drops this file's own CHECK the
-- same way, then adds it again.
DO $widen_wait_reasons$
DECLARE
  v_constraint name;
BEGIN
  FOR v_constraint IN
    SELECT check_constraint.conname FROM pg_catalog.pg_constraint AS check_constraint
    WHERE check_constraint.conrelid = 'core.run_wait_reason'::regclass AND check_constraint.contype = 'c'
      AND strpos(pg_catalog.pg_get_constraintdef(check_constraint.oid), 'waits_for') > 0
      AND strpos(pg_catalog.pg_get_constraintdef(check_constraint.oid), 'person_recheck_at') = 0
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE core.run_wait_reason DROP CONSTRAINT %I', v_constraint);
  END LOOP;
END
$widen_wait_reasons$;
ALTER TABLE core.run_wait_reason
  DROP CONSTRAINT IF EXISTS run_wait_reason_waits_for_check,
  ADD CONSTRAINT run_wait_reason_waits_for_check CHECK (waits_for IN ('SITE','PERSON','SITE_BUSY','SWITCHING')) NOT VALID;
ALTER TABLE core.run_wait_reason VALIDATE CONSTRAINT run_wait_reason_waits_for_check;

-- §6. Funding grants stay valid under the version they were issued with (spec §9, C15; INTERFACE "Database") ---------
-- Drained T, spec §9, C15: a release runs its debates on its own register version, and the funding selection
-- (staff.funding_policy_selection) may name a later or an earlier version than either, so the database may no longer
-- tie a grant to the selection's version or to the run's. 0092 and 0093 compared the grant's policy_register_version
-- with both; this section redefines the five functions that did, in place (same signatures, owner, definer, path and
-- grants), each body copied from its migration with only the named comparison removed, and a sixth,
-- staff.read_self_allowance_command, so the staff app's revoke names its grant's own version (A4 review). 0063's rule
-- ("never CREATE OR REPLACE a function another migration defines") is broken for these six only, because T is drained
-- (no debate waits or runs while it is applied, spec "The transition"), as 0120 did for its reader. What stays:
--   * staff.configure_internal_allowance is unchanged: a new grant takes the selection's version (spec §9).
--   * a revoke names the grant's own version (the command-vs-grant equality stays); the command-vs-selection one goes.
--   * funding switched off stays off: no selection row → read_internal_allowance refuses INTERNAL_FUNDING_UNAVAILABLE
--     for a grant (its `v_policy IS NULL` gate stays), the charge-scope guard refuses, and the run state is UNAVAILABLE.
-- Why no "is it still sealed" check on the grant's version: a grant's version is the selection's at issue (configure
-- compares), the selection references a sealed version, and a sealed version never changes, so validity cannot lapse.
-- read_internal_run_state still validates the funding rows, now those of the grant's own version. The new reader
-- staff.read_internal_funding_policy_at(bigint) reads the funding publication of any version with those same checks, so
-- the application checks a grant against the policy of the version it was issued with, never the pointer (plan B, B14).

-- 0093:58-129 minus the core.run.register_version = policyRegisterVersion condition (0093:83).
CREATE OR REPLACE FUNCTION billing.reserve_internal_provider_call(p_call uuid,p_run uuid,p_projected bigint,p_source text,p_phase text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_scope billing.run_charge_scope%ROWTYPE;v_grant jsonb;v_now timestamptz;v_start timestamptz;v_from timestamptz;
 v_limit bigint;v_span interval;v_to timestamptz;v_spent numeric;v_committed numeric;v_index integer;v_owner uuid;v_user uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM core.run WHERE run_id=p_run) THEN RAISE EXCEPTION 'RUN_PROVIDER_ACCOUNT_UNAVAILABLE';END IF;
 SELECT * INTO v_scope FROM billing.run_charge_scope WHERE run_id=p_run;
 v_owner:=v_scope.owner_ref;
 IF v_owner IS NULL THEN SELECT owner_ref INTO v_owner FROM core.run_ownership_event WHERE run_id=p_run ORDER BY at_seq DESC LIMIT 1;END IF;
 IF v_owner IS NOT NULL THEN
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  IF v_user IS NULL OR identity.read_account_security_hold(v_user) THEN RAISE EXCEPTION 'RUN_PROVIDER_ACCOUNT_UNAVAILABLE';END IF;
 END IF;
 IF v_scope.run_id IS NULL OR v_scope.funding_kind='SUBSCRIPTION' THEN RETURN false;END IF;
 IF p_call IS NULL OR p_call::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR p_projected IS NULL OR p_projected<1 OR p_projected>9007199254740991 OR p_source IS NULL
  OR NOT COALESCE((p_source='RUN' AND p_phase IN('BODY','SERVE')) OR (p_source='STORY' AND p_phase IS NULL),false) THEN
  RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_INVALID';END IF;
 -- Task10 reader holds the account security lock, protecting revoke/replace/hold races.
 v_grant:=billing.read_internal_allowance_for_run(p_run,clock_timestamp());
 PERFORM pg_advisory_xact_lock(hashtextextended('funding:provider:'||v_scope.internal_grant_id::text,0));
 v_now:=clock_timestamp();
 -- Side-by-side spec §9: the run's register version is no longer compared with the grant's.
 IF v_grant IS NULL OR v_now>=(v_grant->>'expiresAt')::timestamptz OR v_now<(v_grant->>'startsAt')::timestamptz THEN
  RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE';END IF;
 -- Replay never grants a second permission to send provider bytes.
 IF EXISTS(SELECT 1 FROM billing.internal_provider_admission WHERE call_id=p_call) THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_REPLAY';END IF;
 v_start:=(v_grant->>'startsAt')::timestamptz;
 FOR v_index IN 1..3 LOOP
  v_limit:=CASE v_index WHEN 1 THEN (v_grant->>'dayMicros')::bigint WHEN 2 THEN (v_grant->>'weekMicros')::bigint ELSE (v_grant->>'amountMicros')::bigint END;
  v_span:=CASE v_index WHEN 1 THEN interval '24 hours' WHEN 2 THEN interval '168 hours' ELSE NULL END;
  v_from:=CASE WHEN v_span IS NULL THEN v_start ELSE v_start+floor(extract(epoch FROM(v_now-v_start))/extract(epoch FROM v_span))*v_span END;
  v_to:=CASE WHEN v_span IS NULL THEN (v_grant->>'expiresAt')::timestamptz ELSE least(v_from+v_span,(v_grant->>'expiresAt')::timestamptz) END;
  v_spent:=billing.read_internal_grant_spent(v_scope.owner_ref,v_scope.internal_grant_id,v_scope.internal_grant_event_id,v_from,v_to,v_index=3);
  v_committed:=billing.read_internal_grant_commitments(v_scope.owner_ref,v_scope.internal_grant_id,v_scope.internal_grant_event_id,p_run);
  IF v_spent+v_committed+p_projected>v_limit THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_REACHED';END IF;
 END LOOP;
 INSERT INTO billing.internal_provider_admission(call_id,run_id,grant_id,grant_event_id,projected_micros,spend_source,spend_phase,admitted_at)
  VALUES(p_call,p_run,v_scope.internal_grant_id,v_scope.internal_grant_event_id,p_projected,p_source,p_phase,v_now);
 RETURN true;
END $$;
ALTER FUNCTION billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text) TO debateai_runtime;

-- 0093:134-174, validating the funding rows of the grant's own policy_register_version instead of the selection's
-- (0093:141-158). A selection row must still exist (funding switched off stays off), but nothing compares its version,
-- and the run-version equality (0093:161-162) is dropped. The grant is read first, since its version names the rows.
CREATE OR REPLACE FUNCTION billing.read_internal_run_state(p_run uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_scope billing.run_charge_scope%ROWTYPE;v_grant billing.internal_grant%ROWTYPE;v_policy jsonb;v_rows jsonb;v_version bigint;v_sealed boolean;v_count bigint;v_key text;v_user uuid;v_latest uuid;v_now timestamptz;
BEGIN
 SELECT * INTO v_scope FROM billing.run_charge_scope WHERE run_id=p_run;
 IF NOT FOUND OR v_scope.funding_kind<>'INTERNAL' THEN RETURN 'UNAVAILABLE';END IF;
 -- Passive MVCC reads only: the full locked validator remains exclusively on admission.
 IF NOT EXISTS(SELECT 1 FROM staff.funding_policy_selection f WHERE f.singleton) THEN RETURN 'UNAVAILABLE';END IF;
 SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=v_scope.internal_grant_id;
 IF NOT FOUND OR v_grant.configured_event_id IS DISTINCT FROM v_scope.internal_grant_event_id THEN RETURN 'UNAVAILABLE';END IF;
 SELECT v.register_version,v.sealed,v.row_count INTO v_version,v_sealed,v_count
  FROM register.register_version v WHERE v.register_version=v_grant.policy_register_version;
 IF v_version IS NULL OR v_sealed IS DISTINCT FROM true
  OR v_count IS DISTINCT FROM (SELECT count(*) FROM register.register_row WHERE register_version=v_version) THEN RETURN 'UNAVAILABLE';END IF;
 SELECT jsonb_object_agg(row_key,value_json) INTO v_rows FROM register.register_row WHERE register_version=v_version
  AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy') AND length(btrim(source_ref))>0;
 IF (SELECT count(*) FROM register.register_row WHERE register_version=v_version AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy') AND length(btrim(source_ref))>0)<>3
  OR v_rows->'productRolePolicy'->'policy_version' IS DISTINCT FROM '2'::jsonb OR v_rows->'staffAccessPolicy'->'policy_version' IS DISTINCT FROM '2'::jsonb
  OR v_rows->'productRolePolicy'->'funding_policy_version' IS DISTINCT FROM '1'::jsonb OR v_rows->'staffAccessPolicy'->'funding_policy_version' IS DISTINCT FROM '1'::jsonb THEN RETURN 'UNAVAILABLE';END IF;
 v_policy:=v_rows->'internalAllowancePolicy';
 IF core.jsonb_has_exact_keys(v_policy,ARRAY['enabled','funding_policy_version','currency','maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms','finish_allowance_bp']) IS DISTINCT FROM true
  OR v_policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR v_policy->'funding_policy_version' IS DISTINCT FROM '1'::jsonb
  OR v_policy->>'currency' IS DISTINCT FROM 'USD' OR v_policy->'finish_allowance_bp' IS DISTINCT FROM '10000'::jsonb THEN RETURN 'UNAVAILABLE';END IF;
 FOREACH v_key IN ARRAY ARRAY['maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms'] LOOP
  IF jsonb_typeof(v_policy->v_key) IS DISTINCT FROM 'number' OR (v_policy->>v_key) !~ '^[1-9][0-9]*$' OR (v_policy->>v_key)::numeric>9007199254740991 THEN RETURN 'UNAVAILABLE';END IF;
 END LOOP;
 IF (v_policy->>'maximum_lifetime_ms')::numeric>2678400000 OR (v_policy->>'maximum_day_micros')::numeric>(v_policy->>'maximum_week_micros')::numeric
  OR (v_policy->>'maximum_week_micros')::numeric>(v_policy->>'maximum_grant_micros')::numeric THEN RETURN 'UNAVAILABLE';END IF;
 SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_scope.owner_ref;
 IF v_user IS NULL THEN RETURN 'ERASED';END IF;
 IF v_grant.owner_ref IS DISTINCT FROM v_scope.owner_ref THEN RETURN 'UNAVAILABLE';END IF;
 SELECT grant_id INTO v_latest FROM billing.internal_grant WHERE owner_ref=v_scope.owner_ref ORDER BY revision DESC LIMIT 1;
 IF v_latest IS DISTINCT FROM v_grant.grant_id THEN RETURN 'REPLACED';END IF;
 IF v_grant.revoked_at IS NOT NULL THEN RETURN 'REVOKED';END IF;
 v_now:=clock_timestamp();
 IF v_now>=v_grant.expires_at THEN RETURN 'EXPIRED';END IF;
 IF v_now<v_grant.starts_at THEN RETURN 'UNAVAILABLE';END IF;
 IF identity.read_account_security_hold(v_user) THEN RETURN 'HELD';END IF;
 RETURN 'ACTIVE';
END $$;
ALTER FUNCTION billing.read_internal_run_state(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_internal_run_state(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION billing.read_internal_run_state(uuid) TO debateai_runtime;

-- 0092:548-566 minus the INTERNAL_FUNDING_POLICY_MISMATCH refusal (0092:563). The `v_policy IS NULL` gate stays.
CREATE OR REPLACE FUNCTION billing.read_internal_allowance(p_owner uuid,p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_policy jsonb; v_grant billing.internal_grant%ROWTYPE; v_user uuid;
BEGIN
  IF p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TIME_INVALID'; END IF;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=p_owner;
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  SELECT * INTO v_grant FROM billing.internal_grant WHERE owner_ref=p_owner ORDER BY revision DESC LIMIT 1 FOR SHARE;
  v_policy:=staff.read_internal_funding_policy();
  IF v_policy IS NULL THEN
    IF v_grant.grant_id IS NOT NULL THEN RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE'; END IF;
    RETURN NULL;
  END IF;
  IF v_grant.grant_id IS NULL THEN RETURN NULL; END IF;
  IF v_user IS NULL OR identity.read_account_security_hold(v_user) THEN RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE'; END IF;
  IF v_grant.revoked_at IS NOT NULL OR p_now<v_grant.starts_at OR p_now>=v_grant.expires_at THEN RETURN NULL; END IF;
  RETURN billing.internal_grant_json(v_grant);
END $$;
ALTER FUNCTION billing.read_internal_allowance(uuid,timestamptz) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_internal_allowance(uuid,timestamptz) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION billing.read_internal_allowance(uuid,timestamptz) TO debateai_runtime;

-- 0092:578-593 minus the policy_register_version-vs-selection term (0092:589). Its trigger (0092:594) is unchanged.
CREATE OR REPLACE FUNCTION billing.guard_internal_charge_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_policy jsonb; v_grant billing.internal_grant%ROWTYPE; v_user uuid;
BEGIN
  IF NEW.funding_kind='SUBSCRIPTION' THEN RETURN NEW; END IF;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=NEW.owner_ref;
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  v_policy:=staff.read_internal_funding_policy();
  SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=NEW.internal_grant_id FOR SHARE;
  IF v_policy IS NULL OR v_user IS NULL OR identity.read_account_security_hold(v_user)
    OR v_grant.owner_ref IS DISTINCT FROM NEW.owner_ref OR v_grant.configured_event_id IS DISTINCT FROM NEW.internal_grant_event_id
    OR v_grant.revoked_at IS NOT NULL
    OR NEW.admitted_at<v_grant.starts_at OR NEW.admitted_at>=v_grant.expires_at OR clock_timestamp()>=v_grant.expires_at
    OR v_grant.grant_id IS NULL THEN RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE'; END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION billing.guard_internal_charge_scope() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.guard_internal_charge_scope() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;

-- 0092:489-513 minus the command-vs-selection equality (0092:499). The command-vs-grant equality (0092:505) stays.
CREATE OR REPLACE FUNCTION staff.revoke_internal_allowance(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid; v_user uuid; v_operation uuid; v_grant billing.internal_grant%ROWTYPE; v_revision bigint; v_request jsonb; v_replay jsonb;
BEGIN
  v_owner:=(p_command->>'ownerRef')::uuid;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
  IF v_user IS DISTINCT FROM (p_context->>'userId')::uuid OR staff.authorize_action(p_context,'ALLOWANCE_WRITE') IS DISTINCT FROM true
    OR staff.read_internal_funding_policy() IS NULL THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v_owner::text,0));
  PERFORM staff.assert_internal_allowance_binding('ALLOWANCE_REVOKE',p_binding,p_command);
  v_operation:=(p_command->>'operationId')::uuid; v_request:=jsonb_build_array(p_context->>'staffId',p_binding,p_command);
  v_replay:=staff.replay_mutation(v_operation,v_request); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=(p_command->>'grantId')::uuid AND owner_ref=v_owner FOR UPDATE;
  IF NOT FOUND OR v_grant.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TARGET_INVALID'; END IF;
  IF v_grant.policy_register_version IS DISTINCT FROM (p_command->>'policyRegisterVersion')::bigint THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_MISMATCH'; END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM billing.internal_grant WHERE owner_ref=v_owner;
  IF staff.expected_revision(p_binding) IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'ALLOWANCE_WRITE','ALLOWANCE_REVOKE',v_grant.grant_id,v_operation);
  UPDATE billing.internal_grant SET revoked_at=clock_timestamp(),revision=v_revision+1 WHERE grant_id=v_grant.grant_id;
  INSERT INTO billing.internal_grant_event(event_id,grant_id,event_type,operation_id,revision)
    VALUES(gen_random_uuid(),v_grant.grant_id,'REVOKED',v_operation,v_revision+1);
  RETURN staff.record_mutation(v_operation,'ALLOWANCE_REVOKED',(p_context->>'staffId')::uuid,(p_context->>'staffId')::uuid,p_command->'reason',v_user,p_alert,v_request);
END $$;
ALTER FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;

-- 0092:381-396, the sixth redefinition (drained T, spec §9, C15; A4 review, controller ruling): the staff app builds
-- its proof binding and its revoke command from this reader's policyRegisterVersion (apps/api/src/staff/routes.ts), so
-- for a revoke (p_grant set) it now names THAT grant's policy_register_version, the one the revoke above compares;
-- without p_grant (a configure) it still names the selection's. Otherwise a grant issued before the selection moved
-- could not be revoked through the app. Everything else is 0092's body unchanged, its owner and grants re-asserted.
CREATE OR REPLACE FUNCTION staff.read_self_allowance_command(p_context jsonb,p_token text,p_grant uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid; v_revision bigint; v_policy jsonb; v_version bigint;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  SELECT owner_ref INTO v_owner FROM identity."user" WHERE user_id=(p_context->>'userId')::uuid;
  v_policy:=staff.read_internal_funding_policy();
  IF v_owner IS NULL OR v_policy IS NULL THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_UNAVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v_owner::text,0));
  IF p_grant IS NOT NULL AND NOT EXISTS(SELECT 1 FROM billing.internal_grant WHERE grant_id=p_grant AND owner_ref=v_owner) THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TARGET_INVALID';
  END IF;
  -- Side-by-side spec §9: a revoke names its grant's own version; a configure names the selection's.
  IF p_grant IS NOT NULL THEN
    SELECT policy_register_version INTO v_version FROM billing.internal_grant WHERE grant_id=p_grant AND owner_ref=v_owner;
  ELSE
    v_version:=(v_policy->>'registerVersion')::bigint;
  END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM billing.internal_grant WHERE owner_ref=v_owner;
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  RETURN jsonb_build_object('ownerRef',v_owner,'expectedRevision',v_revision,'policyRegisterVersion',v_version);
END $$;
ALTER FUNCTION staff.read_self_allowance_command(jsonb,text,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_self_allowance_command(jsonb,text,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_self_allowance_command(jsonb,text,uuid) TO debateai_runtime;

-- The funding publication AT a version (addendum from plan B; B14 consumes it as readPolicyAt): the same object
-- staff.read_internal_funding_policy() returns for the selection ({registerVersion, policy, sourceRef}), for any sealed
-- version, or NULL when that version is no enabled funding publication. It never reads the selection, so a grant is
-- checked against the policy of the version it was issued with, never the pointer. Its checks are
-- read_internal_run_state's above (sealed, complete, the three rows with a source, the two companion policies at
-- policy_version 2 and funding_policy_version 1, the allowance policy's exact shape and bounds): the version a grant
-- names passed read_internal_funding_policy()'s stricter checks when the grant was configured, and a sealed version
-- never changes. A staff-schema definer (0123 adds no billing function, so 0111's verifier stays in force), owned and
-- granted like staff.read_internal_funding_policy() (0092:660-661, 688); STABLE, since it takes no lock.
CREATE OR REPLACE FUNCTION staff.read_internal_funding_policy_at(p_version bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_sealed boolean; v_count bigint; v_rows jsonb; v_policy jsonb; v_key text;
BEGIN
  SELECT v.sealed,v.row_count INTO v_sealed,v_count FROM register.register_version v WHERE v.register_version=p_version;
  IF NOT FOUND OR v_sealed IS DISTINCT FROM true
    OR v_count IS DISTINCT FROM (SELECT count(*) FROM register.register_row WHERE register_version=p_version) THEN RETURN NULL; END IF;
  SELECT jsonb_object_agg(row_key,value_json) INTO v_rows FROM register.register_row WHERE register_version=p_version
    AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy') AND length(btrim(source_ref))>0;
  IF (SELECT count(*) FROM register.register_row WHERE register_version=p_version AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy') AND length(btrim(source_ref))>0)<>3
    OR v_rows->'productRolePolicy'->'policy_version' IS DISTINCT FROM '2'::jsonb OR v_rows->'staffAccessPolicy'->'policy_version' IS DISTINCT FROM '2'::jsonb
    OR v_rows->'productRolePolicy'->'funding_policy_version' IS DISTINCT FROM '1'::jsonb OR v_rows->'staffAccessPolicy'->'funding_policy_version' IS DISTINCT FROM '1'::jsonb THEN RETURN NULL; END IF;
  v_policy:=v_rows->'internalAllowancePolicy';
  IF core.jsonb_has_exact_keys(v_policy,ARRAY['enabled','funding_policy_version','currency','maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms','finish_allowance_bp']) IS DISTINCT FROM true
    OR v_policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR v_policy->'funding_policy_version' IS DISTINCT FROM '1'::jsonb
    OR v_policy->>'currency' IS DISTINCT FROM 'USD' OR v_policy->'finish_allowance_bp' IS DISTINCT FROM '10000'::jsonb THEN RETURN NULL; END IF;
  FOREACH v_key IN ARRAY ARRAY['maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms'] LOOP
    IF jsonb_typeof(v_policy->v_key) IS DISTINCT FROM 'number' OR (v_policy->>v_key) !~ '^[1-9][0-9]*$'
      OR (v_policy->>v_key)::numeric>9007199254740991 THEN RETURN NULL; END IF;
  END LOOP;
  IF (v_policy->>'maximum_lifetime_ms')::numeric>2678400000 OR (v_policy->>'maximum_day_micros')::numeric>(v_policy->>'maximum_week_micros')::numeric
    OR (v_policy->>'maximum_week_micros')::numeric>(v_policy->>'maximum_grant_micros')::numeric THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('registerVersion',p_version,'policy',v_policy,'sourceRef',
    (SELECT source_ref FROM register.register_row WHERE register_version=p_version AND row_key='internalAllowancePolicy'));
END $$;
ALTER FUNCTION staff.read_internal_funding_policy_at(bigint) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_internal_funding_policy_at(bigint) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_internal_funding_policy_at(bigint) TO debateai_runtime;

-- §7. The spend waiver (spec §9, C10; INTERFACE "Database") ----------------------------------------------------------
-- A budget never hard-stops a debate, and a debate set aside because of an upload uses none of the person's quota: the
-- runner's backstop (BACKSTOP), the owner's stop (OWNER_STOPPED), a settings version its release cannot run
-- (SETTINGS_VERSION_UNSUPPORTED) and a release that no longer serves it (RELEASE_NOT_SERVED) each close the debate
-- FAILED and, in the same transaction, name it here. One row per run, the first reason kept (the writer's
-- ON CONFLICT (run_id) DO NOTHING), append-only like ledger.model_spend (0066:75-86): a waiver is part of the record of
-- what a person was charged. Every person-window reader leaves a waived run's spend out (readOwnerSpentMicros'
-- subscription SQL, packages/budget/src/model-spend.ts, and billing.read_internal_grant_spent below for a funded
-- person); every site-day reader still counts it, since the money was really spent. A code and an id, never content.
-- In ledger, not billing (0123 adds no billing relation, so 0111's verifier stays in force). Writers: the runner's login
-- and the API's both hold debateai_runtime (SELECT, INSERT); debateai_staff_security_owner reads it for the funded
-- reader below (a definer it owns), debateai_replay as it reads ledger.model_spend (0066:93).
CREATE TABLE IF NOT EXISTS ledger.model_spend_waiver (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT model_spend_waiver_reason_closed CHECK (
    reason IN ('BACKSTOP', 'OWNER_STOPPED', 'SETTINGS_VERSION_UNSUPPORTED', 'RELEASE_NOT_SERVED'))
);
SELECT core.install_truncate_guard('ledger.model_spend_waiver');
DROP TRIGGER IF EXISTS reject_mutation ON ledger.model_spend_waiver;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.model_spend_waiver
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
GRANT SELECT, INSERT ON ledger.model_spend_waiver TO debateai_runtime;
GRANT SELECT ON ledger.model_spend_waiver TO debateai_staff_security_owner;
GRANT SELECT ON ledger.model_spend_waiver TO debateai_replay;

-- 0093:31-37 plus one clause: a waived run's spend no longer counts against the grant (drained T, spec §9, C10). The
-- seventh redefinition of 0063's rule, for the reason §6 gives (T is drained, as 0120 did for its reader); same
-- signature, LANGUAGE sql STABLE, owner, definer, path and grants (0093:52-56). read_internal_grant_commitments is
-- unchanged: a waived run is closed, so it has no READY or CLAIMED job and holds nothing.
CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(p_owner uuid,p_grant uuid,p_event uuid,p_from timestamptz,p_to timestamptz,p_total boolean) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
 AND s.spend_source IN('RUN','STORY') AND (p_total OR (coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to))
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id)
$$;
ALTER FUNCTION billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean) TO debateai_runtime;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0122's closing shape). Each section adds its own checks.
DO $side_by_side_releases_contract$
DECLARE
  v_function regprocedure := to_regprocedure('core.create_encrypted_run(jsonb,uuid,uuid,jsonb)');
  v_readers regprocedure[] := ARRAY[
    to_regprocedure('core.read_current_release()'), to_regprocedure('core.read_release_state(text)')];
  v_writers regprocedure[] := ARRAY[
    to_regprocedure('core.record_release_switch(text,text,timestamptz,text,bigint)'),
    to_regprocedure('core.record_release_event(text,text,text,text)')];
  v_guard regprocedure := to_regprocedure('core.guard_run_supersession()');
  v_resolve regprocedure := to_regprocedure('core.resolve_run_ref(uuid)');
  v_readmit regprocedure := to_regprocedure('core.prepare_readmitted_run_key_provision(uuid,uuid)');
  v_readmit_lock regprocedure := to_regprocedure('core.lock_readmitted_run_key_provision_for_commit(uuid,uuid,uuid,uuid)');
  v_unstarted regprocedure := to_regprocedure('core.list_unstarted_readmissions(uuid)');
  v_start_guard regprocedure := to_regprocedure('core.refuse_starting_superseded_run()');
  v_funding regprocedure[] := ARRAY[
    to_regprocedure('billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)'),
    to_regprocedure('billing.read_internal_run_state(uuid)'),
    to_regprocedure('billing.read_internal_allowance(uuid,timestamptz)'),
    to_regprocedure('billing.guard_internal_charge_scope()'),
    to_regprocedure('staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb)'),
    to_regprocedure('staff.read_internal_funding_policy_at(bigint)'),
    to_regprocedure('staff.read_self_allowance_command(jsonb,text,uuid)')];
  v_spent regprocedure := to_regprocedure('billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)');
BEGIN
  -- §1: the stamp column, its default, and its validated shape CHECK.
  IF NOT EXISTS (
      SELECT 1 FROM pg_attribute AS a JOIN pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'core.run'::regclass AND a.attname = 'release_key' AND NOT a.attisdropped AND a.attnotnull
        AND format_type(a.atttypid, a.atttypmod) = 'text' AND pg_get_expr(d.adbin, d.adrelid) = '''legacy''::text')
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'core.run'::regclass AND conname = 'run_release_key_shape' AND contype = 'c' AND convalidated
        AND strpos(pg_get_constraintdef(oid), '^r[1-9][0-9]*-[0-9a-f]{12}$') > 0) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETE';
  END IF;
  -- §2: the one encrypted writer admits and writes the stamp, as a definer with the pinned path, callable by the content
  -- provisioning role alone.
  IF v_function IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc AS p
      WHERE p.oid = v_function AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog']
        AND strpos(pg_get_functiondef(p.oid), '''releaseKey''') > 0
        AND strpos(pg_get_functiondef(p.oid), 'COALESCE(p_run->>''releaseKey'',''legacy'')') > 0)
    OR has_function_privilege('public', v_function, 'EXECUTE')
    OR has_function_privilege('debateai_runtime', v_function, 'EXECUTE')
    OR has_function_privilege('debateai_authorization_runtime', v_function, 'EXECUTE')
    OR has_function_privilege('debateai_erasure_runtime', v_function, 'EXECUTE')
    OR has_function_privilege('debateai_replay', v_function, 'EXECUTE')
    OR has_function_privilege('debateai_publication_cleanup', v_function, 'EXECUTE')
    OR NOT has_function_privilege('debateai_content_provision', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETE';
  END IF;
  -- §3: both roles NOLOGIN NOINHERIT; the table with its two guards (append-only statement trigger, truncate guard) and
  -- its index; the view; the four functions owned by debateai_release_owner as definers with the pinned path (readers
  -- STABLE, writers VOLATILE), the state reader answering still_draining (final review A4); readers callable by
  -- debateai_runtime, writers by debateai_release_operator, neither by PUBLIC nor across; and no application role on the
  -- table or the view but the owner.
  IF (SELECT count(*) FROM pg_roles
      WHERE rolname IN ('debateai_release_owner', 'debateai_release_operator') AND NOT rolcanlogin AND NOT rolinherit
        AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls) <> 2
    OR to_regclass('core.release_event') IS NULL OR to_regclass('core.release_state_v') IS NULL
    OR to_regclass('core.release_event_key_seq_idx') IS NULL
    OR (SELECT count(*) FROM pg_trigger
        WHERE tgrelid = to_regclass('core.release_event') AND NOT tgisinternal AND tgenabled IN ('O', 'A')
          AND ((tgname = 'reject_mutation' AND tgfoid = 'core.reject_mutation()'::regprocedure AND (tgtype & 1) = 0
                AND (tgtype & 26) = 26)
            OR (tgname = 'reject_truncate' AND (tgtype & 1) = 0 AND (tgtype & 34) = 34))) <> 2
    OR array_position(v_readers || v_writers, NULL) IS NOT NULL
    OR pg_get_function_result(v_readers[2])
       IS DISTINCT FROM 'TABLE(state text, front_pair_stopped boolean, retire_requested boolean, still_draining boolean)'
    OR (SELECT count(*) FROM pg_proc AS p
        WHERE p.oid = ANY(v_readers || v_writers) AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog']
          AND pg_get_userbyid(p.proowner) = 'debateai_release_owner'
          AND p.provolatile = CASE WHEN p.oid = ANY(v_readers) THEN 's' ELSE 'v' END) <> 4
    OR EXISTS (SELECT 1 FROM unnest(v_readers || v_writers) AS f(oid) WHERE has_function_privilege('public', f.oid, 'EXECUTE'))
    OR EXISTS (SELECT 1 FROM unnest(v_readers) AS f(oid)
               WHERE NOT has_function_privilege('debateai_runtime', f.oid, 'EXECUTE')
                 OR has_function_privilege('debateai_release_operator', f.oid, 'EXECUTE'))
    OR EXISTS (SELECT 1 FROM unnest(v_writers) AS f(oid)
               WHERE has_function_privilege('debateai_runtime', f.oid, 'EXECUTE')
                 OR NOT has_function_privilege('debateai_release_operator', f.oid, 'EXECUTE'))
    OR EXISTS (SELECT 1 FROM pg_roles AS r CROSS JOIN unnest(ARRAY['core.release_event', 'core.release_state_v']) AS t(name)
               WHERE r.rolname LIKE 'debateai\_%' AND NOT r.rolsuper AND r.rolname <> 'debateai_release_owner'
                 AND has_table_privilege(r.oid, t.name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    OR has_table_privilege('debateai_release_owner', 'core.release_event', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR NOT has_table_privilege('debateai_release_owner', 'core.release_event', 'SELECT')
    OR NOT has_table_privilege('debateai_release_owner', 'core.release_event', 'INSERT') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_RELEASE_TABLE_CONTRACT_INCOMPLETE';
  END IF;
  -- §4: the supersession table with its keys, its two CHECKs and its three triggers (append-only statement trigger,
  -- truncate guard, the BEFORE INSERT row guard, a pinned-path definer); its ACL exactly SELECT, INSERT for the API's
  -- role debateai_billing_runtime and SELECT for debateai_release_owner; core.resolve_run_ref owned by that role, a
  -- STABLE definer with the pinned path, callable by the API's role and not by the runtime (the runner); the edge guard
  -- reading the line itself (final review P3); the start guard on core.run_wait_start; the line excluding superseded
  -- runs, readable by the runtime; the readmitted provision callable by the content-provision role alone, its commit
  -- lock by nobody, §2's commit taking it, and the intent's marker column; the unstarted re-admissions reader a STABLE
  -- definer with the pinned path, callable by the API's role alone (C11 review); and the runtime reaching the stamp and
  -- the two release readers (addendum A-x2).
  IF to_regclass('core.run_supersession') IS NULL
    OR (SELECT count(*) FROM pg_constraint
        WHERE conrelid = to_regclass('core.run_supersession')
          AND ((contype = 'p' AND conkey = ARRAY[1]::int2[])
            OR (contype = 'u' AND conkey = ARRAY[2]::int2[])
            OR (contype = 'f' AND confrelid = 'core.run'::regclass AND conkey IN (ARRAY[1]::int2[], ARRAY[2]::int2[]))
            OR (conname = 'run_supersession_reason_closed' AND contype = 'c' AND convalidated)
            OR (conname = 'run_supersession_changes_the_run' AND contype = 'c' AND convalidated))) <> 6
    OR (SELECT count(*) FROM pg_trigger
        WHERE tgrelid = to_regclass('core.run_supersession') AND NOT tgisinternal AND tgenabled IN ('O', 'A')
          AND ((tgname = 'reject_mutation' AND tgfoid = 'core.reject_mutation()'::regprocedure AND (tgtype & 1) = 0
                AND (tgtype & 26) = 26)
            OR (tgname = 'reject_truncate' AND (tgtype & 1) = 0 AND (tgtype & 34) = 34)
            OR (tgname = 'guard_run_supersession' AND tgfoid = v_guard AND (tgtype & 1) = 1 AND (tgtype & 6) = 6))) <> 3
    OR v_guard IS NULL OR v_resolve IS NULL OR v_readmit IS NULL OR v_readmit_lock IS NULL OR v_start_guard IS NULL
    OR (SELECT count(*) FROM pg_proc AS p
        WHERE p.oid = ANY(ARRAY[v_guard, v_resolve, v_readmit, v_readmit_lock, v_start_guard]) AND p.prosecdef
          AND p.proconfig = ARRAY['search_path=pg_catalog']
          AND p.provolatile = CASE WHEN p.oid = v_resolve THEN 's' ELSE 'v' END) <> 5
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'core.run_wait_start'::regclass AND tgname = 'refuse_starting_superseded_run' AND NOT tgisinternal
        AND tgenabled IN ('O', 'A') AND tgfoid = v_start_guard AND (tgtype & 1) = 1 AND (tgtype & 6) = 6)
    OR has_function_privilege('public', v_start_guard, 'EXECUTE')
    OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = v_resolve) <> 'debateai_release_owner'
    OR ARRAY(SELECT pg_get_userbyid(a.grantee) || ':' || a.privilege_type
             FROM pg_class AS c, aclexplode(c.relacl) AS a
             WHERE c.oid = to_regclass('core.run_supersession') AND a.grantee <> c.relowner ORDER BY 1)
       IS DISTINCT FROM ARRAY['debateai_billing_runtime:INSERT', 'debateai_billing_runtime:SELECT',
         'debateai_release_owner:SELECT']
    OR has_table_privilege('debateai_runtime', 'core.run_supersession', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_function_privilege('public', v_resolve, 'EXECUTE')
    OR has_function_privilege('debateai_runtime', v_resolve, 'EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime', v_resolve, 'EXECUTE')
    OR has_function_privilege('public', v_guard, 'EXECUTE')
    OR strpos(pg_get_functiondef(v_guard), 'NOT EXISTS (SELECT 1 FROM core.run_waiting_v AS line WHERE line.run_id = NEW.old_run_id)') = 0
    OR strpos(pg_get_viewdef('core.run_waiting_v'::regclass), 'run_supersession') = 0
    OR NOT has_table_privilege('debateai_runtime', 'core.run_waiting_v', 'SELECT')
    OR NOT has_function_privilege('debateai_content_provision', v_readmit, 'EXECUTE')
    OR ARRAY(SELECT coalesce(pg_get_userbyid(nullif(a.grantee, 0)), 'PUBLIC') || ':' || a.privilege_type
             FROM pg_proc AS p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a
             WHERE p.oid = v_readmit AND a.grantee <> p.proowner ORDER BY 1)
       IS DISTINCT FROM ARRAY['debateai_content_provision:EXECUTE']
    OR ARRAY(SELECT coalesce(pg_get_userbyid(nullif(a.grantee, 0)), 'PUBLIC') || ':' || a.privilege_type
             FROM pg_proc AS p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a
             WHERE p.oid = v_readmit_lock AND a.grantee <> p.proowner ORDER BY 1) <> ARRAY[]::text[]
    OR v_unstarted IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc AS p
      WHERE p.oid = v_unstarted AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog']
        AND p.provolatile = 's')
    OR ARRAY(SELECT coalesce(pg_get_userbyid(nullif(a.grantee, 0)), 'PUBLIC') || ':' || a.privilege_type
             FROM pg_proc AS p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a
             WHERE p.oid = v_unstarted AND a.grantee <> p.proowner ORDER BY 1)
       IS DISTINCT FROM ARRAY['debateai_billing_runtime:EXECUTE']
    OR has_function_privilege('debateai_runtime', v_unstarted, 'EXECUTE')
    OR to_regclass('core.run_key_provision_intent_one_readmission_idx') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'identity.run_execution_binding'::regclass AND attname = 'readmitted_from_run_id'
        AND NOT attisdropped AND NOT attnotnull AND format_type(atttypid, atttypmod) = 'uuid')
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['public', 'debateai_runtime', 'debateai_authorization_runtime',
                 'debateai_erasure_runtime', 'debateai_replay', 'debateai_publication_cleanup']) AS r(name)
               WHERE has_function_privilege(r.name, v_readmit, 'EXECUTE')
                 OR has_function_privilege(r.name, v_readmit_lock, 'EXECUTE'))
    OR has_function_privilege('debateai_content_provision', v_readmit_lock, 'EXECUTE')
    OR strpos(pg_get_functiondef(v_function), 'core.lock_readmitted_run_key_provision_for_commit(') = 0
    OR NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'core.run_key_provision_intent'::regclass AND attname = 'readmitted_from_run_id'
        AND NOT attisdropped AND NOT attnotnull AND format_type(atttypid, atttypmod) = 'uuid')
    OR NOT has_column_privilege('debateai_runtime', 'core.run', 'release_key', 'SELECT')
    OR EXISTS (SELECT 1 FROM unnest(v_readers) AS f(oid) WHERE NOT has_function_privilege('debateai_runtime', f.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_READMISSION_CONTRACT_INCOMPLETE';
  END IF;
  -- §5: exactly two CHECKs on core.run_wait_reason, both validated: the widened reason list and 0083's recheck rule.
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'core.run_wait_reason'::regclass AND contype = 'c') <> 2
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'core.run_wait_reason'::regclass AND conname = 'run_wait_reason_waits_for_check' AND contype = 'c'
        AND convalidated AND strpos(pg_get_constraintdef(oid), 'SITE_BUSY') > 0
        AND strpos(pg_get_constraintdef(oid), 'SWITCHING') > 0 AND strpos(pg_get_constraintdef(oid), 'PERSON') > 0)
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'core.run_wait_reason'::regclass AND conname = 'run_wait_reason_names_its_recheck' AND contype = 'c'
        AND convalidated) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_WAIT_REASON_CONTRACT_INCOMPLETE';
  END IF;
  -- §6: the seven functions owned by debateai_staff_security_owner as definers with the pinned path; none callable by
  -- PUBLIC or the recovery role; all but the charge-scope guard callable by the runtime; no definition comparing a grant
  -- with the selection's or the run's version any more; configure still taking the selection's version; the self
  -- command naming a revoke's grant's version; the guard still on run_charge_scope; and the funding reader at a version
  -- never reading the selection.
  IF array_position(v_funding, NULL) IS NOT NULL
    OR (SELECT count(*) FROM pg_proc AS p
        WHERE p.oid = ANY(v_funding) AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog']
          AND pg_get_userbyid(p.proowner) = 'debateai_staff_security_owner') <> 7
    OR EXISTS (SELECT 1 FROM unnest(v_funding) AS f(oid)
               WHERE has_function_privilege('public', f.oid, 'EXECUTE')
                 OR has_function_privilege('debateai_staff_recovery', f.oid, 'EXECUTE')
                 OR has_function_privilege('debateai_runtime', f.oid, 'EXECUTE')
                    IS DISTINCT FROM (f.oid <> 'billing.guard_internal_charge_scope()'::regprocedure))
    OR strpos(pg_get_functiondef(v_funding[1]), 'register_version=(v_grant->>''policyRegisterVersion'')') > 0
    OR strpos(pg_get_functiondef(v_funding[2]), 'register_version=v_grant.policy_register_version') = 0
    OR strpos(pg_get_functiondef(v_funding[2]), 'f.register_version') > 0
    OR strpos(pg_get_functiondef(v_funding[2]), 'FROM core.run') > 0
    OR strpos(pg_get_functiondef(v_funding[3]), 'INTERNAL_FUNDING_POLICY_MISMATCH') > 0
    OR strpos(pg_get_functiondef(v_funding[4]), 'policy_register_version') > 0
    OR strpos(pg_get_functiondef(v_funding[5]), '(staff.read_internal_funding_policy())->''registerVersion''') > 0
    OR strpos(pg_get_functiondef(v_funding[5]),
         'v_grant.policy_register_version IS DISTINCT FROM (p_command->>''policyRegisterVersion'')::bigint') = 0
    OR strpos(pg_get_functiondef(v_funding[6]), 'funding_policy_selection') > 0
    OR strpos(pg_get_functiondef(v_funding[7]),
         'SELECT policy_register_version INTO v_version FROM billing.internal_grant WHERE grant_id=p_grant') = 0
    OR strpos(pg_get_functiondef(v_funding[7]), '''policyRegisterVersion'',v_version)') = 0
    OR strpos(pg_get_functiondef('staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb)'::regprocedure),
         'p_command->''policyRegisterVersion'' IS DISTINCT FROM v_policy->''registerVersion''') = 0
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'billing.run_charge_scope'::regclass AND tgname = 'internal_charge_scope_guard' AND NOT tgisinternal
        AND tgenabled IN ('O', 'A') AND tgfoid = v_funding[4]) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_FUNDING_CONTRACT_INCOMPLETE';
  END IF;
  -- §7: the waiver table with its key, its reference to core.run and its validated closed CHECK; its two guards
  -- (append-only statement trigger, truncate guard); its ACL exactly SELECT, INSERT for debateai_runtime and SELECT for
  -- debateai_staff_security_owner and debateai_replay; and the funded spend reader redefined as 0093 left it (owner,
  -- STABLE definer, pinned path, EXECUTE for the runtime alone) and excluding waived runs, the commitments reader not.
  IF to_regclass('ledger.model_spend_waiver') IS NULL
    OR (SELECT count(*) FROM pg_constraint
        WHERE conrelid = to_regclass('ledger.model_spend_waiver')
          AND ((contype = 'p' AND conkey = ARRAY[1]::int2[])
            OR (contype = 'f' AND confrelid = 'core.run'::regclass AND conkey = ARRAY[1]::int2[])
            OR (conname = 'model_spend_waiver_reason_closed' AND contype = 'c' AND convalidated
                AND strpos(pg_get_constraintdef(oid), 'RELEASE_NOT_SERVED') > 0))) <> 3
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid = to_regclass('ledger.model_spend_waiver') AND contype <> 'n') <> 3
    OR (SELECT count(*) FROM pg_trigger
        WHERE tgrelid = to_regclass('ledger.model_spend_waiver') AND NOT tgisinternal AND tgenabled IN ('O', 'A')
          AND ((tgname = 'reject_mutation' AND tgfoid = 'core.reject_mutation()'::regprocedure AND (tgtype & 1) = 0
                AND (tgtype & 26) = 26)
            OR (tgname = 'reject_truncate' AND (tgtype & 1) = 0 AND (tgtype & 34) = 34))) <> 2
    OR ARRAY(SELECT pg_get_userbyid(a.grantee) || ':' || a.privilege_type
             FROM pg_class AS c, aclexplode(c.relacl) AS a
             WHERE c.oid = to_regclass('ledger.model_spend_waiver') AND a.grantee <> c.relowner ORDER BY 1)
       IS DISTINCT FROM ARRAY['debateai_replay:SELECT', 'debateai_runtime:INSERT', 'debateai_runtime:SELECT',
         'debateai_staff_security_owner:SELECT']
    OR v_spent IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc AS p
      WHERE p.oid = v_spent AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog'] AND p.provolatile = 's'
        AND pg_get_userbyid(p.proowner) = 'debateai_staff_security_owner'
        AND strpos(pg_get_functiondef(p.oid), 'NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id)') > 0)
    OR has_function_privilege('public', v_spent, 'EXECUTE')
    OR has_function_privilege('debateai_staff_recovery', v_spent, 'EXECUTE')
    OR NOT has_function_privilege('debateai_runtime', v_spent, 'EXECUTE')
    OR strpos(pg_get_functiondef('billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)'::regprocedure),
         'model_spend_waiver') > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_SPEND_WAIVER_CONTRACT_INCOMPLETE';
  END IF;
END
$side_by_side_releases_contract$;
