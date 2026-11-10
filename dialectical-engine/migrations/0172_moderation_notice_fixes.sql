-- 0172 · The moderation notices' seven gaps after 0157 (the owner's list of 10 November 2026, M1-M7; plan 2026-11-10-moderation-notices-m1-m7).
--
-- Plain words. One drained step for every fix of the list that the database must make. Each section below is named by its gap (M5, ...), and the
-- contract at the end checks each one's end state as the step applies. 0172 never edits an earlier file: a function it changes is restated here
-- once, with its exact signature, owner, grants and settings as 0157 left them, and declared in the manifest's amendsPostconditionsOf. Once applied,
-- this file is fixed: any later change is a step of its own.
-- M5. One bad row never stops the moderation mail (owner, 10 Nov 2026). 0157's queue read every new log row and decision in one statement, so one
--   source row whose work raised (any fault in its own reads or writes: a constraint, a row in a shape the queue does not expect) rolled back the
--   whole call, and with it the sender's claim: no statement and no further log row was ever queued again, for anyone. Each source is now handled in its own block: what it wrote
--   goes back if it raises, it is set aside in the new identity.moderation_statement_stuck (its id, the SQLSTATE, never the words, when it first and
--   last failed and how often), retried after an hour, and on its first failure the Owner and the team-limit holders get one staff alert,
--   MODERATION_MAIL_FAILED, through 0151's own notices (whose kind CHECK takes the new kind, under its catalog name). A source that later succeeds
--   takes its stuck row with it. The API's sender settles each claim on its own too, and runs the statements and the reporters' answers apart, so
--   one failing never skips the other (apps/api/src/moderation-statements.ts, apps/api/src/main.ts).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it restates 0157's identity.queue_moderation_statements() in place and swaps the kind CHECK of 0151's staff.public_flag_notice, and
--                   both are pinned by those steps' postcondition digests (amendsPostconditionsOf); the release that carries it must be a drained upload.
--                   0157's claim, read and complete keep their signatures and results, so the release before's sender still works beside it.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- M5. One bad row never stops the moderation mail ------------------------------------------------------------------------------------
-- The sources the queue set aside: a log row's event_id or a decision's decision_id, the SQLSTATE of its last failure (never its message, which may
-- carry words), and when and how often it failed. No login holds a right on it; only the queue's owner writes it.
CREATE TABLE IF NOT EXISTS identity.moderation_statement_stuck (
  source_id uuid PRIMARY KEY,
  sqlstate text NOT NULL,
  first_failed_at timestamptz NOT NULL,
  last_failed_at timestamptz NOT NULL,
  tries integer NOT NULL
);
SELECT core.install_truncate_guard('identity.moderation_statement_stuck');
-- Its owner is the queue's, 0150's identity owner, as 0157 gave its own tables.
DO $m5_stuck_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.moderation_statement_stuck OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON identity.moderation_statement_stuck FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
END
$m5_stuck_owner$;
-- The staff alert's kind, beside 0151's two: same name (the catalog's, 0151 left it unnamed), same table. Validated: every stored row is one of 0151's two.
ALTER TABLE staff.public_flag_notice DROP CONSTRAINT IF EXISTS public_flag_notice_kind_check;
ALTER TABLE staff.public_flag_notice ADD CONSTRAINT public_flag_notice_kind_check
  CHECK (kind IN ('PUBLIC_FLAG_HIDDEN','PUBLIC_FLAG_WAITING','MODERATION_MAIL_FAILED'));
-- 0157's queue, each source in its own block (BEGIN ... EXCEPTION WHEN OTHERS): what one source wrote goes back if it raises, it is set aside, and
-- the loop goes on. A source set aside less than an hour ago is left out of both loops' reads, so it never takes one of the 200 places. On its
-- first failure the alert is queued once per active Owner and team-limit holder (0151's notice, keyed by the source; its own UNIQUE keeps it once).
-- Otherwise 0157's body, word for word: who is told of what, D7, D3, D8 and D9 are unchanged. CREATE OR REPLACE keeps its owner and its grants
-- (none but its owner's); the contract below checks the body by its digest, which a later section that edits it in place recomputes.
CREATE OR REPLACE FUNCTION identity.queue_moderation_statements() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_review_event%ROWTYPE; d identity.moderation_decision%ROWTYPE; v_count integer := 0; v_owner uuid; v_row record; v_since timestamptz;
  v_state text; v_tries integer;
BEGIN
  SELECT start.since INTO v_since FROM identity.moderation_statement_since AS start;
  FOR v IN SELECT event.* FROM identity.public_review_event AS event
    WHERE event.recorded_at >= v_since AND event.action IN ('HIDE','REMOVE_DIG','HIDE_REPORT','REPUBLISH')
      AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = event.event_id)
      AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_stuck AS stuck WHERE stuck.source_id = event.event_id AND stuck.last_failed_at > clock_timestamp() - interval '1 hour')
    ORDER BY event.recorded_at, event.event_id LIMIT 200 LOOP
    -- M5: this source's work, alone. What it wrote goes back if it raises; the others go on.
    BEGIN
      INSERT INTO identity.moderation_statement_seen (source_id) VALUES (v.event_id) ON CONFLICT (source_id) DO NOTHING;
      IF NOT FOUND THEN CONTINUE; END IF;
      v_owner := identity.moderation_debate_owner(v.publication_ref);
      IF v.action = 'HIDE' THEN
        PERFORM identity.state_moderation(v_owner, 'DEBATE_HIDDEN', v.publication_ref, v.event_id, NULL, ARRAY[v.event_id], NULL, NULL, NULL, v.recorded_at);
        -- D7: every other person's dig and report goes with the debate. A dig still running was settled UNAVAILABLE by this hide: the same.
        FOR v_row IN SELECT DISTINCT contribution.owner_ref, contribution.dig_run_id FROM identity.public_contribution AS contribution
          WHERE contribution.publication_ref = v.publication_ref AND contribution.contributed_at <= v.recorded_at AND contribution.owner_ref IS DISTINCT FROM v_owner
            AND (contribution.outcome = 'ALLOWED' OR EXISTS (SELECT 1 FROM identity.public_review_detached AS detached WHERE detached.dig_run_id = contribution.dig_run_id AND detached.revision = v.revision))
            AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS removal WHERE removal.action = 'REMOVE_DIG' AND removal.piece_id = contribution.dig_run_id AND removal.revision < v.revision) LOOP
          PERFORM identity.state_moderation(v_row.owner_ref, 'CONTRIBUTION_AFFECTED', v.publication_ref, v.event_id, NULL, ARRAY[v.event_id], 'DIG', v_row.dig_run_id, NULL, v.recorded_at);
        END LOOP;
        FOR v_row IN SELECT report.writer_ref, report.report_id FROM identity.public_report AS report
          WHERE report.publication_ref = v.publication_ref AND report.requested_at <= v.recorded_at AND report.writer_ref IS DISTINCT FROM v_owner AND report.writer_ref IS NOT NULL
            AND (EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = report.report_id AND copy.recorded_at <= v.recorded_at)
              OR report.failure_code = 'PUBLIC_REVIEW_HOLD')
            AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS hidden WHERE hidden.action = 'HIDE_REPORT' AND hidden.piece_id = report.report_id AND hidden.revision < v.revision) LOOP
          PERFORM identity.state_moderation(v_row.writer_ref, 'REPORT_AFFECTED', v.publication_ref, v.event_id, NULL, ARRAY[v.event_id], 'REPORT', v_row.report_id, NULL, v.recorded_at);
        END LOOP;
      ELSIF v.action = 'REMOVE_DIG' THEN
        PERFORM identity.state_moderation((SELECT contribution.owner_ref FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = v.piece_id),
          'CONTRIBUTION_REMOVED', v.publication_ref, v.event_id, NULL, ARRAY[v.event_id], 'DIG', v.piece_id, NULL, v.recorded_at);
        -- D7: the rows written after the dig's first row and before its removal, and the reports asked for in that time (0150's rule), went too.
        FOR v_row IN SELECT DISTINCT contribution.owner_ref, update_row.dig_run_id FROM identity.public_debate_update AS update_row
            JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = update_row.dig_run_id
          WHERE update_row.publication_ref = v.publication_ref AND update_row.dig_run_id IS DISTINCT FROM v.piece_id AND update_row.recorded_at <= v.recorded_at
            AND update_row.update_seq > (SELECT min(first_row.update_seq) FROM identity.public_debate_update AS first_row WHERE first_row.publication_ref = v.publication_ref AND first_row.dig_run_id = v.piece_id)
            AND contribution.owner_ref IS DISTINCT FROM (SELECT removed.owner_ref FROM identity.public_contribution AS removed WHERE removed.dig_run_id = v.piece_id) LOOP
          PERFORM identity.state_moderation(v_row.owner_ref, 'CONTRIBUTION_AFFECTED', v.publication_ref, v.event_id, NULL, ARRAY[v.event_id], 'DIG', v_row.dig_run_id, NULL, v.recorded_at);
        END LOOP;
        FOR v_row IN SELECT report.writer_ref, report.report_id FROM identity.public_report AS report
          WHERE report.publication_ref = v.publication_ref AND report.writer_ref IS NOT NULL AND report.requested_at <= v.recorded_at
            AND report.requested_at > (SELECT min(first_row.recorded_at) FROM identity.public_debate_update AS first_row WHERE first_row.publication_ref = v.publication_ref AND first_row.dig_run_id = v.piece_id)
            AND EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = report.report_id) LOOP
          PERFORM identity.state_moderation(v_row.writer_ref, 'REPORT_AFFECTED', v.publication_ref, v.event_id, NULL, ARRAY[v.event_id], 'REPORT', v_row.report_id, NULL, v.recorded_at);
        END LOOP;
      ELSIF v.action = 'HIDE_REPORT' THEN
        PERFORM identity.state_moderation((SELECT report.writer_ref FROM identity.public_report AS report WHERE report.report_id = v.piece_id),
          'REPORT_REMOVED', v.publication_ref, v.event_id, NULL, ARRAY[v.event_id], 'REPORT', v.piece_id, NULL, v.recorded_at);
      ELSE
        -- D3: the corrections of this review, since the hide it ends, once per person, at the re-publish that shows them.
        FOR v_row IN WITH corrected AS (
            SELECT correction.event_id, correction.piece_kind, correction.piece_id, correction.pointer,
              CASE correction.piece_kind WHEN 'SNAPSHOT' THEN v_owner
                WHEN 'UPDATE' THEN (SELECT contribution.owner_ref FROM identity.public_debate_update AS update_row JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = update_row.dig_run_id
                  WHERE update_row.update_id = correction.piece_id)
                ELSE (SELECT report.writer_ref FROM identity.public_report AS report WHERE report.report_id = correction.piece_id) END AS person
            FROM identity.public_review_event AS correction
            WHERE correction.publication_ref = v.publication_ref AND correction.action = 'CORRECT' AND correction.revision < v.revision
              AND correction.revision > COALESCE((SELECT max(earlier.revision) FROM identity.public_review_event AS earlier
                WHERE earlier.publication_ref = v.publication_ref AND earlier.action = 'REPUBLISH' AND earlier.revision < v.revision), 0))
          SELECT corrected.person, array_agg(DISTINCT corrected.event_id) AS events,
            jsonb_agg(DISTINCT jsonb_build_object('piece_kind', corrected.piece_kind, 'piece_id', corrected.piece_id, 'pointer', corrected.pointer)) AS places
          FROM corrected WHERE corrected.person IS NOT NULL GROUP BY corrected.person LOOP
          PERFORM identity.state_moderation(v_row.person, 'CORRECTED', v.publication_ref, v.event_id, NULL, v_row.events, NULL, NULL, v_row.places, v.recorded_at);
        END LOOP;
      END IF;
      DELETE FROM identity.moderation_statement_stuck AS stuck WHERE stuck.source_id = v.event_id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      INSERT INTO identity.moderation_statement_stuck AS stuck (source_id, sqlstate, first_failed_at, last_failed_at, tries)
      VALUES (v.event_id, v_state, clock_timestamp(), clock_timestamp(), 1)
      ON CONFLICT (source_id) DO UPDATE SET sqlstate = EXCLUDED.sqlstate, last_failed_at = EXCLUDED.last_failed_at, tries = stuck.tries + 1
      RETURNING stuck.tries INTO v_tries;
      IF v_tries = 1 THEN PERFORM staff.queue_public_flag_notices(v.event_id, 'MODERATION_MAIL_FAILED'); END IF;
    END;
  END LOOP;
  FOR d IN SELECT decision.* FROM identity.moderation_decision AS decision
    WHERE NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = decision.decision_id)
      AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_stuck AS stuck WHERE stuck.source_id = decision.decision_id AND stuck.last_failed_at > clock_timestamp() - interval '1 hour')
    ORDER BY decision.recorded_at, decision.decision_id LIMIT 200 LOOP
    -- M5: the same for each decision.
    BEGIN
      INSERT INTO identity.moderation_statement_seen (source_id) VALUES (d.decision_id) ON CONFLICT (source_id) DO NOTHING;
      IF NOT FOUND THEN CONTINUE; END IF;
      PERFORM identity.state_moderation(identity.moderation_debate_owner(d.publication_ref), 'DEBATE_DECIDED', d.publication_ref, NULL, d.decision_id, '{}'::uuid[], NULL, NULL, NULL, d.recorded_at);
      DELETE FROM identity.moderation_statement_stuck AS stuck WHERE stuck.source_id = d.decision_id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      INSERT INTO identity.moderation_statement_stuck AS stuck (source_id, sqlstate, first_failed_at, last_failed_at, tries)
      VALUES (d.decision_id, v_state, clock_timestamp(), clock_timestamp(), 1)
      ON CONFLICT (source_id) DO UPDATE SET sqlstate = EXCLUDED.sqlstate, last_failed_at = EXCLUDED.last_failed_at, tries = stuck.tries + 1
      RETURNING stuck.tries INTO v_tries;
      IF v_tries = 1 THEN PERFORM staff.queue_public_flag_notices(d.decision_id, 'MODERATION_MAIL_FAILED'); END IF;
    END;
  END LOOP;
  RETURN v_count;
END $$;

-- M2. A failed send backs off over about three days, then alerts the team ------------------------------------------------------------
-- 0157 let a failed send be claimed again the moment its claim ended, so a mail outage burned the 20 tries it allows in minutes and the statement
-- or the reporter's answer was given up. A failed try now waits: min(2^attempts_before minutes, 6 hours), attempts_before being the row's
-- attempts before this complete's increment (1, 2, 4 ... minutes after tries 1, 2, 3; 6 hours from the tenth), so the 20 tries span about three
-- days. The 20th retry gives up as 0157 does (failed_at) and, once, queues the staff alert MODERATION_MAIL_FAILED (0151's notices, keyed by the
-- statement's or the mail's id). DROPPED (no address, by design, D8) never alerts. The column is nullable with no default: a row that never
-- failed, or that the release before wrote, has none and is due at once. The four functions keep their signatures and results; each claim keeps
-- its queue call as its first statement, so the release before's sender still works beside them.
ALTER TABLE identity.moderation_statement ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE identity.public_flag_mail ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
CREATE OR REPLACE FUNCTION identity.claim_moderation_statements(p_limit integer)
RETURNS TABLE(statement_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MODERATION_STATEMENT_LIMIT_INVALID'; END IF;
  PERFORM identity.queue_moderation_statements();
  RETURN QUERY WITH picked AS (
    SELECT s.statement_id FROM identity.moderation_statement AS s
    WHERE s.delivered_at IS NULL AND s.failed_at IS NULL AND (s.claim_expires_at IS NULL OR s.claim_expires_at <= clock_timestamp())
      AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= clock_timestamp())
    ORDER BY s.created_at, s.statement_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE identity.moderation_statement AS s SET claim_token = gen_random_uuid(), claim_expires_at = clock_timestamp() + interval '5 minutes'
    FROM picked WHERE s.statement_id = picked.statement_id RETURNING s.statement_id, s.claim_token;
END $$;
CREATE OR REPLACE FUNCTION identity.complete_moderation_statement(p_statement_id uuid, p_claim uuid, p_outcome text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_found boolean; v_gave_up boolean;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('SENT','RETRY','DROPPED') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MODERATION_STATEMENT_OUTCOME_INVALID'; END IF;
  UPDATE identity.moderation_statement AS s SET claim_token = NULL, claim_expires_at = NULL, attempts = least(s.attempts + 1, 20),
    delivered_at = CASE WHEN p_outcome = 'SENT' THEN clock_timestamp() END,
    failed_at = CASE WHEN p_outcome = 'DROPPED' OR (p_outcome = 'RETRY' AND s.attempts >= 19) THEN clock_timestamp() END,
    next_attempt_at = CASE WHEN p_outcome = 'RETRY' AND s.attempts < 19 THEN clock_timestamp() + least(interval '1 minute' * power(2, s.attempts), interval '6 hours') END
  WHERE s.statement_id = p_statement_id AND s.claim_token = p_claim AND s.claim_expires_at > clock_timestamp()
  RETURNING p_outcome = 'RETRY' AND s.failed_at IS NOT NULL INTO v_gave_up;
  v_found := FOUND;
  IF v_gave_up THEN PERFORM staff.queue_public_flag_notices(p_statement_id, 'MODERATION_MAIL_FAILED'); END IF;
  RETURN v_found;
END $$;
CREATE OR REPLACE FUNCTION identity.claim_public_flag_mail(p_limit integer)
RETURNS TABLE(mail_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_MAIL_LIMIT_INVALID'; END IF;
  PERFORM identity.queue_public_flag_mail();
  RETURN QUERY WITH picked AS (
    SELECT mail.mail_id FROM identity.public_flag_mail AS mail
    WHERE mail.delivered_at IS NULL AND mail.failed_at IS NULL AND (mail.claim_expires_at IS NULL OR mail.claim_expires_at <= clock_timestamp())
      AND (mail.next_attempt_at IS NULL OR mail.next_attempt_at <= clock_timestamp())
    ORDER BY mail.created_at, mail.mail_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE identity.public_flag_mail AS mail SET claim_token = gen_random_uuid(), claim_expires_at = clock_timestamp() + interval '5 minutes'
    FROM picked WHERE mail.mail_id = picked.mail_id RETURNING mail.mail_id, mail.claim_token;
END $$;
CREATE OR REPLACE FUNCTION identity.complete_public_flag_mail(p_mail_id uuid, p_claim uuid, p_outcome text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_found boolean; v_gave_up boolean;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('SENT','RETRY','DROPPED') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_MAIL_OUTCOME_INVALID'; END IF;
  UPDATE identity.public_flag_mail AS mail SET claim_token = NULL, claim_expires_at = NULL, attempts = least(mail.attempts + 1, 20),
    delivered_at = CASE WHEN p_outcome = 'SENT' THEN clock_timestamp() END,
    failed_at = CASE WHEN p_outcome = 'DROPPED' OR (p_outcome = 'RETRY' AND mail.attempts >= 19) THEN clock_timestamp() END,
    next_attempt_at = CASE WHEN p_outcome = 'RETRY' AND mail.attempts < 19 THEN clock_timestamp() + least(interval '1 minute' * power(2, mail.attempts), interval '6 hours') END
  WHERE mail.mail_id = p_mail_id AND mail.claim_token = p_claim AND mail.claim_expires_at > clock_timestamp()
  RETURNING p_outcome = 'RETRY' AND mail.failed_at IS NOT NULL INTO v_gave_up;
  v_found := FOUND;
  IF v_gave_up THEN PERFORM staff.queue_public_flag_notices(p_mail_id, 'MODERATION_MAIL_FAILED'); END IF;
  RETURN v_found;
END $$;

-- M6, M4. A review step that acts on a report closes it, and the reporter hears one decision ------------------------------------------
-- M6 (owner, 10 Nov 2026; decision C). 0157 mailed the reporter "a person acted on it" when a review step or DECIDE named their report as its
-- source, and left the report open: it stayed in the queue as waiting, and a later close could tell the same reporter "no breach" after
-- "acted" (M4). A person's step whose ground names a report (source REPORT_BUTTON, with its flag_id) now closes it as ACTED in the same
-- transaction, through 0151's own dismissal (so the words' six months start at the step), with 0157's answer beside it. The automatic hide
-- (0151's nil actor) is not a person's decision: it leaves the report open for one. A report already closed stays as it was closed.
-- The close never raises: a hide can never be refused, and no step fails for its report. What it could not do goes back whole and is
-- logged by a fixed marker only (PUBLIC_FLAG_REVIEW_CLOSE_SKIPPED, never the error's words); a person then closes the report as before.
-- Its operation is derived from the step's log row or decision (md5('review-close:' || source)), so it never meets a step's own, and
-- the staff queue knows a step closed a report by recomputing it from those rows.
CREATE OR REPLACE FUNCTION identity.close_public_flag_by_review(p_flag_id uuid, p_actor uuid, p_source_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_operation uuid; v_at timestamptz;
BEGIN
  BEGIN
    -- Locked as 0151's dismissal locks it, so a close by a person at the same moment is seen and this one does nothing.
    PERFORM 1 FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id AND flag.dismissed_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    v_operation := md5('review-close:' || p_source_id::text)::uuid;
    v_at := identity.public_flag_dismiss(p_flag_id, p_actor, v_operation, encode(sha256(convert_to('review-close:' || p_source_id::text, 'UTF8')), 'hex'));
    INSERT INTO identity.public_flag_answer (flag_id, outcome, actor_staff_id, operation_id, recorded_at) VALUES (p_flag_id, 'ACTED', p_actor, v_operation, v_at);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'PUBLIC_FLAG_REVIEW_CLOSE_SKIPPED';
  END;
END $$;
-- n1: reviewed gives only the new function its owner, the owner of 0157's ground functions that call it, and no login a right on it
DO $m6_close_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.close_public_flag_by_review(uuid,uuid,uuid) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.close_public_flag_by_review(uuid,uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
END
$m6_close_owner$;
-- 0157's three ground functions, each with one more line after its own insert: a person's step that names a report closes it. Otherwise 0157's
-- bodies (the contract test compares them). A hide still cannot raise: the close is inside its own block, and never raises.
CREATE OR REPLACE FUNCTION identity.record_hide_ground(p_operation uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_event_id uuid; v_source text; v_flag uuid; v_suspected text[]; v_actor uuid;
BEGIN
  SELECT event.event_id, event.actor_staff_id INTO v_event_id, v_actor FROM identity.public_review_event AS event WHERE event.operation_id = p_operation AND event.publication_ref = p_publication_ref AND event.action = 'HIDE';
  IF NOT FOUND THEN RETURN; END IF;
  BEGIN
    v_flag := CASE WHEN p_source = 'REPORT_BUTTON' AND EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id AND flag.publication_ref = p_publication_ref) THEN p_flag_id END;
    v_source := CASE WHEN v_flag IS NOT NULL THEN 'REPORT_BUTTON' WHEN p_source IN ('EMAIL_NOTICE','OWN_INITIATIVE','AUTHORITY_ORDER') THEN p_source ELSE 'OWN_INITIATIVE' END;
    v_suspected := CASE WHEN identity.moderation_grounds_known(p_grounds, false) THEN p_grounds ELSE '{}'::text[] END;
    INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, suspected, source, flag_id, interim)
    VALUES (v_event_id, p_publication_ref, ARRAY['REVIEW_HOLD'], v_suspected, v_source, v_flag, true) ON CONFLICT (event_id) DO NOTHING;
    IF v_flag IS NOT NULL AND v_actor <> '00000000-0000-0000-0000-000000000000'::uuid THEN PERFORM identity.close_public_flag_by_review(v_flag, v_actor, v_event_id); END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, interim)
    VALUES (v_event_id, p_publication_ref, ARRAY['REVIEW_HOLD'], 'OWN_INITIATIVE', true) ON CONFLICT (event_id) DO NOTHING;
  END;
END $$;
CREATE OR REPLACE FUNCTION identity.moderation_decide(p_actor uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid, p_facts_sha256 text, p_facts jsonb,
  p_expected_revision integer, p_operation uuid, p_request_sha256 text) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_revision integer; v_at timestamptz; v_decision uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0));
  SELECT COALESCE(max(event.revision), 0) INTO v_revision FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref;
  IF v_revision <> p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_STALE'; END IF;
  IF NOT identity.public_review_held(p_publication_ref) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_NOT_HIDDEN'; END IF;
  INSERT INTO identity.moderation_decision (publication_ref, revision, grounds, source, flag_id, facts_sha256, facts_ciphertext, actor_staff_id, operation_id, request_sha256)
  VALUES (p_publication_ref, v_revision, p_grounds, p_source, p_flag_id, p_facts_sha256, p_facts, p_actor, p_operation, p_request_sha256)
  RETURNING recorded_at, decision_id INTO v_at, v_decision;
  IF p_source = 'REPORT_BUTTON' AND p_flag_id IS NOT NULL AND p_actor <> '00000000-0000-0000-0000-000000000000'::uuid THEN PERFORM identity.close_public_flag_by_review(p_flag_id, p_actor, v_decision); END IF;
  RETURN v_at;
END $$;
CREATE OR REPLACE FUNCTION identity.record_step_ground(p_operation uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid, p_facts_sha256 text, p_facts jsonb) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH recorded AS (
  INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, flag_id, facts_sha256, facts_ciphertext, interim)
  SELECT event.event_id, p_publication_ref, p_grounds, p_source, p_flag_id, p_facts_sha256, p_facts, false
  FROM identity.public_review_event AS event WHERE event.operation_id = p_operation AND event.publication_ref = p_publication_ref
  RETURNING event_id)
  SELECT identity.close_public_flag_by_review(p_flag_id, event.actor_staff_id, event.event_id) FROM recorded JOIN identity.public_review_event AS event ON event.event_id = recorded.event_id WHERE p_source = 'REPORT_BUTTON' AND p_flag_id IS NOT NULL AND event.actor_staff_id <> '00000000-0000-0000-0000-000000000000'::uuid
$$;
-- M4 (decision C): the reporter hears one decision. 0157's queue, with two changes to its second insert: a step's or a decision's ACTED is
-- left to the close's own ACTED answer when there is one (one ACTED per report, the earliest: 0157's UNIQUE (flag_id, kind) already keeps
-- it to one row), and NO_BREACH is never queued once ACTED is queued or sent for the report, or due before it in the same run (a step whose
-- close was skipped, then a person's no-breach). ACTED may still follow an earlier NO_BREACH: a later, real decision.
CREATE OR REPLACE FUNCTION identity.queue_public_flag_mail() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_since timestamptz; v_rows integer; v_count integer := 0;
BEGIN
  SELECT start.since INTO v_since FROM identity.public_flag_mail_since AS start;
  -- The receipt, and the automatic check's two decisions.
  INSERT INTO identity.public_flag_mail (flag_id, kind, happened_at)
  SELECT due.flag_id, due.kind, due.happened_at FROM (
    SELECT flag.flag_id, CASE flag.state WHEN 'QUEUED' THEN 'RECEIPT' WHEN 'HIDDEN' THEN 'AUTO_HIDDEN' ELSE 'AUTO_NOT_FOUND' END AS kind,
      COALESCE(flag.judged_at, flag.created_at) AS happened_at, flag.created_at
    FROM identity.public_flag AS flag WHERE COALESCE(flag.judged_at, flag.created_at) >= v_since AND flag.state IN ('QUEUED','HIDDEN','NOT_FOUND') AND flag.reporter_ref IS NOT NULL) AS due
  WHERE NOT EXISTS (SELECT 1 FROM identity.public_flag_mail AS mail WHERE mail.flag_id = due.flag_id AND mail.kind = due.kind)
  ORDER BY due.created_at, due.flag_id LIMIT 200
  ON CONFLICT (flag_id, kind) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + v_rows;
  -- A person's decision: a close, a review step that names the report as its source, or the final decision on its debate that does.
  INSERT INTO identity.public_flag_mail (flag_id, kind, happened_at)
  SELECT due.flag_id, due.kind, min(due.happened_at) FROM (
      SELECT answer.flag_id, answer.outcome AS kind, answer.recorded_at AS happened_at FROM identity.public_flag_answer AS answer
    UNION ALL
      SELECT ground.flag_id, 'ACTED', ground.recorded_at FROM identity.moderation_ground AS ground
      WHERE ground.flag_id IS NOT NULL AND ground.source = 'REPORT_BUTTON'
        AND NOT EXISTS (SELECT 1 FROM identity.public_flag_answer AS acted WHERE acted.flag_id = ground.flag_id AND acted.outcome = 'ACTED')
    UNION ALL
      SELECT decision.flag_id, 'ACTED', decision.recorded_at FROM identity.moderation_decision AS decision
      WHERE decision.flag_id IS NOT NULL AND decision.source = 'REPORT_BUTTON'
        AND NOT EXISTS (SELECT 1 FROM identity.public_flag_answer AS acted WHERE acted.flag_id = decision.flag_id AND acted.outcome = 'ACTED')) AS due
    JOIN identity.public_flag AS flag ON flag.flag_id = due.flag_id
  WHERE due.happened_at >= v_since AND flag.reporter_ref IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM identity.public_flag_mail AS mail WHERE mail.flag_id = due.flag_id AND mail.kind = due.kind)
    AND NOT (due.kind = 'NO_BREACH' AND (EXISTS (SELECT 1 FROM identity.public_flag_mail AS mail WHERE mail.flag_id = due.flag_id AND mail.kind = 'ACTED')
      OR EXISTS (SELECT 1 FROM identity.moderation_ground AS ground WHERE ground.flag_id = due.flag_id AND ground.source = 'REPORT_BUTTON' AND ground.recorded_at <= due.happened_at)
      OR EXISTS (SELECT 1 FROM identity.moderation_decision AS decision WHERE decision.flag_id = due.flag_id AND decision.source = 'REPORT_BUTTON' AND decision.recorded_at <= due.happened_at)))
  GROUP BY due.flag_id, due.kind ORDER BY min(due.happened_at), due.flag_id LIMIT 200
  ON CONFLICT (flag_id, kind) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + v_rows;
  RETURN v_count;
END $$;
-- The queue as 0151 reads it, each report with its close's outcome and, new, whether a review step closed it (closed_by_step): its answer's
-- operation is the one the close derives from a log row or a decision that names the report. Recomputed from those rows, never read from the id.
CREATE OR REPLACE FUNCTION identity.public_flag_queue_answered() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_agg(row_found.value || jsonb_build_object('outcome', (SELECT answer.outcome FROM identity.public_flag_answer AS answer WHERE answer.flag_id = (row_found.value->>'flag_id')::uuid),
      'closed_by_step', EXISTS (SELECT 1 FROM identity.public_flag_answer AS answer WHERE answer.flag_id = (row_found.value->>'flag_id')::uuid AND answer.outcome = 'ACTED'
        AND (EXISTS (SELECT 1 FROM identity.moderation_ground AS ground WHERE ground.flag_id = answer.flag_id AND answer.operation_id = md5('review-close:' || ground.event_id::text)::uuid)
          OR EXISTS (SELECT 1 FROM identity.moderation_decision AS decision WHERE decision.flag_id = answer.flag_id AND answer.operation_id = md5('review-close:' || decision.decision_id::text)::uuid))))
    ORDER BY row_found.at), '[]'::jsonb)
  FROM jsonb_array_elements(identity.public_flag_queue()) WITH ORDINALITY AS row_found(value, at)
$$;

-- The contract: each gap's end state, checked as the step applies --------------------------------------------------------------------
DO $moderation_notice_fixes_contract$
DECLARE v_owner oid; v_queue oid; v_columns text; v_grantees text[];
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;

  -- M5: the stuck sources' table, exactly its five columns, the queue's owner's, under the truncate guard, and no other role's.
  SELECT pg_catalog.string_agg(a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END, ', ' ORDER BY a.attnum)
    INTO v_columns FROM pg_catalog.pg_attribute AS a WHERE a.attrelid = 'identity.moderation_statement_stuck'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_columns IS DISTINCT FROM 'source_id uuid NOT NULL, sqlstate text NOT NULL, first_failed_at timestamp with time zone NOT NULL, last_failed_at timestamp with time zone NOT NULL, tries integer NOT NULL'
    OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = 'identity.moderation_statement_stuck'::regclass) IS DISTINCT FROM v_owner
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'identity.moderation_statement_stuck'::regclass AND k.contype = 'p'
      AND pg_catalog.pg_get_constraintdef(k.oid) = 'PRIMARY KEY (source_id)')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.moderation_statement_stuck'::regclass AND NOT t.tgisinternal AND (t.tgtype & 32) <> 0) THEN
    RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M5 stuck table';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT pg_catalog.pg_get_userbyid(a.grantee)) INTO v_grantees
  FROM pg_catalog.pg_class AS c CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS a
  WHERE c.oid = 'identity.moderation_statement_stuck'::regclass AND a.grantee <> c.relowner;
  IF v_grantees IS NOT NULL THEN RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M5 stuck table granted %', v_grantees; END IF;
  -- M5: the queue is this file's body, its owner's, a definer with 0157's settings, callable by no other role, and its owner may queue the alert.
  v_queue := 'identity.queue_moderation_statements()'::regprocedure;
  IF (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_catalog.pg_proc AS p WHERE p.oid = v_queue)
      IS DISTINCT FROM 'd10da1d1c1cbe3bb2f1f271548b404b242bcc1f35611ea197b55699e01dd5da0'
    OR (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_queue) IS DISTINCT FROM v_owner
    OR (SELECT p.prosecdef AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=pg_catalog'] AND p.prorettype = 'integer'::regtype
      FROM pg_catalog.pg_proc AS p WHERE p.oid = v_queue) IS NOT TRUE
    OR NOT pg_catalog.has_function_privilege(v_owner, 'staff.queue_public_flag_notices(uuid,text)', 'EXECUTE')
    OR NOT pg_catalog.has_schema_privilege(v_owner, 'staff', 'USAGE') THEN
    RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M5 queue';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')) INTO v_grantees
  FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
  WHERE p.oid = v_queue AND a.grantee <> p.proowner;
  IF v_grantees IS NOT NULL THEN RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M5 queue granted %', v_grantees; END IF;
  -- M5: the alert's kind, one CHECK on the kind under its catalog name, with 0151's two and the new one.
  IF (SELECT pg_catalog.pg_get_constraintdef(k.oid) FROM pg_catalog.pg_constraint AS k
      WHERE k.conrelid = 'staff.public_flag_notice'::regclass AND k.conname = 'public_flag_notice_kind_check' AND k.contype = 'c' AND k.convalidated)
      IS DISTINCT FROM 'CHECK ((kind = ANY (ARRAY[''PUBLIC_FLAG_HIDDEN''::text, ''PUBLIC_FLAG_WAITING''::text, ''MODERATION_MAIL_FAILED''::text])))'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'staff.public_flag_notice'::regclass AND k.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(k.oid) LIKE '%PUBLIC_FLAG_WAITING%') <> 1 THEN
    RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M5 alert kind';
  END IF;
  -- M2: the retry column on both tables (nullable, no default), and the four functions as 0157 left them: signature, result, definer, settings, owner.
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid IN ('identity.moderation_statement'::regclass, 'identity.public_flag_mail'::regclass) AND a.attname = 'next_attempt_at'
          AND a.atttypid = 'timestamptz'::regtype AND NOT a.attnotnull AND NOT a.atthasdef AND NOT a.attisdropped) <> 2
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS p
        WHERE p.oid IN ('identity.claim_moderation_statements(integer)'::regprocedure, 'identity.complete_moderation_statement(uuid,uuid,text)'::regprocedure,
            'identity.claim_public_flag_mail(integer)'::regprocedure, 'identity.complete_public_flag_mail(uuid,uuid,text)'::regprocedure)
          AND p.proowner = v_owner AND p.prosecdef AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=pg_catalog']
          AND p.prorettype IN ('boolean'::regtype, 'record'::regtype)) <> 4
    OR pg_catalog.pg_get_function_result('identity.claim_moderation_statements(integer)'::regprocedure) IS DISTINCT FROM 'TABLE(statement_id uuid, claim_token uuid)'
    OR pg_catalog.pg_get_function_result('identity.claim_public_flag_mail(integer)'::regprocedure) IS DISTINCT FROM 'TABLE(mail_id uuid, claim_token uuid)'
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', 'identity.claim_moderation_statements(integer)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', 'identity.complete_moderation_statement(uuid,uuid,text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', 'identity.claim_public_flag_mail(integer)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', 'identity.complete_public_flag_mail(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M2 retry';
  END IF;
  -- M6, M4: the close and the five functions restated for it are this file's bodies (by digest; a later section that edits one recomputes it),
  -- each its owner's, a definer with 0157's settings. The close is callable by no other role and its owner may call 0151's dismissal; staff's
  -- doors still call the three ground functions and the queue's reader, as 0157 granted.
  IF (SELECT pg_catalog.count(*) FROM (VALUES
        ('identity.close_public_flag_by_review(uuid,uuid,uuid)', 'a36f45f64f20bc382d20604479d1e9ecdf06200bde8b807cab32681df2cede7c'),
        ('identity.record_hide_ground(uuid,uuid,text[],text,uuid)', 'acaccb507a32acb5f51c1d6404691ab40500ca3c6e33fe58e29ae9a9de935e44'),
        ('identity.moderation_decide(uuid,uuid,text[],text,uuid,text,jsonb,integer,uuid,text)', '28517c05e58727387969c392461ccf6332ff0d9028c14472c9fe169c5af73d65'),
        ('identity.record_step_ground(uuid,uuid,text[],text,uuid,text,jsonb)', 'fe033e37d75be869fe053ae93753122fd07c4802e98463a92114638ba7b8b481'),
        ('identity.queue_public_flag_mail()', 'b2870ffa279c99b4eddb0570f8ba4e12104577163f93cc0870f2693db95455cc'),
        ('identity.public_flag_queue_answered()', 'c5d3ae0d5d7cf6cd0d73ff9dca6213fb4de79d2a4a037d4e6bd0d1be4b7b1f3c')) AS expected(signature, body)
      JOIN pg_catalog.pg_proc AS p ON p.oid = pg_catalog.to_regprocedure(expected.signature)
      WHERE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex') = expected.body
        AND p.proowner = v_owner AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog']) <> 6
    OR (SELECT p.provolatile = 'v' AND p.prorettype = 'void'::regtype FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.close_public_flag_by_review(uuid,uuid,uuid)'::regprocedure) IS NOT TRUE
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.public_flag_dismiss(uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_staff_security_owner', 'identity.record_hide_ground(uuid,uuid,text[],text,uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_staff_security_owner', 'identity.moderation_decide(uuid,uuid,text[],text,uuid,text,jsonb,integer,uuid,text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_staff_security_owner', 'identity.record_step_ground(uuid,uuid,text[],text,uuid,text,jsonb)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_staff_security_owner', 'identity.public_flag_queue_answered()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M6 close';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')) INTO v_grantees
  FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
  WHERE p.oid = 'identity.close_public_flag_by_review(uuid,uuid,uuid)'::regprocedure AND a.grantee <> p.proowner;
  IF v_grantees IS NOT NULL THEN RAISE EXCEPTION 'MODERATION_NOTICE_FIXES_0172_CONTRACT M6 close granted %', v_grantees; END IF;
END
$moderation_notice_fixes_contract$;
