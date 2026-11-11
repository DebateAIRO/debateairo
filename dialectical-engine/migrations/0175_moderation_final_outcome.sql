-- 0175 · Everyone told "until the review ends" hears how it ended (what was left of 0172's M3; owner, 11 November 2026).
--
-- Plain words. 0157 tells each person whose dig or report left the public page with someone else's content (D7) that it is off "until a person puts
-- it back or the review ends": at a hide (the whole debate went) and at a dig taken out (0150's rule: every row written after that dig's first row
-- and before its removal, and every report asked for in that time, went too). 0172's M3 told them the end only when DECIDE kept the debate hidden,
-- and only those told at the hide. So a person told at a dig taken out never heard the end, and nobody heard it when the review ended by putting the
-- debate back (REPUBLISH), although what 0150 took off with a removal, and nobody put back, stays off the page then for good. Now:
-- 1. AT REPUBLISH. Each person told at the hide that began this review, or at a dig taken out during it, hears the end once per kind of piece: what
--    of theirs stays off (CONTRIBUTION_KEPT_OFF, REPORT_KEPT_OFF: in every country, with no end date, its ground the steps that keep it off), or that
--    it is back on the page (CONTRIBUTION_BACK, REPORT_BACK). Kept off is measured at the re-publish's own revision, with 0150's rules: a dig the hide
--    detached, a row or a report after a dig taken out and not put back since, a report the hide stopped (PUBLIC_REVIEW_HOLD).
-- 2. AT DECIDE. 0172's final statements (CONTRIBUTION_DECIDED, REPORT_DECIDED) go to those told at a dig taken out in this review too, not only at its hide
--    (the debate's owner excepted: their DEBATE_DECIDED already says that all of it stays off).
-- 3. BOTH. A piece the review took out itself (a dig removed, a report hidden) was told its end then (CONTRIBUTION_REMOVED, REPORT_REMOVED): it adds
--    nothing here. The end waits until every hide and dig taken out of this review has had its own statements (as 0172's decision waits for its hide),
--    so nobody is told the end before the start. The facts staff typed stay the debate owner's: none of these kinds carries them, nor their deleted
--    flag (the reader below, which also stops showing that flag on the AFFECTED kinds, whose facts were never shown).
-- The mail and the page now give each final notice its country and its duration, and say that the ground is the other content's, not theirs
-- (packages/mail-templates, apps/ui); the language is the person's own, as for every statement (identity.state_moderation).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it restates 0172's identity.queue_moderation_statements and identity.read_own_moderation_statements in place and swaps 0157's kind
--                   CHECK on identity.moderation_statement again; 0157's postcondition digests all three (amendsPostconditionsOf), so the release that
--                   carries it must be a drained upload. The two functions keep their signatures and results, so the release before's sender and page
--                   still work beside it; a statement of a new kind it cannot name is one it never reads (its claim reads the kind as text).
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The four kinds ------------------------------------------------------------------------------------------------------------------
-- 0172's nine, and the two ends of a re-publish for a contribution and for a report. Validated: every stored row is one of the nine.
ALTER TABLE identity.moderation_statement DROP CONSTRAINT IF EXISTS moderation_statement_kind_check;
ALTER TABLE identity.moderation_statement ADD CONSTRAINT moderation_statement_kind_check
  CHECK (kind IN ('DEBATE_HIDDEN','DEBATE_DECIDED','CONTRIBUTION_REMOVED','REPORT_REMOVED','CORRECTED','CONTRIBUTION_AFFECTED','REPORT_AFFECTED','CONTRIBUTION_DECIDED','REPORT_DECIDED',
    'CONTRIBUTION_KEPT_OFF','REPORT_KEPT_OFF','CONTRIBUTION_BACK','REPORT_BACK'));

-- 2. The queue ---------------------------------------------------------------------------------------------------------------------
-- 0172's body (M5's block per source, M3's decision), with three changes, each marked "0175": a re-publish waits for its review's statements and
-- then tells the end (section 1 of the header); a decision waits for all of them and tells those of a dig taken out too (2); neither tells a piece the
-- review took out itself (3). CREATE OR REPLACE keeps its owner and its grants (none but its owner's); the contract below checks the body by its digest.
CREATE OR REPLACE FUNCTION identity.queue_moderation_statements() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_review_event%ROWTYPE; d identity.moderation_decision%ROWTYPE; v_count integer := 0; v_owner uuid; v_row record; v_since timestamptz;
  v_state text; v_tries integer; v_hide uuid; v_hide_at timestamptz; v_hide_rev integer;
BEGIN
  SELECT start.since INTO v_since FROM identity.moderation_statement_since AS start;
  FOR v IN SELECT event.* FROM identity.public_review_event AS event
    WHERE event.recorded_at >= v_since AND event.action IN ('HIDE','REMOVE_DIG','HIDE_REPORT','REPUBLISH')
      AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = event.event_id)
      AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_stuck AS stuck WHERE stuck.source_id = event.event_id AND stuck.last_failed_at > clock_timestamp() - interval '1 hour')
    ORDER BY event.recorded_at, event.event_id LIMIT 200 LOOP
    -- M5: this source's work, alone. What it wrote goes back if it raises; the others go on.
    BEGIN
      IF v.action = 'REPUBLISH' THEN
        -- 0175: the review this re-publish ends began at the latest hide before it. Told the end before every hide and dig taken out of it has its own
        -- statements (one stuck, or beyond this call's 200), a person would never hear the start; so it is left unseen and not raised, and the next pass takes it.
        SELECT hide.event_id, hide.revision INTO v_hide, v_hide_rev FROM identity.public_review_event AS hide
          WHERE hide.publication_ref = v.publication_ref AND hide.action = 'HIDE' AND hide.revision < v.revision ORDER BY hide.revision DESC LIMIT 1;
        IF EXISTS (SELECT 1 FROM identity.public_review_event AS cause WHERE cause.publication_ref = v.publication_ref AND cause.action IN ('HIDE','REMOVE_DIG')
            AND cause.revision >= v_hide_rev AND cause.revision < v.revision AND cause.recorded_at >= v_since
            AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = cause.event_id)) THEN CONTINUE; END IF;
      END IF;
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
        -- 0175: the end, for each person told at this review's hide or at a dig taken out during it that a piece of theirs left the page with other
        -- content, once per kind of piece. A piece the review took out itself was told its end then. A piece is kept off, at this re-publish's revision,
        -- by 0150's rules: a dig the hide detached (its ground the hide), a row of it written after a dig taken out and before that removal, or a report
        -- asked for in that time, not put back since (its ground the removal), or a report the hide stopped (its ground the hide). One kept off: the
        -- person hears what stays off, with those grounds; none: that it is back, beside the steps that had taken it off.
        FOR v_row IN WITH told AS (
            SELECT affected.owner_ref, affected.piece_kind, affected.piece_id, affected.event_id FROM identity.moderation_statement AS affected
              JOIN identity.public_review_event AS cause ON cause.event_id = affected.event_id
            WHERE cause.publication_ref = v.publication_ref AND cause.revision >= v_hide_rev AND cause.revision < v.revision
              AND affected.kind IN ('CONTRIBUTION_AFFECTED','REPORT_AFFECTED')
              AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS own WHERE own.publication_ref = v.publication_ref AND own.revision < v.revision
                AND own.piece_id = affected.piece_id AND own.action = CASE affected.piece_kind WHEN 'DIG' THEN 'REMOVE_DIG' ELSE 'HIDE_REPORT' END)
          ), kept AS (
            SELECT piece.owner_ref, piece.piece_kind, held.event_id FROM (SELECT DISTINCT told.owner_ref, told.piece_kind, told.piece_id FROM told) AS piece
            CROSS JOIN LATERAL (
                SELECT hide.event_id FROM identity.public_review_detached AS detached
                  JOIN identity.public_review_event AS hide ON hide.publication_ref = detached.publication_ref AND hide.revision = detached.revision AND hide.action = 'HIDE'
                WHERE piece.piece_kind = 'DIG' AND detached.dig_run_id = piece.piece_id AND detached.revision < v.revision
              UNION
                SELECT removal.event_id FROM identity.public_review_event AS removal JOIN identity.public_debate_update AS update_row ON update_row.publication_ref = removal.publication_ref
                WHERE piece.piece_kind = 'DIG' AND removal.publication_ref = v.publication_ref AND removal.action = 'REMOVE_DIG' AND removal.revision < v.revision
                  AND update_row.dig_run_id = piece.piece_id AND removal.piece_id IS DISTINCT FROM piece.piece_id AND update_row.recorded_at <= removal.recorded_at
                  AND update_row.update_seq > (SELECT min(first_row.update_seq) FROM identity.public_debate_update AS first_row WHERE first_row.publication_ref = v.publication_ref AND first_row.dig_run_id = removal.piece_id)
                  AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS back WHERE back.publication_ref = v.publication_ref AND back.action = 'PUT_BACK'
                    AND back.piece_id = update_row.update_id AND back.revision > removal.revision AND back.revision < v.revision)
              UNION
                SELECT v_hide FROM identity.public_report AS report WHERE piece.piece_kind = 'REPORT' AND report.report_id = piece.piece_id AND report.failure_code = 'PUBLIC_REVIEW_HOLD'
              UNION
                SELECT removal.event_id FROM identity.public_review_event AS removal JOIN identity.public_report AS report ON report.report_id = piece.piece_id
                WHERE piece.piece_kind = 'REPORT' AND removal.publication_ref = v.publication_ref AND removal.action = 'REMOVE_DIG' AND removal.revision < v.revision
                  AND report.requested_at <= removal.recorded_at
                  AND report.requested_at > (SELECT min(first_row.recorded_at) FROM identity.public_debate_update AS first_row WHERE first_row.publication_ref = v.publication_ref AND first_row.dig_run_id = removal.piece_id)
                  AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS back WHERE back.publication_ref = v.publication_ref AND back.action = 'PUT_BACK'
                    AND back.piece_id = report.report_id AND back.revision > removal.revision AND back.revision < v.revision)
            ) AS held(event_id)
            WHERE held.event_id IS NOT NULL
          )
          SELECT told.owner_ref, told.piece_kind, array_agg(DISTINCT told.event_id) AS told_events,
            (SELECT array_agg(DISTINCT kept.event_id) FROM kept WHERE kept.owner_ref = told.owner_ref AND kept.piece_kind = told.piece_kind) AS kept_events
          FROM told GROUP BY told.owner_ref, told.piece_kind LOOP
          IF v_row.kept_events IS NOT NULL THEN
            PERFORM identity.state_moderation(v_row.owner_ref, CASE v_row.piece_kind WHEN 'DIG' THEN 'CONTRIBUTION_KEPT_OFF' ELSE 'REPORT_KEPT_OFF' END, v.publication_ref, v.event_id, NULL,
              v_row.kept_events, NULL, NULL, NULL, v.recorded_at);
          ELSE
            PERFORM identity.state_moderation(v_row.owner_ref, CASE v_row.piece_kind WHEN 'DIG' THEN 'CONTRIBUTION_BACK' ELSE 'REPORT_BACK' END, v.publication_ref, v.event_id, NULL,
              v_row.told_events, NULL, NULL, NULL, v.recorded_at);
          END IF;
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
      -- M3 (owner's decision D, 10 Nov 2026): the hide this decision makes final is the latest HIDE up to the decision with no REPUBLISH after it. Each person
      -- told in this review that their dig (CONTRIBUTION_AFFECTED) or report (REPORT_AFFECTED) left the page with other content is told the final decision,
      -- once per kind however many pieces they had (the earlier statements name the pieces): no places, no piece. state_moderation skips an erased account (D8).
      SELECT hide.event_id, hide.recorded_at, hide.revision INTO v_hide, v_hide_at, v_hide_rev FROM identity.public_review_event AS hide
        WHERE hide.publication_ref = d.publication_ref AND hide.action = 'HIDE' AND hide.revision <= d.revision
          AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS back WHERE back.publication_ref = d.publication_ref AND back.action = 'REPUBLISH'
            AND back.revision > hide.revision AND back.revision <= d.revision)
        ORDER BY hide.revision DESC LIMIT 1;
      -- M3: a decision waits for its review's own statements (stuck for an hour, or beyond this call's 200): told now, the final statements would never follow.
      -- It is left unseen and not raised (that would alert), so the next pass takes it. A step from before the watch began never waits. 0175: the review's
      -- digs taken out, not only its hide.
      IF EXISTS (SELECT 1 FROM identity.public_review_event AS cause WHERE cause.publication_ref = d.publication_ref AND cause.action IN ('HIDE','REMOVE_DIG')
          AND cause.revision >= v_hide_rev AND cause.revision <= d.revision AND cause.recorded_at >= v_since
          AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = cause.event_id)) THEN CONTINUE; END IF;
      INSERT INTO identity.moderation_statement_seen (source_id) VALUES (d.decision_id) ON CONFLICT (source_id) DO NOTHING;
      IF NOT FOUND THEN CONTINUE; END IF;
      PERFORM identity.state_moderation(identity.moderation_debate_owner(d.publication_ref), 'DEBATE_DECIDED', d.publication_ref, NULL, d.decision_id, '{}'::uuid[], NULL, NULL, NULL, d.recorded_at);
      -- 0175: those told at this review's hide or at a dig taken out during it, but not for a piece the review took out itself (told its end then), and
      -- not the debate's owner, whose DEBATE_DECIDED above already says all of it stays off (a dig taken out tells them of their own later rows too).
      FOR v_row IN SELECT DISTINCT affected.owner_ref, CASE affected.kind WHEN 'CONTRIBUTION_AFFECTED' THEN 'CONTRIBUTION_DECIDED' ELSE 'REPORT_DECIDED' END AS kind
        FROM identity.moderation_statement AS affected JOIN identity.public_review_event AS cause ON cause.event_id = affected.event_id
        WHERE cause.publication_ref = d.publication_ref AND cause.revision >= v_hide_rev AND cause.revision <= d.revision AND affected.kind IN ('CONTRIBUTION_AFFECTED','REPORT_AFFECTED')
          AND affected.owner_ref IS DISTINCT FROM identity.moderation_debate_owner(d.publication_ref)
          AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS own WHERE own.publication_ref = d.publication_ref AND own.revision <= d.revision
            AND own.piece_id = affected.piece_id AND own.action = CASE affected.piece_kind WHEN 'DIG' THEN 'REMOVE_DIG' ELSE 'HIDE_REPORT' END) LOOP
        PERFORM identity.state_moderation(v_row.owner_ref, v_row.kind, d.publication_ref, NULL, d.decision_id, '{}'::uuid[], NULL, NULL, NULL, d.recorded_at);
      END LOOP;
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

-- 3. The page's reader -------------------------------------------------------------------------------------------------------------
-- 0172's body (the data export reads it too), with one edit: the facts and their deleted flag are the debate owner's and the person's own step's
-- (DEBATE_HIDDEN, DEBATE_DECIDED, CONTRIBUTION_REMOVED, REPORT_REMOVED, CORRECTED). The kinds told because their content left with other content
-- (the AFFECTED, DECIDED, KEPT_OFF and BACK kinds) carry neither: 0172 left the flag on the AFFECTED kinds of a dig taken out, twelve months on.
-- Same signature, owner and grants (CREATE OR REPLACE keeps them).
CREATE OR REPLACE FUNCTION identity.read_own_moderation_statements(p_owner_ref uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('statement_id', s.statement_id, 'kind', s.kind, 'publication_ref', s.publication_ref,
      'run_id', core.run_of_publication(s.publication_ref), 'happened_at', s.happened_at, 'piece_kind', s.piece_kind, 'places', s.places,
      'ground', identity.moderation_statement_ground(s.statement_id), 'hidden_now', identity.public_review_held(s.publication_ref),
      'facts', CASE WHEN s.kind NOT IN ('DEBATE_HIDDEN','DEBATE_DECIDED','CONTRIBUTION_REMOVED','REPORT_REMOVED','CORRECTED') THEN '[]'::jsonb
        WHEN s.decision_id IS NOT NULL THEN (SELECT jsonb_build_array(decision.facts_ciphertext) FROM identity.moderation_decision AS decision WHERE decision.decision_id = s.decision_id)
        ELSE COALESCE((SELECT jsonb_agg(ground.facts_ciphertext ORDER BY ground.recorded_at) FROM identity.moderation_ground AS ground
          WHERE ground.event_id = ANY (s.ground_events) AND ground.facts_ciphertext IS NOT NULL), '[]'::jsonb) END,
      'facts_deleted', s.kind IN ('DEBATE_HIDDEN','DEBATE_DECIDED','CONTRIBUTION_REMOVED','REPORT_REMOVED','CORRECTED')
        AND (EXISTS (SELECT 1 FROM identity.moderation_ground AS ground WHERE ground.event_id = ANY (s.ground_events) AND ground.facts_deleted_at IS NOT NULL)
          OR EXISTS (SELECT 1 FROM identity.moderation_decision AS decision WHERE decision.decision_id = s.decision_id AND decision.facts_deleted_at IS NOT NULL)),
      'quote', CASE WHEN s.kind = 'DEBATE_HIDDEN' THEN (SELECT quote.quote_ciphertext FROM identity.public_review_event AS event JOIN identity.public_flag_quote AS quote ON quote.flag_id = event.operation_id
        WHERE event.event_id = ANY (s.ground_events) AND event.actor_staff_id = '00000000-0000-0000-0000-000000000000'::uuid LIMIT 1) END)
    ORDER BY s.happened_at DESC, s.statement_id), '[]'::jsonb)
  FROM identity.moderation_statement AS s WHERE s.owner_ref = p_owner_ref AND p_owner_ref IS NOT NULL
$$;

-- The contract: the end state, checked as the step applies ------------------------------------------------------------------------------
-- One CHECK on the kind under 0157's name, with the thirteen kinds. The queue and the reader are this file's bodies (by digest), 0150's identity
-- owner's, definers with 0157's settings; the queue granted to nobody but its owner, the reader to the runtime (the page and the export).
DO $moderation_final_outcome_contract$
DECLARE v_owner oid; v_grantees name[];
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  IF (SELECT pg_catalog.pg_get_constraintdef(k.oid) FROM pg_catalog.pg_constraint AS k
      WHERE k.conrelid = 'identity.moderation_statement'::regclass AND k.conname = 'moderation_statement_kind_check' AND k.contype = 'c' AND k.convalidated)
      IS DISTINCT FROM 'CHECK ((kind = ANY (ARRAY[''DEBATE_HIDDEN''::text, ''DEBATE_DECIDED''::text, ''CONTRIBUTION_REMOVED''::text, ''REPORT_REMOVED''::text, ''CORRECTED''::text, ''CONTRIBUTION_AFFECTED''::text, ''REPORT_AFFECTED''::text, ''CONTRIBUTION_DECIDED''::text, ''REPORT_DECIDED''::text, ''CONTRIBUTION_KEPT_OFF''::text, ''REPORT_KEPT_OFF''::text, ''CONTRIBUTION_BACK''::text, ''REPORT_BACK''::text])))'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'identity.moderation_statement'::regclass AND k.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(k.oid) LIKE '%DEBATE_DECIDED%') <> 1 THEN
    RAISE EXCEPTION 'MODERATION_FINAL_OUTCOME_0175_CONTRACT statement kind';
  END IF;
  IF (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_catalog.pg_proc AS p
        WHERE p.oid = 'identity.queue_moderation_statements()'::regprocedure) IS DISTINCT FROM '6b0bdd890c73fda3608f6c0455bbe0073491ed2ecf0b8a8ac7d8fc8b2f99ef1d'
    OR (SELECT p.proowner = v_owner AND p.prosecdef AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=pg_catalog'] AND p.prorettype = 'integer'::regtype
      FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.queue_moderation_statements()'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'MODERATION_FINAL_OUTCOME_0175_CONTRACT queue';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')) INTO v_grantees
  FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
  WHERE p.oid = 'identity.queue_moderation_statements()'::regprocedure AND a.grantee <> p.proowner;
  IF v_grantees IS NOT NULL THEN RAISE EXCEPTION 'MODERATION_FINAL_OUTCOME_0175_CONTRACT queue granted %', v_grantees; END IF;
  IF (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_catalog.pg_proc AS p
        WHERE p.oid = 'identity.read_own_moderation_statements(uuid)'::regprocedure) IS DISTINCT FROM 'e991591f3dc50f9838b8ec2d1b49f1b7db7658e3bd4cbc058e8cf6128ebf82b2'
    OR (SELECT p.proowner = v_owner AND p.prosecdef AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=pg_catalog'] AND p.prorettype = 'jsonb'::regtype
      FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_own_moderation_statements(uuid)'::regprocedure) IS NOT TRUE
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', 'identity.read_own_moderation_statements(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MODERATION_FINAL_OUTCOME_0175_CONTRACT reader';
  END IF;
END
$moderation_final_outcome_contract$;
