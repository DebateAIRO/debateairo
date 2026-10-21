-- 0123 · Side-by-side releases (spec docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md §1, §4, §5,
-- §9; plan docs/superpowers/plans/2026-10-21-side-by-side-A-database.md, tasks A1-A5; INTERFACE "Database").
--
-- The transition release T's one migration: everything the database needs so a later upload can run next to the
-- release before it. Built section by section, each section numbered and each object it adds checked by the closing
-- contract block (and digested by the loader, packages/db/src/migration-forward0123.ts):
--   §1  core.run.release_key, the stamp of the release that runs each debate (A1);
--   §2  core.create_encrypted_run redefined in place so the encrypted insert path writes that stamp (A1);
--   §3  core.release_event, its view core.release_state_v, its two readers and its two writers serialized on one
--       advisory lock, owned by the new NOLOGIN role debateai_release_owner (A2).
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
-- each role created only when absent, CREATE OR REPLACE FUNCTION / VIEW. Nothing historical is rewritten.

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
-- 0072's body byte for byte, with two changes: 'releaseKey' joins the closed key list, and the INSERT writes
-- release_key = COALESCE(p_run->>'releaseKey','legacy'). A malformed key fails §1's CHECK inside the function, whose
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
    OR NOT core.lock_run_key_provision_for_commit(
      v_run_id,p_user_id,p_owner_ref,v_execution_ref
    ) THEN
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
-- malformed key, recorder or reason, any kind outside these four, and a disallowed transition:
--   STAGED              no state yet, or DRAINING or RETIRED (addendum item 2: a rollback stages an older release
--                       again);
--   FRONT_PAIR_STOPPED  a known release that is not the current one;
--   RETIRE_REQUESTED    DRAINING only;
--   RETIRED             STAGED (addendum item 3: never switched to, 'NOT_SWITCHED') or DRAINING ('DRAINED'); never a
--                       STAGED release that still drains (a DRAINING event with no later RETIRED event: staged again
--                       for a rollback that never switched, its drained debates may still run). Such a release retires
--                       only through the drain path: switched to, then drained again, then retired.
-- CURRENT and DRAINING are written by the switch alone.
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
    OR p_kind IS NULL OR p_kind NOT IN ('STAGED', 'FRONT_PAIR_STOPPED', 'RETIRE_REQUESTED', 'RETIRED')
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

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0122's closing shape). Each section adds its own checks.
DO $side_by_side_releases_contract$
DECLARE
  v_function regprocedure := to_regprocedure('core.create_encrypted_run(jsonb,uuid,uuid,jsonb)');
  v_readers regprocedure[] := ARRAY[
    to_regprocedure('core.read_current_release()'), to_regprocedure('core.read_release_state(text)')];
  v_writers regprocedure[] := ARRAY[
    to_regprocedure('core.record_release_switch(text,text,timestamptz,text,bigint)'),
    to_regprocedure('core.record_release_event(text,text,text,text)')];
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
END
$side_by_side_releases_contract$;
