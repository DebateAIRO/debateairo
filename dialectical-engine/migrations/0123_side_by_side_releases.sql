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
--       so a superseded run no longer waits, the readmitted run's key provision, and the API runtime's reads (A3);
--   §5  core.run_wait_reason.waits_for widened with SITE_BUSY and SWITCHING (A3).
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
-- release_key = COALESCE(p_run->>'releaseKey','legacy'), and the commit lock also takes a readmitted run's provision
-- (§4, A3: core.lock_readmitted_run_key_provision_for_commit, which needs no live session, only for an intent §4's
-- core.prepare_readmitted_run_key_provision marked). A malformed key fails §1's CHECK inside the function, whose
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
    OR NOT (core.lock_run_key_provision_for_commit(
      v_run_id,p_user_id,p_owner_ref,v_execution_ref
    ) OR core.lock_readmitted_run_key_provision_for_commit(
      v_run_id,p_user_id,p_owner_ref,v_execution_ref
    )) THEN
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

CREATE OR REPLACE FUNCTION core.read_release_state(p_release_key text)
RETURNS TABLE(state text, front_pair_stopped boolean, retire_requested boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT release.state, release.front_pair_stopped, release.retire_requested
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
-- A debate that waits while a new release takes the traffic is re-admitted under the current release as a NEW run
-- (plan C, START): the old row is never touched (core.run is never updated), so its re-admission is a record.
-- core.run_supersession is that record, append-only: old_run_id → new_run_id, reason READMITTED. Its guard refuses an
-- edge unless the old run still waits (a core.run_wait row and no core.run_wait_start row: a started debate is never
-- re-admitted, ruling O1, plan A review focus 4) and the new run has no edge of its own, so a cycle cannot form (an edge
-- X → Y needs Y without an outgoing edge). The guard takes ONE advisory lock, so two edges written at once are checked
-- one after the other, and it locks the old run's wait row FOR UPDATE, which waits for a transaction starting that run
-- (its run_wait_start insert holds KEY SHARE on the row) and then reads its start. The primary key refuses a second edge
-- out of a run (23505), UNIQUE new_run_id a second edge into one. The API writes the edge inside START, as
-- debateai_billing_runtime: the API's own capability role (0093; the API's login holds it, the runner's does not), so
-- the runner can neither record nor resolve a supersession (least privilege, controller ruling 2026-10-22 on A-x2).
-- The other direction is guarded too: once a run is superseded, starting it is refused RUN_SUPERSEDED (below).
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
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:run-supersession', 0));
  PERFORM 1 FROM core.run_wait AS wait WHERE wait.run_id = NEW.old_run_id FOR UPDATE;
  IF NOT FOUND
    OR EXISTS (SELECT 1 FROM core.run_wait_start AS started WHERE started.run_id = NEW.old_run_id)
    OR EXISTS (SELECT 1 FROM core.run_supersession AS onward WHERE onward.old_run_id = NEW.new_run_id) THEN
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
-- order is the guard's (it waits for this start's KEY SHARE, then reads the start). A definer, because the row lock and
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
-- intent never commits without a live session. The column lives and dies with its intent row (consumed at commit, or
-- cleaned by 0040's sweep like any other), so it adds nothing an erasure has to find.
ALTER TABLE core.run_key_provision_intent ADD COLUMN IF NOT EXISTS readmitted_from_run_id uuid NULL;
COMMENT ON COLUMN core.run_key_provision_intent.readmitted_from_run_id IS
  'Side-by-side spec §4 (0123 §4): set only by core.prepare_readmitted_run_key_provision, the waiting run this provision re-admits; the commit then needs no live session. NULL for every ordinary provision.';

-- RUN_READMISSION_INVALID (55000): the old run is not an owner's encrypted run, does not wait any more (started, FAILED,
-- content erased, already superseded: core.run_waiting_v above), or the new run id is taken or equal to it.
-- RUN_READMISSION_OWNER_GONE (55000): the old run's binding is gone with its account, or the account is no longer
-- active (suspended, held, age-frozen, erased) or no longer maps to the run's owner. Locks in today's order: the
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
  LOOP
    v_attempt := v_attempt + 1;
    v_execution_ref := gen_random_uuid();
    CONTINUE WHEN v_execution_ref IN (p_old_run_id, p_new_run_id, v_user_id, v_owner_ref, v_session_id, v_account.audit_token);
    BEGIN
      INSERT INTO core.publication_ref_tombstone(ref, ref_kind, created_at)
      VALUES (v_execution_ref, 'run_execution_ref', v_now);
      INSERT INTO identity.run_execution_binding(execution_ref, user_id, identity_session_id, run_id, created_at)
      VALUES (v_execution_ref, v_user_id, v_session_id, p_new_run_id, v_now);
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

-- THE RUNTIMES' REACH (addendum A-x2, controller ruling 2026-10-22). Both the API's login and the runner's hold
-- debateai_runtime: it reads core.run.release_key and calls §3's two readers (the runner's retirement reads its
-- release's state). Only the API's role, debateai_billing_runtime (a member of debateai_runtime, 0093), also writes
-- core.run_supersession and calls core.resolve_run_ref (granted above). The runtime's table-wide SELECT on core.run
-- (0000:301) already covers the stamp, so no column grant is added; the closing block checks all of it.

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
  v_start_guard regprocedure := to_regprocedure('core.refuse_starting_superseded_run()');
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
  -- STABLE, writers VOLATILE); readers callable by debateai_runtime, writers by debateai_release_operator, neither by
  -- PUBLIC nor across; and no application role on the table or the view but the owner.
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
  -- STABLE definer with the pinned path, callable by the API's role and not by the runtime (the runner); the start guard
  -- on core.run_wait_start; the line excluding superseded runs, readable by the runtime; the readmitted provision
  -- callable by the content-provision role alone, its commit lock by nobody, §2's commit taking it, and the intent's
  -- marker column; and the runtime reaching the stamp and the two release readers (addendum A-x2).
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
    OR strpos(pg_get_viewdef('core.run_waiting_v'::regclass), 'run_supersession') = 0
    OR NOT has_table_privilege('debateai_runtime', 'core.run_waiting_v', 'SELECT')
    OR NOT has_function_privilege('debateai_content_provision', v_readmit, 'EXECUTE')
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
END
$side_by_side_releases_contract$;
