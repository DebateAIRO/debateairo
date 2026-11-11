-- 0175 · The statement to a debate's author says an AI read the report first only when the check gave a verdict (Q3 of the final review of 0172,
-- 11 November 2026).
--
-- Plain words. 0157's identity.moderation_statement_ground, as 0172 restated it, set automated_detection whenever the report the step relied on had
-- a judge model recorded (judge_model_id IS NOT NULL). 0151's settle records the model it tried even when the call failed (verdict UNAVAILABLE), so
-- the statement to the debate's author said "An AI read the report first. A person made this decision." when no AI had read it. Now it says so
-- only when 0151's check gave a verdict (AGREE, NOT_FOUND or UNSURE) at or before the statement's moment, the rule 0172's M1 already gives the
-- reporter's answer (identity.read_public_flag_mail): a person who decided while the check still read the report, or after it failed, decided
-- alone. 0151's automatic hide still says both (automated_decision). Everything else in the ground is 0172's body. The function keeps its
-- signature, owner, grants (its owner's alone) and settings; CREATE OR REPLACE keeps them. 0175 never edits an earlier file: the function is
-- restated here once and declared in the manifest's amendsPostconditionsOf (0157's postcondition digests it). Once applied, this file is fixed.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it restates 0157's identity.moderation_statement_ground in place (CREATE OR REPLACE of an earlier function), which 0157's
--                   postcondition digests (amendsPostconditionsOf), so the release that carries it must be a drained upload. Its signature and
--                   result are 0157's, so the release before's sender and page still read it beside it.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. What a statement says --------------------------------------------------------------------------------------------------------------
-- 0172's body, with the one line that decides automated_detection changed.
CREATE OR REPLACE FUNCTION identity.moderation_statement_ground(p_statement_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s identity.moderation_statement%ROWTYPE; d identity.moderation_decision%ROWTYPE; v_grounds text[] := '{}'; v_suspected text[] := '{}'; v_sources text[] := '{}';
  v_flag uuid; v_detected boolean := false; v_decided boolean := false; v_interim boolean := false; v_recorded boolean := false; v_event record; v_laws text[] := '{}';
BEGIN
  SELECT * INTO s FROM identity.moderation_statement AS statement WHERE statement.statement_id = p_statement_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s.decision_id IS NOT NULL THEN
    SELECT * INTO d FROM identity.moderation_decision AS decision WHERE decision.decision_id = s.decision_id;
    v_grounds := d.grounds; v_sources := ARRAY[d.source]; v_flag := d.flag_id; v_recorded := true; v_laws := ARRAY[d.law_ref];
  ELSE
    FOR v_event IN SELECT event.event_id, event.action, event.actor_staff_id, event.operation_id, ground.grounds, ground.suspected, ground.source, ground.flag_id, ground.interim, ground.law_ref
      FROM identity.public_review_event AS event LEFT JOIN identity.moderation_ground AS ground ON ground.event_id = event.event_id
      WHERE event.event_id = ANY (s.ground_events) LOOP
      IF v_event.action = 'HIDE' AND v_event.actor_staff_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        -- 0151's automatic hide: the report it settled is its source, an AI found it and the hide itself was automated, pending a person.
        SELECT flag.flag_id, CASE flag.reason WHEN 'CONTENT' THEN ARRAY['UNLAWFUL','HATE_SPEECH'] WHEN 'PERSONAL' THEN ARRAY['PERSONAL_DATA'] ELSE '{}'::text[] END
          INTO v_flag, v_suspected FROM identity.public_flag AS flag WHERE flag.flag_id = v_event.operation_id;
        v_grounds := v_grounds || ARRAY['REVIEW_HOLD']; v_sources := v_sources || ARRAY['REPORT_BUTTON']; v_decided := true; v_interim := true; v_recorded := true;
      ELSIF v_event.grounds IS NOT NULL THEN
        v_grounds := v_grounds || v_event.grounds; v_suspected := v_suspected || v_event.suspected; v_sources := v_sources || ARRAY[v_event.source];
        v_flag := COALESCE(v_flag, v_event.flag_id); v_interim := v_interim OR v_event.interim; v_recorded := true; v_laws := v_laws || v_event.law_ref;
      END IF;
    END LOOP;
  END IF;
  -- An AI read the report that led here (0151's check) only when the check gave a verdict (AGREE, NOT_FOUND or UNSURE) by the statement's moment, as
  -- 0172's M1 reader says for the reporter: UNAVAILABLE (the call failed, or the five-minute sweep settled it) or a later verdict means a person read it alone.
  v_detected := v_decided OR EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.flag_id = v_flag AND flag.verdict IN ('AGREE','NOT_FOUND','UNSURE') AND flag.judged_at <= s.happened_at);
  RETURN jsonb_build_object('recorded', v_recorded, 'interim', v_interim,
    'grounds', COALESCE((SELECT jsonb_agg(DISTINCT code ORDER BY code) FROM unnest(v_grounds) AS code), '[]'::jsonb),
    'suspected', COALESCE((SELECT jsonb_agg(DISTINCT code ORDER BY code) FROM unnest(v_suspected) AS code), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(DISTINCT code ORDER BY code) FROM unnest(v_sources) AS code), '[]'::jsonb),
    'automated_detection', v_detected, 'automated_decision', v_decided,
    'law', (SELECT string_agg(DISTINCT law, '; ' ORDER BY law) FROM unnest(v_laws) AS law));
END $$;

-- The contract: the ground is this file's body, still its owner's definer with 0157's settings and result, no other role's to call.
DO $statement_ai_read_verdict_contract$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS p
        WHERE p.oid = 'identity.moderation_statement_ground(uuid)'::regprocedure
          AND p.prosecdef AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=pg_catalog'] AND p.prorettype = 'jsonb'::regtype
          AND pg_catalog.strpos(p.prosrc, 'flag.verdict IN (''AGREE'',''NOT_FOUND'',''UNSURE'') AND flag.judged_at <= s.happened_at') > 0
          AND pg_catalog.strpos(p.prosrc, 'judge_model_id') = 0) <> 1
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
      WHERE p.oid = 'identity.moderation_statement_ground(uuid)'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner) THEN
    RAISE EXCEPTION 'STATEMENT_AI_READ_VERDICT_0175_CONTRACT ground';
  END IF;
END
$statement_ai_read_verdict_contract$;
