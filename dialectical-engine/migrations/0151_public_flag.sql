-- 0151 · The Report button on a public debate, and the sealed originals' six months (test-site release R22; plan docs/superpowers/plans/2026-10-31-r22-owner-changes.md decisions 35 and 36).
--
-- Plain words. A signed-in person says what is wrong and where. Their words are sealed under the publication's key. An AI reads them beside the public text (the API's half); if it agrees the debate hides at once,
-- through 0150's own hide with no staff person named, and waits for the two accounts. If it does not, the person hears one line, the same whatever the reason. A report goes straight to a person when: the debate was ever hidden
-- (one automatic hide, and none after a re-publish), this person already reported this debate, or the debate's or the site's checks for the window are used up. A check that cannot answer never hides: the report goes to a person.
-- THE LIMITS are the API's (apps/api/src/public-flag.ts LIMITS, for the Hide-limits lane to move) and are enforced here, under locks, from the rows: they survive restarts, and no number is in this file.
-- THE REPORTER: named only to the two accounts, each read logged; erasing the account takes the link (SET NULL) and keeps the words. THE WORDS: deleted six months after the report is closed; an open report keeps them until a person closes it.
--
-- DECISION 36. Six months after a correction or a removal the original goes: the page's sealed copy is replaced by what the page shows (or an empty one for a piece off the page), and identity.public_review_purged keeps the digest, not the text.
-- Older corrections to the same place, and the copies of the page sealed for old digs (public_material), go with it. These rows are append-only by trigger; the purge disables the trigger inside its own transaction, as 0129 does in a step, and only the two definers below can.
-- A digger's own run stays their record; a removed dig's text there goes with their account, as any private text.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it replaces staff functions every release calls (the proof's action lists).
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The records -----------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_flag (
  flag_id uuid PRIMARY KEY,
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  reporter_ref uuid REFERENCES identity."user"(owner_ref) ON DELETE SET NULL,
  state text NOT NULL CONSTRAINT public_flag_state_check CHECK (state IN ('CHECKING','QUEUED','NOT_FOUND','HIDDEN')),
  verdict text CONSTRAINT public_flag_verdict_check CHECK (verdict IN ('AGREE','NOT_FOUND','UNSURE','UNAVAILABLE')),
  reason text CONSTRAINT public_flag_reason_check CHECK (reason IN ('CONTENT','PERSONAL')),
  judge_provider_ref text,
  judge_model_id text,
  input_tokens integer CONSTRAINT public_flag_input_check CHECK (input_tokens >= 0),
  output_tokens integer CONSTRAINT public_flag_output_check CHECK (output_tokens >= 0),
  cost_usd numeric CONSTRAINT public_flag_cost_check CHECK (cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  judged_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid,
  content_ciphertext jsonb CONSTRAINT public_flag_content_check CHECK (content_ciphertext IS NULL OR (
    jsonb_typeof(content_ciphertext) = 'object' AND content_ciphertext->>'v' = '1'
    AND content_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(content_ciphertext->>'nonce') > 0 AND length(content_ciphertext->>'ct') > 0 AND length(content_ciphertext->>'tag') > 0
    AND octet_length(content_ciphertext::text) <= 65536)),
  content_deleted_at timestamptz,
  CONSTRAINT public_flag_content_gone CHECK ((content_ciphertext IS NULL) = (content_deleted_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS public_flag_reporter ON identity.public_flag (reporter_ref, created_at);
CREATE INDEX IF NOT EXISTS public_flag_publication ON identity.public_flag (publication_ref, created_at);
CREATE INDEX IF NOT EXISTS public_flag_created ON identity.public_flag (created_at);
SELECT core.install_truncate_guard('identity.public_flag');
-- A row only moves forward: the name goes, the check's answer once, a dismissal once, the words once. Nothing else, and it is never deleted.
CREATE OR REPLACE FUNCTION identity.guard_public_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_FLAG_APPEND_ONLY'; END IF;
  v_old := pg_catalog.to_jsonb(OLD); v_new := pg_catalog.to_jsonb(NEW);
  IF (v_new - ARRAY['reporter_ref']) = (v_old - ARRAY['reporter_ref']) AND NEW.reporter_ref IS NULL THEN RETURN NEW; END IF;
  IF OLD.state = 'CHECKING' AND NEW.state <> 'CHECKING' AND OLD.judged_at IS NULL AND NEW.judged_at IS NOT NULL
    AND (v_new - ARRAY['state','verdict','reason','judge_provider_ref','judge_model_id','input_tokens','output_tokens','cost_usd','judged_at']) = (v_old - ARRAY['state','verdict','reason','judge_provider_ref','judge_model_id','input_tokens','output_tokens','cost_usd','judged_at']) THEN RETURN NEW; END IF;
  IF OLD.dismissed_at IS NULL AND NEW.dismissed_at IS NOT NULL AND NEW.dismissed_by IS NOT NULL AND (v_new - ARRAY['dismissed_at','dismissed_by']) = (v_old - ARRAY['dismissed_at','dismissed_by']) THEN RETURN NEW; END IF;
  IF OLD.content_ciphertext IS NOT NULL AND NEW.content_ciphertext IS NULL AND (v_new - ARRAY['content_ciphertext','content_deleted_at']) = (v_old - ARRAY['content_ciphertext','content_deleted_at']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_FLAG_APPEND_ONLY';
END $$;
DROP TRIGGER IF EXISTS guard_public_flag ON identity.public_flag;
CREATE TRIGGER guard_public_flag BEFORE UPDATE OR DELETE ON identity.public_flag FOR EACH ROW EXECUTE FUNCTION identity.guard_public_flag();
-- The log of the queue: who read it (the reporters' names are on it), who dismissed what. Cannot be edited.
CREATE TABLE IF NOT EXISTS identity.public_flag_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CONSTRAINT public_flag_event_action_check CHECK (action IN ('READ_QUEUE','DISMISS')),
  flag_id uuid,
  actor_staff_id uuid NOT NULL,
  operation_id uuid CONSTRAINT public_flag_event_operation_once UNIQUE,
  request_sha256 text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SELECT core.install_truncate_guard('identity.public_flag_event');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_flag_event;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_flag_event FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
-- Decision 36's receipt: what went, by digest. No text.
CREATE TABLE IF NOT EXISTS identity.public_review_purged (
  purge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  piece_kind text NOT NULL CONSTRAINT public_review_purged_kind_check CHECK (piece_kind IN ('SNAPSHOT','UPDATE','REPORT')),
  piece_id uuid NOT NULL,
  mode text NOT NULL CONSTRAINT public_review_purged_mode_check CHECK (mode IN ('BAKED','EMPTIED')),
  up_to_revision integer NOT NULL,
  original_sha256 text NOT NULL CONSTRAINT public_review_purged_digest_check CHECK (original_sha256 ~ '^[0-9a-f]{64}$'),
  purged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT public_review_purged_once UNIQUE (piece_kind, piece_id, up_to_revision)
);
SELECT core.install_truncate_guard('identity.public_review_purged');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_review_purged;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_review_purged FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
-- One content-free notice per person, as 0150's, in words of its own: a report waits, or a debate was hidden automatically.
CREATE TABLE IF NOT EXISTS staff.public_flag_notice (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PUBLIC_FLAG_HIDDEN','PUBLIC_FLAG_WAITING')),
  recipient_staff_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  claim_token uuid,
  claim_expires_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  UNIQUE (operation_id, recipient_staff_id),
  CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CHECK (NOT (delivered_at IS NOT NULL AND failed_at IS NOT NULL))
);
ALTER TABLE staff.public_flag_notice OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.public_flag_notice FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
SELECT core.install_truncate_guard('staff.public_flag_notice');
CREATE OR REPLACE FUNCTION staff.queue_public_flag_notices(p_operation uuid,p_kind text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO staff.public_flag_notice(operation_id,kind,recipient_staff_id)
  SELECT p_operation,p_kind,x.staff_id FROM (
    SELECT d.staff_id FROM staff.owner_designation d WHERE d.active
    UNION SELECT h.staff_id FROM staff.team_limit_holder h WHERE h.active) x
  ON CONFLICT (operation_id,recipient_staff_id) DO NOTHING
$$;
CREATE OR REPLACE FUNCTION staff.claim_public_flag_notices(p_limit integer)
RETURNS TABLE(notice_id uuid, kind text, recipient_staff_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'PUBLIC_FLAG_NOTICE_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
  RETURN QUERY WITH picked AS (
    SELECT n.notice_id FROM staff.public_flag_notice n
    WHERE n.delivered_at IS NULL AND n.failed_at IS NULL AND (n.claim_expires_at IS NULL OR n.claim_expires_at<=clock_timestamp())
    ORDER BY n.created_at,n.notice_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE staff.public_flag_notice n SET claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '60 seconds'
    FROM picked WHERE n.notice_id=picked.notice_id RETURNING n.notice_id,n.kind,n.recipient_staff_id,n.claim_token;
END $$;
CREATE OR REPLACE FUNCTION staff.complete_public_flag_notice(p_notice uuid,p_claim uuid,p_delivered boolean) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  UPDATE staff.public_flag_notice SET claim_token=NULL,claim_expires_at=NULL,
    attempts=least(attempts+1,20),
    delivered_at=CASE WHEN p_delivered THEN clock_timestamp() END,
    failed_at=CASE WHEN NOT p_delivered AND attempts>=19 THEN clock_timestamp() END
  WHERE notice_id=p_notice AND claim_token=p_claim AND claim_expires_at>clock_timestamp()
$$;
CREATE OR REPLACE FUNCTION staff.public_flag_notice_user(p_notice uuid,p_claim uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.user_id FROM staff.public_flag_notice n JOIN staff.subject s ON s.staff_id=n.recipient_staff_id
  WHERE n.notice_id=p_notice AND n.claim_token=p_claim AND n.claim_expires_at>clock_timestamp()
$$;

-- 2. The press, then the check's answer (the API's pool) ---------------------------------------------------------------------------
-- What a press may seal under: the debate's run, only when its latest visibility is published (hidden too: a report of a hidden debate goes to a person). Null for anything else, guessed or private.
CREATE OR REPLACE FUNCTION identity.read_public_flag_target(p_publication_ref uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT (found.v->>'run_id')::uuid FROM (SELECT core.public_review_snapshot(p_publication_ref) AS v) AS found WHERE found.v->>'latest_state' = 'PUBLISHED'
$$;
-- LIMITED (nothing is written), NOT_PUBLIC, CHECK (the AI reads it next), QUEUE (a person will).
CREATE OR REPLACE FUNCTION identity.open_public_flag(p_owner_ref uuid, p_publication_ref uuid, p_flag_id uuid, p_content jsonb, p_person_hour integer, p_debate_day integer, p_site_day integer) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_held boolean; v_check boolean;
BEGIN
  IF p_owner_ref IS NULL OR p_publication_ref IS NULL OR p_flag_id IS NULL OR p_content IS NULL OR p_person_hour IS NULL OR p_debate_day IS NULL OR p_site_day IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-flag-person:' || p_owner_ref::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0));
  IF identity.read_public_flag_target(p_publication_ref) IS NULL THEN RETURN 'NOT_PUBLIC'; END IF;
  IF (SELECT count(*) FROM identity.public_flag AS flag WHERE flag.reporter_ref = p_owner_ref AND flag.created_at > clock_timestamp() - interval '1 hour') >= p_person_hour THEN RETURN 'LIMITED'; END IF;
  v_held := identity.public_review_held(p_publication_ref);
  v_check := NOT v_held
    AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref AND event.action = 'HIDE')
    AND NOT EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.publication_ref = p_publication_ref AND flag.reporter_ref = p_owner_ref)
    AND (SELECT count(*) FROM identity.public_flag AS flag WHERE flag.publication_ref = p_publication_ref AND flag.judge_model_id IS NOT NULL AND flag.created_at > clock_timestamp() - interval '1 day') < p_debate_day
    AND (SELECT count(*) FROM identity.public_flag AS flag WHERE flag.state = 'CHECKING' AND flag.publication_ref = p_publication_ref AND flag.created_at > clock_timestamp() - interval '1 day') < p_debate_day
    AND (SELECT count(*) FROM identity.public_flag AS flag WHERE (flag.judge_model_id IS NOT NULL OR flag.state = 'CHECKING') AND flag.created_at > clock_timestamp() - interval '1 day') < p_site_day;
  INSERT INTO identity.public_flag (flag_id, publication_ref, reporter_ref, state, content_ciphertext)
  VALUES (p_flag_id, p_publication_ref, p_owner_ref, CASE WHEN v_check THEN 'CHECKING' ELSE 'QUEUED' END, p_content);
  IF NOT v_check THEN PERFORM staff.queue_public_flag_notices(p_flag_id, 'PUBLIC_FLAG_WAITING'); END IF;
  RETURN CASE WHEN v_check THEN 'CHECK' ELSE 'QUEUE' END;
END $$;
-- The check's answer, once. HIDDEN (it agreed, and this was the debate's first hide), QUEUED, NOT_FOUND. Only AGREE on a debate never hidden hides anything; anything else a person reads.
CREATE OR REPLACE FUNCTION identity.settle_public_flag(p_flag_id uuid, p_verdict text, p_reason text, p_provider text, p_model text, p_input integer, p_output integer, p_cost numeric) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_flag%ROWTYPE; v_state text; v_revision integer;
BEGIN
  IF p_flag_id IS NULL OR p_verdict IS NULL OR p_verdict NOT IN ('AGREE','NOT_FOUND','UNSURE','UNAVAILABLE') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_INVALID'; END IF;
  SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_INVALID'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || v.publication_ref::text, 0));
  SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id FOR UPDATE;
  IF v.state <> 'CHECKING' THEN RETURN v.state; END IF;
  v_state := CASE p_verdict WHEN 'NOT_FOUND' THEN 'NOT_FOUND' ELSE 'QUEUED' END;
  IF p_verdict = 'AGREE' AND identity.read_public_flag_target(v.publication_ref) IS NOT NULL AND NOT identity.public_review_held(v.publication_ref)
    AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.publication_ref = v.publication_ref AND event.action = 'HIDE') THEN
    SELECT COALESCE(max(event.revision), 0) INTO v_revision FROM identity.public_review_event AS event WHERE event.publication_ref = v.publication_ref;
    -- 0150's own hide. No staff person did this: the nil id says "the automatic check", and the operation is the report's own.
    PERFORM identity.public_review_apply('00000000-0000-0000-0000-000000000000'::uuid, 'HIDE', v.publication_ref, NULL, NULL, NULL, NULL, NULL, v_revision, p_flag_id,
      encode(sha256(convert_to(p_flag_id::text,'UTF8')),'hex'));
    v_state := 'HIDDEN';
  END IF;
  UPDATE identity.public_flag SET state = v_state, verdict = p_verdict, reason = p_reason, judge_provider_ref = p_provider, judge_model_id = p_model,
    input_tokens = p_input, output_tokens = p_output, cost_usd = p_cost, judged_at = clock_timestamp() WHERE flag_id = p_flag_id;
  IF v_state = 'HIDDEN' THEN PERFORM staff.queue_public_flag_notices(p_flag_id, 'PUBLIC_FLAG_HIDDEN');
  ELSIF v_state = 'QUEUED' THEN PERFORM staff.queue_public_flag_notices(p_flag_id, 'PUBLIC_FLAG_WAITING'); END IF;
  RETURN v_state;
END $$;

-- 3. The queue, for the two accounts ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION identity.public_flag_queue() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('flag_id', row_found.flag_id, 'publication_ref', row_found.publication_ref, 'run_id', core.run_of_publication(row_found.publication_ref),
      'reporter', (SELECT identity_user.pseudonym FROM identity."user" AS identity_user WHERE identity_user.owner_ref = row_found.reporter_ref),
      'state', row_found.state, 'verdict', row_found.verdict, 'reason', row_found.reason, 'created_at', row_found.created_at, 'judged_at', row_found.judged_at,
      'dismissed_at', row_found.dismissed_at, 'content', row_found.content_ciphertext, 'debate_hidden', identity.public_review_held(row_found.publication_ref)) ORDER BY row_found.created_at DESC), '[]'::jsonb)
  FROM (SELECT flag.* FROM identity.public_flag AS flag ORDER BY (flag.dismissed_at IS NULL AND flag.state <> 'NOT_FOUND') DESC, flag.created_at DESC LIMIT 200) AS row_found
$$;
CREATE OR REPLACE FUNCTION identity.public_flag_mark_read(p_actor uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO identity.public_flag_event (action, actor_staff_id) VALUES ('READ_QUEUE', p_actor)
$$;
CREATE OR REPLACE FUNCTION identity.public_flag_dismiss(p_flag_id uuid, p_actor uuid, p_operation uuid, p_request_sha256 text) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_flag%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PIECE_UNKNOWN'; END IF;
  IF v.dismissed_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_ALREADY_DISMISSED'; END IF;
  UPDATE identity.public_flag SET dismissed_at = v_at, dismissed_by = p_actor WHERE flag_id = p_flag_id;
  INSERT INTO identity.public_flag_event (action, flag_id, actor_staff_id, operation_id, request_sha256) VALUES ('DISMISS', p_flag_id, p_actor, p_operation, p_request_sha256);
  RETURN v_at;
END $$;
CREATE OR REPLACE FUNCTION identity.public_flag_replay(p_operation uuid, p_request_sha256 text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_flag_event%ROWTYPE;
BEGIN
  SELECT * INTO v FROM identity.public_flag_event AS event WHERE event.operation_id = p_operation;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v.request_sha256 IS DISTINCT FROM p_request_sha256 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='STAFF_OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('operationId', v.operation_id, 'outcome', 'COMPLETED', 'recordedAt', v.recorded_at);
END $$;
CREATE OR REPLACE FUNCTION staff.read_public_flag_queue(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  PERFORM identity.public_flag_mark_read((p_context->>'staffId')::uuid);
  v := identity.public_flag_queue();
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION staff.public_flag_dismiss(p_context jsonb,p_proof uuid,p_binding jsonb,p_flag uuid,p_operation uuid,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid; v_request jsonb; v_sha text; v_replay jsonb; v_at timestamptz;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  IF staff.authorize_action(p_context,'TEAM_LIMIT_SET') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  IF p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;
  IF p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(register.canonical_json_text(json_build_object('action','PUBLIC_REPORT_DISMISS','target_id',p_flag::text,'expected_revision',0,'operation_id',p_operation::text)::text),'UTF8')),'hex')
    OR p_binding->'expectedRevision' IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID';
  END IF;
  v_request:=jsonb_build_array(v_staff,p_binding,p_flag,p_operation);
  v_sha:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
  v_replay:=identity.public_flag_replay(p_operation,v_sha);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET','PUBLIC_REPORT_DISMISS',p_flag,p_operation);
  v_at:=identity.public_flag_dismiss(p_flag,v_staff,p_operation,v_sha);
  PERFORM staff.record_mutation(p_operation,'PUBLIC_REVIEW_CHANGED',v_staff,v_staff,jsonb_build_object('code','SECURITY_RESPONSE'),v_user,p_alert,v_request);
  RETURN jsonb_build_object('operationId',p_operation,'outcome','COMPLETED','recordedAt',v_at);
END $$;

-- 4. Six months (the API's sweep; debateai_runtime) ---------------------------------------------------------------------------------
-- A report's words, six months after it was closed. An open report keeps them: a person has not read it yet. Returns how many went.
CREATE OR REPLACE FUNCTION identity.delete_public_flag_words_due() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE identity.public_flag SET content_ciphertext = NULL, content_deleted_at = clock_timestamp()
  WHERE content_ciphertext IS NOT NULL AND COALESCE(dismissed_at, CASE WHEN state = 'NOT_FOUND' THEN judged_at END) < clock_timestamp() - interval '6 months';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;
-- Pieces whose original is due: [{publication_ref, run_id, piece_kind, piece_id, mode, up_to_revision, content, corrections: [{pointer, content}]}].
-- BAKED: a correction is six months old: the page's text becomes the piece. EMPTIED: a piece off the page six months after the removal or the hide that took it off. A debate hidden and never corrected has nothing due:
-- it was not corrected or removed, so the page tells the two how long it has been hidden, and they decide.
CREATE OR REPLACE FUNCTION identity.read_public_review_purge_due(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_LIST_INVALID'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(due)) FROM (
    SELECT candidate.publication_ref, core.run_of_publication(candidate.publication_ref) AS run_id, candidate.piece_kind, candidate.piece_id, candidate.mode, candidate.up_to_revision,
      CASE candidate.piece_kind WHEN 'SNAPSHOT' THEN core.public_review_snapshot(candidate.publication_ref)->'content'
        WHEN 'UPDATE' THEN (SELECT update_row.content_ciphertext FROM identity.public_debate_update AS update_row WHERE update_row.update_id = candidate.piece_id)
        ELSE (SELECT copy.content_ciphertext FROM identity.public_debate_report AS copy WHERE copy.report_id = candidate.piece_id) END AS content,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('pointer', newest.pointer, 'content', newest.content_ciphertext)) FROM (
        SELECT DISTINCT ON (correction.pointer) correction.pointer, correction.content_ciphertext FROM identity.public_review_correction AS correction
        WHERE correction.publication_ref = candidate.publication_ref AND correction.piece_kind = candidate.piece_kind AND correction.piece_id = candidate.piece_id
        ORDER BY correction.pointer, correction.revision DESC) AS newest), '[]'::jsonb) AS corrections
    FROM (
      SELECT correction.publication_ref, correction.piece_kind, correction.piece_id, 'BAKED'::text AS mode, max(correction.revision) AS up_to_revision
      FROM identity.public_review_correction AS correction
      WHERE correction.recorded_at <= clock_timestamp() - interval '6 months'
      GROUP BY correction.publication_ref, correction.piece_kind, correction.piece_id
      UNION ALL
      SELECT update_row.publication_ref, 'UPDATE', update_row.update_id, 'EMPTIED', max(removal.revision)
      FROM identity.public_debate_update AS update_row
        JOIN identity.public_review_event AS removal ON removal.publication_ref = update_row.publication_ref AND removal.action = 'REMOVE_DIG'
      WHERE removal.recorded_at <= clock_timestamp() - interval '6 months'
        AND identity.public_review_row_off(update_row.publication_ref, update_row.update_id, update_row.dig_run_id, update_row.update_seq)
      GROUP BY update_row.publication_ref, update_row.update_id
      UNION ALL
      SELECT copy.publication_ref, 'REPORT', copy.report_id, 'EMPTIED', max(event.revision)
      FROM identity.public_debate_report AS copy JOIN identity.public_report AS report ON report.report_id = copy.report_id
        JOIN identity.public_review_event AS event ON event.publication_ref = copy.publication_ref AND event.action IN ('REMOVE_DIG','HIDE_REPORT')
      WHERE event.recorded_at <= clock_timestamp() - interval '6 months'
        AND identity.public_review_report_off(copy.publication_ref, copy.report_id, report.requested_at)
      GROUP BY copy.publication_ref, copy.report_id
    ) AS candidate
    WHERE NOT EXISTS (SELECT 1 FROM identity.public_review_purged AS done WHERE done.piece_kind = candidate.piece_kind AND done.piece_id = candidate.piece_id AND done.up_to_revision >= candidate.up_to_revision
        AND (done.mode = 'EMPTIED' OR candidate.mode = 'BAKED'))
    ORDER BY candidate.publication_ref, candidate.up_to_revision LIMIT p_limit) AS due), '[]'::jsonb);
END $$;
-- The snapshot's own row; 0039's table keeps its owner.
CREATE OR REPLACE FUNCTION core.public_review_replace_snapshot(p_publication_ref uuid, p_content jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  ALTER TABLE serve.publication_snapshot DISABLE TRIGGER reject_mutation;
  UPDATE serve.publication_snapshot SET content_ciphertext = p_content WHERE publication_ref = p_publication_ref;
  ALTER TABLE serve.publication_snapshot ENABLE TRIGGER reject_mutation;
END $$;
-- One piece's original goes; the receipt holds its digest. The caller computed both under the publication's key. Refuses anything not due: the reader's rule is checked again here.
CREATE OR REPLACE FUNCTION identity.public_review_purge(p_publication_ref uuid, p_piece_kind text, p_piece_id uuid, p_mode text, p_up_to_revision integer, p_content jsonb, p_original_sha256 text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_event_at timestamptz;
BEGIN
  IF p_publication_ref IS NULL OR p_piece_kind IS NULL OR p_piece_id IS NULL OR p_mode IS NULL OR p_up_to_revision IS NULL OR p_content IS NULL OR p_original_sha256 IS NULL
    OR p_content->>'keyId' IS DISTINCT FROM 'publication-snapshot:' || p_publication_ref::text || ':v1' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PURGE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0));
  SELECT event.recorded_at INTO v_event_at FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref AND event.revision = p_up_to_revision;
  IF NOT FOUND OR v_event_at > clock_timestamp() - interval '6 months' THEN RETURN 'NOT_DUE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.public_review_purged AS done WHERE done.piece_kind = p_piece_kind AND done.piece_id = p_piece_id AND done.up_to_revision = p_up_to_revision) THEN RETURN 'ALREADY'; END IF;
  IF p_piece_kind = 'SNAPSHOT' THEN
    IF p_piece_id <> p_publication_ref THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PURGE_INVALID'; END IF;
    PERFORM core.public_review_replace_snapshot(p_publication_ref, p_content);
  ELSIF p_piece_kind = 'UPDATE' THEN
    ALTER TABLE identity.public_debate_update DISABLE TRIGGER reject_mutation;
    UPDATE identity.public_debate_update SET content_ciphertext = p_content WHERE update_id = p_piece_id AND publication_ref = p_publication_ref;
    ALTER TABLE identity.public_debate_update ENABLE TRIGGER reject_mutation;
  ELSE
    ALTER TABLE identity.public_debate_report DISABLE TRIGGER reject_mutation;
    UPDATE identity.public_debate_report SET content_ciphertext = p_content WHERE report_id = p_piece_id AND publication_ref = p_publication_ref;
    ALTER TABLE identity.public_debate_report ENABLE TRIGGER reject_mutation;
  END IF;
  -- Older corrections to the same places held earlier words; the newest stays, and it now repeats the piece.
  ALTER TABLE identity.public_review_correction DISABLE TRIGGER reject_mutation;
  DELETE FROM identity.public_review_correction AS older WHERE older.publication_ref = p_publication_ref AND older.piece_kind = p_piece_kind AND older.piece_id = p_piece_id
    AND older.revision < (SELECT max(newest.revision) FROM identity.public_review_correction AS newest WHERE newest.publication_ref = older.publication_ref AND newest.piece_kind = older.piece_kind
      AND newest.piece_id = older.piece_id AND newest.pointer = older.pointer);
  ALTER TABLE identity.public_review_correction ENABLE TRIGGER reject_mutation;
  -- The copies of the page sealed for digs from before this step held the original too.
  PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'on', true);
  DELETE FROM identity.public_material AS material WHERE material.publication_ref = p_publication_ref AND material.recorded_at <= v_event_at;
  PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'off', true);
  INSERT INTO identity.public_review_purged (publication_ref, piece_kind, piece_id, mode, up_to_revision, original_sha256) VALUES (p_publication_ref, p_piece_kind, p_piece_id, p_mode, p_up_to_revision, p_original_sha256);
  RETURN 'PURGED';
END $$;

-- 5. Staff's proof gains the dismissal (each redefined in place, declared as an amendment) -----------------------------------------
CREATE OR REPLACE FUNCTION staff.owned_action_allowed(p_context jsonb,p_binding jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(CASE
    WHEN p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE') THEN p_binding->>'targetId'=p_context->>'userId'
    WHEN p_binding->>'action' IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE') THEN staff.authorize_action(p_context,p_binding->>'action')
      AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active)
    WHEN p_binding->>'action'='EMERGENCY_DISABLE' THEN staff.authorize_action(p_context,'EMERGENCY_DISABLE')
    WHEN p_binding->>'action' IN('ALLOWANCE_CONFIGURE','ALLOWANCE_REVOKE') THEN staff.authorize_action(p_context,'ALLOWANCE_WRITE')
    WHEN p_binding->>'action' IN ('PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE') THEN staff.authorize_action(p_context,'PUBLICATION_REVIEW')
    WHEN p_binding->>'action' IN ('THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED') THEN staff.authorize_action(p_context,'THREAT_REPORT')
    WHEN p_binding->>'action' IN ('TEAM_LIMIT_SET','TEAM_PRACTICE_RECORD','PUBLIC_REVIEW_HIDE','PUBLIC_REVIEW_STEP','PUBLIC_REPORT_DISMISS') THEN staff.authorize_action(p_context,'TEAM_LIMIT_SET')
    WHEN p_binding->>'action' IN ('TEAM_LIMIT_PARTNER_GRANT','TEAM_LIMIT_PARTNER_REVOKE') THEN staff.authorize_action(p_context,'TEAM_GRANT')
      AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active)
    ELSE false END,false)
$$;

CREATE OR REPLACE FUNCTION staff.begin_owned_webauthn(p_user uuid,p_base uuid,p_purpose text,p_hash text,p_handle text,p_rp text,p_origin text,p_user_handle text,p_operation uuid,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid;
v_ids text[];
v_staff staff.subject%ROWTYPE;
v_proof staff.action_proof%ROWTYPE;
v_inv jsonb;
v_issuer uuid;
v_issued timestamptz;
v_expiry timestamptz;
v_credentials jsonb;
v_owner boolean;
v_prerequisite staff.prerequisite_receipt%ROWTYPE;
v_owner_context jsonb;
BEGIN
 IF p_purpose='INVITATION_ACCEPT' THEN SELECT s.user_id INTO v_issuer FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE i.token_hash=p_scope->>'invitationTokenHash';
END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 IF p_purpose IS NULL
    OR p_purpose NOT IN('REGISTRATION','ELEVATION','ACTION','INVITATION_ACCEPT','OWNER_POSSESSION')
    OR p_hash IS NULL
    OR p_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_handle IS NULL
    OR p_handle !~ '^sha256:[0-9a-f]{64}$'
    OR p_rp IS NULL
    OR length(p_rp) NOT BETWEEN 1
    AND 253
    OR p_origin IS NULL
    OR length(p_origin)>512
    OR NOT staff.live_account(p_user,p_base) THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 SELECT array_agg(f.credential_id ORDER BY f.credential_id),jsonb_agg(jsonb_build_object('id',f.credential_id,'type','public-key','transports',m.transports) ORDER BY f.credential_id) INTO v_ids,v_credentials FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id=f.mfa_factor_id
    AND m.user_id=f.user_id WHERE f.user_id=p_user
    AND f.factor_type='passkey'
    AND f.state='active'
    AND f.verified_at IS NOT NULL
    AND f.backup_eligible=false
    AND f.backup_state=false
    AND f.user_verification_required=true
    AND f.relying_party_id=p_rp
    AND f.credential_origin=p_origin;
 v_ids:=COALESCE(v_ids,'{}');
v_credentials:=COALESCE(v_credentials,'[]');
IF cardinality(v_ids)>100 THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_LIMIT';
END IF;
 IF p_purpose='REGISTRATION' THEN
  IF p_operation IS NULL
    OR p_user_handle IS NULL
    OR p_user_handle !~ '^sha256:[0-9a-f]{64}$'
    OR cardinality(v_ids)>=100 THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  IF p_scope->>'kind'='PREREQUISITE'
    AND core.jsonb_has_exact_keys(p_scope,ARRAY['kind','prerequisiteHandleHash'])
    AND p_context IS NULL
    AND p_binding IS NULL THEN
   IF EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user) THEN RAISE EXCEPTION 'STAFF_KEY_PROOF_REQUIRED';
END IF;
   SELECT * INTO v_prerequisite FROM staff.prerequisite_receipt WHERE handle_sha256=p_scope->>'prerequisiteHandleHash'
    AND user_id=p_user
    AND ordinary_session_id=p_base FOR UPDATE;
   IF NOT FOUND
    OR v_prerequisite.purpose<>'KEY_PREREGISTRATION'
    OR v_prerequisite.consumed_at IS NOT NULL
    OR v_prerequisite.expires_at<=clock_timestamp()
    OR v_prerequisite.account_security_epoch<>staff.account_epoch(p_user)
    OR NOT staff.rotation_receipt_current(v_prerequisite.factor_receipt_id,p_user,p_base,v_prerequisite.account_security_epoch) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';
END IF;
   v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,prerequisite_receipt_id,created_at,expires_at) VALUES(p_user,p_base,v_prerequisite.account_security_epoch,'REGISTRATION',p_hash,v_prerequisite.receipt_id,v_issued,LEAST(v_prerequisite.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
   UPDATE staff.prerequisite_receipt SET consumed_at=v_issued,registration_challenge_id=v_id WHERE receipt_id=v_prerequisite.receipt_id;
  ELSIF p_scope->>'kind'='STAFF_PROOF'
    AND core.jsonb_has_exact_keys(p_scope,ARRAY['kind','proofHandleHash']) THEN
   IF staff.context_internal(p_user,p_base,(p_context->>'privilegeSessionId')::uuid) IS DISTINCT FROM p_context
    OR p_context IS NULL
    OR p_binding->>'action' IS DISTINCT FROM 'CREDENTIAL_REGISTER'
    OR p_binding->>'targetId' IS DISTINCT FROM p_user::text
    OR p_binding->>'operationId' IS DISTINCT FROM p_operation::text THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   SELECT * INTO v_proof FROM staff.action_proof WHERE handle_sha256=p_scope->>'proofHandleHash' FOR UPDATE;
   IF NOT FOUND
    OR v_proof.consumed_at IS NOT NULL
    OR v_proof.expires_at<=clock_timestamp()
    OR v_proof.user_id<>p_user
    OR v_proof.ordinary_session_id<>p_base
    OR v_proof.privilege_session_id<>(p_context->>'privilegeSessionId')::uuid
    OR v_proof.staff_id<>(p_context->>'staffId')::uuid
    OR v_proof.security_epoch<>(p_context->>'securityEpoch')::bigint
    OR v_proof.account_security_epoch<>staff.account_epoch(p_user)
    OR v_proof.grant_revision<>(p_context->>'grantRevision')::bigint
    OR v_proof.binding IS DISTINCT FROM p_binding THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,staff_id,privilege_session_id,security_epoch,grant_revision,binding,registration_proof_id,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),'REGISTRATION',p_hash,v_proof.staff_id,v_proof.privilege_session_id,v_proof.security_epoch,v_proof.grant_revision,p_binding,v_proof.proof_id,v_issued,LEAST(v_proof.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
   UPDATE staff.action_proof SET consumed_at=v_issued WHERE proof_id=v_proof.proof_id;
  ELSE RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
 ELSIF p_purpose IN('ELEVATION','ACTION') THEN
  IF p_scope IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  SELECT * INTO v_staff FROM staff.subject WHERE user_id=p_user
    AND state='ACTIVE' FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
END IF;
  SELECT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=v_staff.staff_id
    AND active) INTO v_owner;
  IF cardinality(v_ids)<1 THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_REQUIRED';
END IF;
  IF p_purpose='ACTION' THEN
   IF p_context IS NULL
    OR staff.context_internal(p_user,p_base,(p_context->>'privilegeSessionId')::uuid) IS DISTINCT FROM p_context
    OR NOT core.jsonb_has_exact_keys(p_binding,ARRAY['action','targetId','bodySha256','expectedRevision','operationId'])
    OR p_binding->>'action' IS NULL
    OR p_binding->>'action' NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','EMERGENCY_DISABLE','CREDENTIAL_REGISTER','CREDENTIAL_REVOKE','PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE','THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED','ALLOWANCE_CONFIGURE','ALLOWANCE_REVOKE','TEAM_LIMIT_SET','TEAM_LIMIT_PARTNER_GRANT','TEAM_LIMIT_PARTNER_REVOKE','TEAM_PRACTICE_RECORD','PUBLIC_REVIEW_HIDE','PUBLIC_REVIEW_STEP','PUBLIC_REPORT_DISMISS')
    OR p_binding->>'bodySha256' IS NULL
    OR p_binding->>'bodySha256' !~ '^[0-9a-f]{64}$'
    OR (p_binding->>'targetId')::uuid IS NULL
    OR (p_binding->>'operationId')::uuid IS NULL THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   PERFORM staff.expected_revision(p_binding);
IF NOT staff.owned_action_allowed(p_context,p_binding) THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
END IF;
   IF p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE')
    AND p_binding->>'targetId' IS DISTINCT FROM p_user::text THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
  ELSIF p_context IS NOT NULL
    OR p_binding IS NOT NULL THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,staff_id,privilege_session_id,security_epoch,grant_revision,binding,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,v_staff.staff_id,CASE WHEN p_purpose='ACTION' THEN (p_context->>'privilegeSessionId')::uuid END,v_staff.security_epoch,v_staff.grant_revision,p_binding,v_issued,v_issued+interval '5 minutes') RETURNING challenge_id INTO v_id;
 ELSIF p_purpose='INVITATION_ACCEPT' THEN
  IF NOT core.jsonb_has_exact_keys(p_scope,ARRAY['invitationTokenHash'])
    OR p_context IS NULL
    OR p_binding IS NOT NULL
    OR cardinality(v_ids)<1 THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';
END IF;
  v_inv:=staff.read_invitation_context(p_user,p_base,p_scope->>'invitationTokenHash');
IF v_inv IS NULL
    OR v_inv->>'invitationId' IS DISTINCT FROM p_context->>'invitationId'
    OR p_context->>'targetUserId' IS DISTINCT FROM p_user::text
    OR p_context->>'ordinarySessionId' IS DISTINCT FROM p_base::text
    OR v_inv->>'issuerStaffId' IS DISTINCT FROM p_context->>'issuerStaffId'
    OR v_inv->>'issuerSecurityEpoch' IS DISTINCT FROM p_context->>'issuerSecurityEpoch'
    OR v_inv->>'targetAccountSecurityEpoch' IS DISTINCT FROM p_context->>'targetAccountSecurityEpoch'
    OR v_inv->>'invitationRevision' IS DISTINCT FROM p_context->>'invitationRevision' THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,invitation_id,issuer_security_epoch,invitation_revision,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,(v_inv->>'invitationId')::uuid,(v_inv->>'issuerSecurityEpoch')::bigint,(v_inv->>'invitationRevision')::bigint,v_issued,LEAST((v_inv->>'expiresAt')::timestamptz,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
 ELSE
  IF NOT core.jsonb_has_exact_keys(p_scope,ARRAY['commandId','nonceHash','credentialId','prerequisiteHandleHash'])
    OR p_context IS NULL
    OR p_binding IS NOT NULL
    OR NOT (p_scope->>'credentialId'=ANY(v_ids))
    OR p_context->'command'->>'commandId' IS DISTINCT FROM p_scope->>'commandId'
    OR p_context->>'ordinarySessionId' IS DISTINCT FROM p_base::text
    OR p_context->'command'->>'targetUserId' IS DISTINCT FROM p_user::text THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  v_owner_context:=staff.read_owner_possession_context(p_user,p_base,(p_scope->>'commandId')::uuid,p_scope->>'nonceHash',p_scope->>'credentialId',p_scope->>'prerequisiteHandleHash');
IF v_owner_context IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  SELECT * INTO v_prerequisite FROM staff.prerequisite_receipt WHERE receipt_id=(v_owner_context->>'prerequisiteReceiptId')::uuid FOR UPDATE;
  IF staff.read_owner_possession_context(p_user,p_base,(p_scope->>'commandId')::uuid,p_scope->>'nonceHash',p_scope->>'credentialId',p_scope->>'prerequisiteHandleHash') IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,credential_id,command_id,prerequisite_receipt_id,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,p_scope->>'credentialId',(p_scope->>'commandId')::uuid,v_prerequisite.receipt_id,v_issued,LEAST((v_owner_context->'command'->>'expiresAt')::timestamptz,v_prerequisite.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
  UPDATE staff.prerequisite_receipt SET consumed_at=COALESCE(consumed_at,v_issued) WHERE receipt_id=v_prerequisite.receipt_id;
v_ids:=ARRAY[p_scope->>'credentialId'];
SELECT jsonb_agg(x) INTO v_credentials FROM jsonb_array_elements(v_credentials) x WHERE x->>'id'=p_scope->>'credentialId';
 END IF;
 SELECT LEAST(expires_at,v_issued+interval '5 minutes',(SELECT absolute_expires_at FROM identity.session WHERE session_id=p_base
    AND user_id=p_user)) INTO v_expiry FROM staff.webauthn_challenge WHERE challenge_id=v_id;
 UPDATE staff.webauthn_challenge SET handle_sha256=p_handle,allowed_credential_ids=CASE WHEN p_purpose='REGISTRATION' THEN '{}'::text[] ELSE v_ids END,relying_party_id=p_rp,credential_origin=p_origin,user_handle_sha256=p_user_handle,operation_id=p_operation,scope=p_scope,created_at=v_issued,expires_at=v_expiry WHERE challenge_id=v_id;
 RETURN jsonb_build_object('challengeId',v_id,'expiresAt',v_expiry,'credentials',v_credentials);
END $$;

-- 6. Ownership and the exact grants -------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and new functions their owners, as 0150 does; touches no earlier object
DO $public_flag_owner$
DECLARE v_owner name; v_core name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_core FROM pg_catalog.pg_proc AS p WHERE p.oid = 'core.run_is_published(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.public_flag','identity.public_flag_event','identity.public_review_purged'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.guard_public_flag()','identity.read_public_flag_target(uuid)','identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)',
    'identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)','identity.public_flag_queue()','identity.public_flag_mark_read(uuid)','identity.public_flag_dismiss(uuid,uuid,uuid,text)',
    'identity.public_flag_replay(uuid,text)','identity.delete_public_flag_words_due()','identity.read_public_review_purge_due(integer)','identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  EXECUTE pg_catalog.format('ALTER FUNCTION core.public_review_replace_snapshot(uuid,jsonb) OWNER TO %I', v_core);
  EXECUTE 'REVOKE ALL ON FUNCTION core.public_review_replace_snapshot(uuid,jsonb) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION core.public_review_replace_snapshot(uuid,jsonb) TO %I', v_owner);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION staff.queue_public_flag_notices(uuid,text) TO %I', v_owner);
  EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA staff TO %I', v_owner);
  FOREACH v_name IN ARRAY ARRAY['identity.public_flag_queue()','identity.public_flag_mark_read(uuid)','identity.public_flag_dismiss(uuid,uuid,uuid,text)','identity.public_flag_replay(uuid,text)'] LOOP
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO debateai_staff_security_owner', v_name);
  END LOOP;
END
$public_flag_owner$;
DO $public_flag_staff$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['staff.queue_public_flag_notices(uuid,text)','staff.claim_public_flag_notices(integer)','staff.complete_public_flag_notice(uuid,uuid,boolean)','staff.public_flag_notice_user(uuid,uuid)',
    'staff.read_public_flag_queue(jsonb,text)','staff.public_flag_dismiss(jsonb,uuid,jsonb,uuid,uuid,jsonb)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO debateai_staff_security_owner', v_name);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_staff_recovery', v_name);
  END LOOP;
END
$public_flag_staff$;
GRANT EXECUTE ON FUNCTION identity.read_public_flag_target(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.delete_public_flag_words_due() TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_review_purge_due(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_public_flag_notices(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_public_flag_notice(uuid,uuid,boolean) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.public_flag_notice_user(uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_public_flag_queue(jsonb,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.public_flag_dismiss(jsonb,uuid,jsonb,uuid,uuid,jsonb) TO debateai_runtime;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed --------------------------------------------------------------------
DO $public_flag_contract$
DECLARE v_name text; v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['identity.public_flag','identity.public_flag_event','identity.public_review_purged'] LOOP
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime','debateai_erasure_runtime','debateai_replay','debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role,v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PUBLIC_FLAG_0151_CONTRACT table privilege % %',v_role,v_name;
      END IF;
    END LOOP;
  END LOOP;
END
$public_flag_contract$;
