-- 0190 · A debate the end-of-debate check deletes comes off the public page too, and the Free debates' sweep reads past the
-- debates that wait (migrations/lineage/README.md "The check deletes a public debate, and the Free sweep reads past waiting
-- debates (0190)").
--
-- Plain words, the first part. When a debate finishes, an AI check reads its conclusion (0126). One verdict deletes the
-- debate, with no person involved, and the Terms say it is deleted even if it was already published. 0126's
-- core.prepare_synthesis_check_erasures only waited while the debate was public, so the page stayed readable and the keys
-- were kept. core.take_down_check_deleted_debates takes such a page down with the same rows the owner's own unpublish writes
-- (0039 and 0085): a key cleanup intent for the publication, a PRIVATE visibility event through 0040's one-shot binding,
-- and the "debate.publication.unpublished" audit event. The API's publication key cleanup then destroys the publication's
-- key, which every row of the page is sealed under, and 0126's prepare, unchanged, erases the debate as any private one.
-- The takedown is a function of its own on the API's system login, not a new prepare on the erasure login: the API attests
-- at start that its erasure login can run exactly the functions it knows, so one more there would stop the release before.
--   - Only a final deletion verdict does this. 0126 writes a deletion request only for a final result that asks for it: a
--     flag that needs a staff approval, an unavailable answer and an answer that came too late (the API stores it as
--     unavailable) never write one. And the verdict must be about what the page shows: a verdict for an older answer version
--     whose conclusion differs from the version that was newest when the debate went public leaves the page as it is (the
--     outcome is NOT_SHOWN, and the API logs that it waits). A verdict for that version, or a newer one, takes it down.
--   - A publish racing the verdict. The publish holds the debate's row while it writes its event, and so does this step, so
--     one goes first. A publish still in flight (its key's intent recorded) makes this step wait (CONTENDED); a publish that
--     went through after the verdict is taken down on the next pass.
--   - What other people put on the page goes with it, as when a debate is hidden: a dig whose check has not settled is
--     settled UNAVAILABLE (its person sees it kept private, and the dig goes on as theirs), the climb of an allowed dig
--     ends, and a report being written ends FAILED with PUBLIC_PAGE_DELETED. Their texts on the page (its updates, its
--     report copies and any correction) are sealed under the publication's key and die with it. The copies of the page sealed
--     for digs and reports (0147's identity.public_material, under each digger's or writer's own key) are deleted, as 0151's
--     purge deletes them when an original goes. Each digger's own dig and each writer's own report stay theirs.
--   - No statement of reasons is queued for them: 0157's statements come from a review log row or a decision, and this
--     deletion is neither. The owner gets 0126's removal notice, as for a private debate.
--
-- Plain words, the second part. A finished Free debate goes public after two checks (0137, 0189). The sweep read the
-- oldest waiting debates, at most 100, with no way to read past them. A debate the end-of-debate check flagged waits for a
-- staff approval, and a deleted one whose erasure cannot finish keeps its row too, so 100 of them at the head stopped every
-- newer one. identity.read_free_debates_to_publish_after reads the same list from a place: the waiting debates after a given
-- (notice time, run id), in that order, so the API's sweep walks the whole list across its passes and starts again at the
-- top after the last. A list that leaves out what cannot move now cannot be made here: whether the check flagged a debate is
-- sealed under the debate's own key, and whether a check is in its own wait is known only to the API.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: three new functions, which the release before never calls; no table, no column, no
--                   earlier function and no grant of an earlier object changes, and the erasure login gains nothing (the
--                   release before counts what it may call). The release before keeps calling 0126's prepare (which still
--                   waits while a debate is public) and 0137's list, both unchanged, so the step can stay if the site goes
--                   back to it: a debate this step took down is private, and 0126's prepare erases it.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: no request role may call these functions or read the tables they touch.
--
-- Replay-safe in the repository's form: CREATE OR REPLACE of names no earlier migration defines.

-- 1. What was running on a page the check deleted -----------------------------------------------------------------------------
-- The same rules as 0150's hide for what is running, under the caller's lock of the public tree, and then the copies of the
-- page sealed for digs and reports go, as 0151's purge deletes them. Returns how many rows changed.
CREATE OR REPLACE FUNCTION identity.close_public_page_of_deleted_debate(p_publication_ref uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_dig uuid;
  v_rows integer := 0;
  v_step integer;
BEGIN
  IF p_publication_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_PAGE_DELETED_INVALID';
  END IF;
  -- A dig whose check has not settled: kept private, its run goes on as its person's own.
  FOR v_dig IN SELECT contribution.dig_run_id FROM identity.public_contribution AS contribution
    WHERE contribution.publication_ref = p_publication_ref AND contribution.outcome IS NULL ORDER BY contribution.dig_run_id LOOP
    IF identity.settle_public_contribution(v_dig, 'UNAVAILABLE', NULL) = 'RECORDED' THEN v_rows := v_rows + 1; END IF;
  END LOOP;
  -- An allowed dig whose climb has not ended: it ends, as nothing of it can reach the page any more.
  INSERT INTO identity.public_climb_done (dig_run_id, owner_ref)
  SELECT contribution.dig_run_id, contribution.owner_ref FROM identity.public_contribution AS contribution
  WHERE contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED'
    AND NOT EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = contribution.dig_run_id)
    AND EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = contribution.owner_ref);
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  -- A report being written: the page it was for is gone. What it spent stays spent.
  UPDATE identity.public_report AS report SET outcome = 'FAILED', failure_code = 'PUBLIC_PAGE_DELETED', recorded_at = clock_timestamp()
  WHERE report.publication_ref = p_publication_ref AND report.outcome IS NULL;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  -- The copies of the page sealed for digs and reports held the deleted text. 0171's forget scope lets the guard pass them.
  PERFORM identity.open_forget_scope('public_tree');
  DELETE FROM identity.public_material AS material WHERE material.publication_ref = p_publication_ref;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM identity.close_forget_scope('public_tree');
  RETURN v_rows;
END
$$;

-- 2. The check's deletion of a public debate: its page comes down first ------------------------------------------------------
-- Each deletion request whose debate is public now, oldest first, at most p_limit (0..100). TAKEN_DOWN: 0085's unpublish rows are
-- written, and 0126's prepare erases the debate once the API's key cleanup has destroyed the publication's key. NOT_SHOWN: the
-- verdict is for an older answer version with another conclusion than the page shows, so the page stays and the request waits.
-- NO_SESSION: the account keeps no session row to bind the event to (session rows go only with their account). CONTENDED: the
-- debate, its tree or a publish in flight is busy; the next pass tries again. A request 0126's prepare would not erase (another
-- owner now, an account not active, an erasure under way, a debate stored in clear) is left to it.
CREATE OR REPLACE FUNCTION core.take_down_check_deleted_debates(p_limit integer)
RETURNS TABLE(outcome text,run_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_request record;
  v_now timestamptz;
  v_content_encryption_version integer;
  v_first_owner uuid;
  v_latest_owner uuid;
  v_user_id uuid;
  v_latest_visibility text;
  v_latest_publication_ref uuid;
  v_latest_at_seq bigint;
  v_judged_answer_id uuid;
  v_judged_version integer;
  v_shown_version integer;
  v_session_id uuid;
  v_reservation_id uuid;
  v_event_id uuid;
  v_event_actor_ref uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_denied_audit_id uuid;
  v_denied_audit_actor_ref uuid;
  v_denied_audit_target_ref uuid;
BEGIN
  FOR v_request IN
    SELECT removal.request_id,removal.run_id,removal.result_id
    FROM serve.synthesis_check_removal_request AS removal
    WHERE (SELECT event.state FROM core.run_visibility_event AS event
      WHERE event.run_id=removal.run_id ORDER BY event.at_seq DESC LIMIT 1)='PUBLISHED'
    ORDER BY removal.requested_at,removal.request_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit,0),0),100)
    FOR UPDATE OF removal SKIP LOCKED
  LOOP
    v_now := clock_timestamp();
    BEGIN
      -- The publish holds this row while it writes its event: one of the two goes first.
      SELECT run.content_encryption_version INTO v_content_encryption_version
      FROM core.run AS run WHERE run.run_id=v_request.run_id FOR UPDATE NOWAIT;
      CONTINUE WHEN NOT FOUND OR v_content_encryption_version IS DISTINCT FROM 1;
      SELECT event.owner_ref INTO v_first_owner FROM core.run_ownership_event AS event
      WHERE event.run_id=v_request.run_id ORDER BY event.at_seq ASC LIMIT 1;
      SELECT event.owner_ref INTO v_latest_owner FROM core.run_ownership_event AS event
      WHERE event.run_id=v_request.run_id ORDER BY event.at_seq DESC LIMIT 1;
      CONTINUE WHEN v_first_owner IS DISTINCT FROM v_latest_owner;
      v_user_id := NULL;
      SELECT account.user_id INTO v_user_id FROM identity."user" AS account
      WHERE account.owner_ref=v_first_owner AND account.state='active' FOR KEY SHARE NOWAIT;
      CONTINUE WHEN v_user_id IS NULL
        OR EXISTS (SELECT 1 FROM serve.private_run_key_cleanup_intent AS intent WHERE intent.run_id=v_request.run_id)
        OR EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone WHERE tombstone.run_id=v_request.run_id);
      SELECT event.state,event.publication_ref,event.at_seq
      INTO v_latest_visibility,v_latest_publication_ref,v_latest_at_seq
      FROM core.run_visibility_event AS event
      WHERE event.run_id=v_request.run_id ORDER BY event.at_seq DESC LIMIT 1;
      CONTINUE WHEN v_latest_visibility IS DISTINCT FROM 'PUBLISHED';
      -- Only a verdict about what the page shows: the version of its answer that was newest when the debate went public, or
      -- a later one. An older version with another conclusion is not on the page. (0126 writes a request only for a final
      -- result that asks for the deletion: never for a flag, an unavailable answer or one stored too late.)
      v_judged_answer_id := NULL;
      SELECT result.answer_id,result.answer_version INTO v_judged_answer_id,v_judged_version
      FROM serve.synthesis_check_result AS result WHERE result.result_id=v_request.result_id AND result.final;
      SELECT max(answer.answer_version) INTO v_shown_version FROM serve.answer AS answer
      WHERE answer.answer_id=v_judged_answer_id AND answer.sealed_at_seq<v_latest_at_seq;
      IF v_judged_answer_id IS NULL OR (v_judged_version<v_shown_version AND (
          SELECT judged.composed_text_id FROM serve.answer AS judged
          WHERE judged.answer_id=v_judged_answer_id AND judged.answer_version=v_judged_version
        ) IS DISTINCT FROM (
          SELECT shown.composed_text_id FROM serve.answer AS shown
          WHERE shown.answer_id=v_judged_answer_id AND shown.answer_version=v_shown_version
        )) THEN
        RETURN QUERY SELECT 'NOT_SHOWN'::text,v_request.run_id;
        CONTINUE;
      END IF;
      -- Another publish of it in flight: its key's intent is recorded until it ends.
      IF EXISTS (SELECT 1 FROM serve.publication_key_provision_intent AS provision WHERE provision.run_id=v_request.run_id) THEN
        RETURN QUERY SELECT 'CONTENDED'::text,v_request.run_id;
        CONTINUE;
      END IF;
      -- The page's digs, reports and flags take this lock first; never wait for it while holding the debate's row.
      IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:public-tree:'||v_latest_publication_ref::text,0)) THEN
        RETURN QUERY SELECT 'CONTENDED'::text,v_request.run_id;
        CONTINUE;
      END IF;
      -- 0040's binding names a session row of the account, as 0137's Free publish does: its newest, whatever its state.
      -- Nothing authenticates by it.
      v_session_id := NULL;
      SELECT session.session_id INTO v_session_id FROM identity.session AS session
      WHERE session.user_id=v_user_id ORDER BY session.created_at DESC,session.session_id LIMIT 1;
      IF v_session_id IS NULL THEN
        RETURN QUERY SELECT 'NO_SESSION'::text,v_request.run_id;
        CONTINUE;
      END IF;
      BEGIN
        v_reservation_id := gen_random_uuid();
        v_event_id := gen_random_uuid();
        v_event_actor_ref := gen_random_uuid();
        v_audit_id := gen_random_uuid();
        v_audit_actor_ref := gen_random_uuid();
        v_audit_target_ref := gen_random_uuid();
        v_denied_audit_id := gen_random_uuid();
        v_denied_audit_actor_ref := gen_random_uuid();
        v_denied_audit_target_ref := gen_random_uuid();
        -- Every reference of the one-shot binding, kept once, as 0085's reservation keeps them.
        INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at) VALUES
          (v_reservation_id,'reservation',v_now),(v_event_id,'visibility_event',v_now),
          (v_event_actor_ref,'visibility_actor',v_now),(v_audit_id,'allow_audit_id',v_now),
          (v_audit_actor_ref,'allow_audit_actor',v_now),(v_audit_target_ref,'allow_audit_target',v_now),
          (v_denied_audit_id,'denied_audit_id',v_now),(v_denied_audit_actor_ref,'denied_audit_actor',v_now),
          (v_denied_audit_target_ref,'denied_audit_target',v_now);
        INSERT INTO identity.publication_event_binding(
          reservation_id,user_id,session_id,run_id,action,grant_id,grant_token_hash,
          visibility_event_id,visibility_actor_ref,audit_id,audit_actor_ref,audit_target_ref,
          denied_audit_id,denied_audit_actor_ref,denied_audit_target_ref,created_at,expires_at
        ) VALUES (
          v_reservation_id,v_user_id,v_session_id,v_request.run_id,'UNPUBLISH',gen_random_uuid(),
          'sha256:'||encode(sha256(convert_to('check-deleted:'||gen_random_uuid()::text,'UTF8')),'hex'),
          v_event_id,v_event_actor_ref,v_audit_id,v_audit_actor_ref,v_audit_target_ref,
          v_denied_audit_id,v_denied_audit_actor_ref,v_denied_audit_target_ref,v_now,v_now+interval '1 minute'
        );
        -- 0085's unpublish: the key's cleanup intent, the PRIVATE event, its audit event, the binding used once.
        INSERT INTO serve.publication_key_cleanup_intent(
          publication_ref,requested_at,completed_at,cleanup_state,
          cleanup_claim_token,cleanup_claim_expires_at,destroy_result
        ) VALUES (v_latest_publication_ref,v_now,NULL,'PENDING',NULL,NULL,NULL)
        ON CONFLICT (publication_ref) DO UPDATE
        SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
          completed_at=NULL,cleanup_state='PENDING',cleanup_claim_token=NULL,
          cleanup_claim_expires_at=NULL,destroy_result=NULL;
        INSERT INTO core.run_visibility_event(
          run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
          actor_ref_version,warning_version,occurred_at,at_seq
        ) VALUES (
          v_event_id,v_request.run_id,v_latest_publication_ref,'PRIVATE',v_event_actor_ref,
          2,'COPIES_MAY_PERSIST_V1',v_now,ledger.allocate_sequence()
        );
        PERFORM identity.append_audit_event_internal(
          v_audit_id,v_audit_actor_ref::text,'debate.publication.unpublished',
          'debate.publication_event_ref',v_audit_target_ref::text,v_now,
          '{"schema":"s10-publication-event-v2"}'::jsonb,'ALLOW',true,NULL
        );
        UPDATE identity.publication_event_binding SET consumed_at=v_now
        WHERE reservation_id=v_reservation_id AND consumed_at IS NULL;
        PERFORM identity.close_public_page_of_deleted_debate(v_latest_publication_ref);
        RETURN QUERY SELECT 'TAKEN_DOWN'::text,v_request.run_id;
      EXCEPTION WHEN unique_violation THEN
        RETURN QUERY SELECT 'CONTENDED'::text,v_request.run_id;
      END;
    EXCEPTION WHEN lock_not_available THEN
      RETURN QUERY SELECT 'CONTENDED'::text,v_request.run_id;
    END;
  END LOOP;
END;
$$;

-- 3. The Free debates that wait, read from a place -------------------------------------------------------------------------------
-- 0137's list (as 0171 left it: finished, not a dig, its owner's still), after (p_after_notice_at, p_after_run_id) in
-- (notice_at, run_id) order, at most p_limit (1..100): [{run_id, owner_ref, notice_at}]. Both null: from the first. The sweep
-- passes the last row it read, and starts again from the first once a read comes back short.
CREATE OR REPLACE FUNCTION identity.read_free_debates_to_publish_after(p_limit integer, p_after_notice_at timestamptz, p_after_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_after_notice_at IS NULL) <> (p_after_run_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='FREE_PUBLIC_LIST_INVALID';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', waiting.run_id, 'owner_ref', waiting.owner_ref, 'notice_at', waiting.notice_at)
      ORDER BY waiting.notice_at, waiting.run_id)
    FROM (
      SELECT ask.run_id, ask.owner_ref, ask.notice_at FROM identity.free_public_ask AS ask
      WHERE ask.outcome IS NULL
        AND (p_after_notice_at IS NULL OR (ask.notice_at, ask.run_id) > (p_after_notice_at, p_after_run_id))
        AND identity.web_evidence_run_owner(ask.run_id) IS NOT DISTINCT FROM ask.owner_ref AND NOT identity.run_is_dig(ask.run_id)
        AND EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = ask.run_id)
        AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = ask.run_id AND work.state <> 'DONE')
      ORDER BY ask.notice_at, ask.run_id
      LIMIT p_limit
    ) AS waiting), '[]'::jsonb);
END;
$$;

-- 4. Owners and grants ---------------------------------------------------------------------------------------------------------
-- Each function takes the owner of the older one it stands beside: the takedown 0137's Free publish's (the migrator, who owns
-- the publication tables), the page's closing 0150's hide's (identity.public_review_apply, which writes the same rows), the
-- list 0137's. The takedown's owner may call the closing. The step refuses to apply where an owner could not do what its
-- function does, so the API never meets a function it cannot run.
-- n1: reviewed sets the owners of the three functions this step creates, grants the closing to the takedown's owner and checks what each owner may do; the release before calls none of them
DO $check_deletes_public_debate_owner$
DECLARE
  v_core name;
  v_page name;
  v_list name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_core FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)'::regprocedure;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_page FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_list FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.read_free_debates_to_publish(integer)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION core.take_down_check_deleted_debates(integer) OWNER TO %I', v_core);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.close_public_page_of_deleted_debate(uuid) OWNER TO %I', v_page);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_free_debates_to_publish_after(integer,timestamptz,uuid) OWNER TO %I', v_list);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION identity.close_public_page_of_deleted_debate(uuid) TO %I', v_core);
  IF NOT pg_catalog.has_function_privilege(v_page, 'identity.settle_public_contribution(uuid,text,uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_table_privilege(v_page, 'identity.public_contribution', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_page, 'identity.public_climb_done', 'INSERT')
    OR NOT pg_catalog.has_table_privilege(v_page, 'identity.public_report', 'UPDATE')
    OR NOT pg_catalog.has_table_privilege(v_page, 'identity.public_material', 'DELETE')
    OR NOT pg_catalog.has_function_privilege(v_page, 'identity.open_forget_scope(text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_page, 'identity.close_forget_scope(text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_core, 'identity.close_public_page_of_deleted_debate(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_core, 'identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_core, 'ledger.allocate_sequence()', 'EXECUTE')
    OR NOT pg_catalog.has_table_privilege(v_core, 'core.run_visibility_event', 'INSERT')
    OR NOT pg_catalog.has_table_privilege(v_core, 'core.publication_ref_tombstone', 'INSERT')
    OR NOT pg_catalog.has_table_privilege(v_core, 'identity.publication_event_binding', 'INSERT')
    OR NOT pg_catalog.has_table_privilege(v_core, 'identity.publication_event_binding', 'UPDATE')
    OR NOT pg_catalog.has_table_privilege(v_core, 'identity.session', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_core, 'serve.publication_key_cleanup_intent', 'INSERT')
    OR NOT pg_catalog.has_table_privilege(v_core, 'serve.publication_key_cleanup_intent', 'UPDATE')
    OR NOT pg_catalog.has_table_privilege(v_core, 'serve.answer', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_core, 'serve.synthesis_check_removal_request', 'UPDATE')
    OR NOT pg_catalog.has_table_privilege(v_core, 'serve.synthesis_check_result', 'SELECT')
    OR NOT pg_catalog.has_function_privilege(v_list, 'identity.web_evidence_run_owner(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_list, 'identity.run_is_dig(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_table_privilege(v_list, 'identity.free_public_ask', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_list, 'core.work_item', 'SELECT') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='CHECK_DELETES_PUBLIC_DEBATE_OWNER_UNABLE';
  END IF;
END
$check_deletes_public_debate_owner$;

REVOKE ALL ON FUNCTION identity.close_public_page_of_deleted_debate(uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION core.take_down_check_deleted_debates(integer)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_free_debates_to_publish_after(integer,timestamptz,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
-- The API's erasure pass, on its system login outside any request, as 0171 gave 0137's Free publish to the cross-account marker.
GRANT EXECUTE ON FUNCTION core.take_down_check_deleted_debates(integer) TO debateai_rls_all_accounts;
-- The API's Free sweep outside any request, as 0171 moved 0137's list to the cross-account marker.
GRANT EXECUTE ON FUNCTION identity.read_free_debates_to_publish_after(integer,timestamptz,uuid) TO debateai_rls_all_accounts;
