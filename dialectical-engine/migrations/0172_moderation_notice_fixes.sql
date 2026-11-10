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
END
$moderation_notice_fixes_contract$;
