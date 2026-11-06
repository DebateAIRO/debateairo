-- 0157 · The DSA moderation notices: a statement of reasons for every person a review step affects (DSA Art 17; Terms §10), and answers to the
-- people who report (DSA Art 16(4)-(6)). The owner's answers of 6 November 2026 (D1-D11) to the design for the five gaps 0156 left.
--
-- Plain words. 0150's review log and 0151's Report button stay as they are: their tables, their guards and their functions are pinned, and the
-- release before keeps calling them. Everything here is new, beside them, keyed by the log's event_id or the report's flag_id.
-- 1. THE GROUND OF A STEP. Each staff step now carries what the statement needs: the ground (one or more fixed codes, never free text), the
--    source of the facts (the Report button with its flag_id, a notice by email, our own initiative, an authority's order) and the facts a person
--    typed, sealed under the publication's key; the passkey binds their digest, never the words. A new body and a new act, under the same action
--    names (PUBLIC_REVIEW_HIDE, PUBLIC_REVIEW_STEP), so the proof's fixed key set and action list do not move. A hide is containment: it may carry
--    no ground, and its ground is then Terms §9's "hide it while we review it"; what it carries is recorded or replaced by that, never refused.
--    DECIDE records the final ground of a debate that stays hidden; it writes no log row (only REPUBLISH ends a hide). The automatic hide's
--    ground is read from 0151's own row (reason CONTENT or PERSONAL), and the AI's quote, the page's own words, is sealed beside it.
-- 2. THE STATEMENTS (section 4). The log and the decisions are the outbox, as 0156's: the API's sender queues one statement per person a step
--    affects (the author, the person who dug, the report's writer, those whose text a correction changed, and those whose content left the page
--    with someone else's), then mails it once with a link to the full statement in their account. 0156's queue is left as it is: the new
--    release stops calling its claim, so nobody is mailed twice by one release. The digger's own line is read again, truly (gap 5).
-- 3. THE ANSWERS TO PEOPLE WHO REPORT (section 6). A receipt for a report a person will read, the automatic check's two decisions, and a
--    person's (a close, which now says what they found, or a review step that names the report as its source), each mailed once to the
--    reporter; a report left CHECKING is settled after five minutes as the check being unavailable, so a person reads it. The close is 0151's
--    Dismiss with the outcome bound into the passkey's body, under the same action name.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          additive only: new tables and new functions under new names; it reads 0150's and 0151's records and changes nothing of
--                   them, so the release before writes them as it did. The new act reuses the three action names the proof already allows.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The ground of each step ------------------------------------------------------------------------------------------------------
-- The fixed grounds. Terms §7: unlawful content, hate speech, weapons or drugs, suicide or harm, religious insult, personal data about others;
-- the law (illegal content); Terms §9's hold while we review, for a hide only. The page and the mail name each in the person's language.
CREATE OR REPLACE FUNCTION identity.moderation_grounds_known(p_grounds text[], p_hold boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT p_grounds IS NOT NULL AND cardinality(p_grounds) BETWEEN 1 AND 8 AND array_position(p_grounds, NULL) IS NULL
    AND p_grounds <@ (CASE WHEN p_hold THEN ARRAY['REVIEW_HOLD'] ELSE ARRAY['UNLAWFUL','HATE_SPEECH','WEAPONS_OR_DRUGS','SUICIDE_OR_HARM','RELIGIOUS_INSULT','PERSONAL_DATA','ILLEGAL'] END)::text[]
$$;
-- One row per log row that carries a ground: every hide, removal, hidden report and correction the new act takes. Append-only.
CREATE TABLE IF NOT EXISTS identity.moderation_ground (
  event_id uuid PRIMARY KEY REFERENCES identity.public_review_event(event_id),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  grounds text[] NOT NULL,
  suspected text[] NOT NULL DEFAULT '{}'::text[],
  source text NOT NULL CONSTRAINT moderation_ground_source_check CHECK (source IN ('REPORT_BUTTON','EMAIL_NOTICE','OWN_INITIATIVE','AUTHORITY_ORDER')),
  flag_id uuid REFERENCES identity.public_flag(flag_id),
  facts_sha256 text CONSTRAINT moderation_ground_facts_digest_check CHECK (facts_sha256 ~ '^[0-9a-f]{64}$'),
  facts_ciphertext jsonb CONSTRAINT moderation_ground_facts_check CHECK (facts_ciphertext IS NULL OR (
    jsonb_typeof(facts_ciphertext) = 'object' AND facts_ciphertext->>'v' = '1'
    AND facts_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(facts_ciphertext->>'nonce') > 0 AND length(facts_ciphertext->>'ct') > 0 AND length(facts_ciphertext->>'tag') > 0
    AND octet_length(facts_ciphertext::text) <= 65536)),
  facts_deleted_at timestamptz,
  interim boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT moderation_ground_grounds_check CHECK (identity.moderation_grounds_known(grounds, interim)),
  CONSTRAINT moderation_ground_suspected_check CHECK (cardinality(suspected) = 0 OR identity.moderation_grounds_known(suspected, false)),
  CONSTRAINT moderation_ground_flag_shape CHECK ((source = 'REPORT_BUTTON') = (flag_id IS NOT NULL)),
  CONSTRAINT moderation_ground_facts_shape CHECK (facts_sha256 IS NULL OR (facts_ciphertext IS NULL) = (facts_deleted_at IS NOT NULL)),
  CONSTRAINT moderation_ground_facts_digest_shape CHECK (facts_ciphertext IS NULL OR facts_sha256 IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS moderation_ground_publication ON identity.moderation_ground (publication_ref, recorded_at);
CREATE INDEX IF NOT EXISTS moderation_ground_flag ON identity.moderation_ground (flag_id) WHERE flag_id IS NOT NULL;
SELECT core.install_truncate_guard('identity.moderation_ground');
-- The final ground of a debate that stays hidden: DECIDE, under the same proof as every other step. No log row: only REPUBLISH ends a hide.
CREATE TABLE IF NOT EXISTS identity.moderation_decision (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  revision integer NOT NULL CONSTRAINT moderation_decision_revision_check CHECK (revision BETWEEN 1 AND 1000000),
  grounds text[] NOT NULL CONSTRAINT moderation_decision_grounds_check CHECK (identity.moderation_grounds_known(grounds, false)),
  source text NOT NULL CONSTRAINT moderation_decision_source_check CHECK (source IN ('REPORT_BUTTON','EMAIL_NOTICE','OWN_INITIATIVE','AUTHORITY_ORDER')),
  flag_id uuid REFERENCES identity.public_flag(flag_id),
  facts_sha256 text NOT NULL CONSTRAINT moderation_decision_facts_digest_check CHECK (facts_sha256 ~ '^[0-9a-f]{64}$'),
  facts_ciphertext jsonb CONSTRAINT moderation_decision_facts_check CHECK (facts_ciphertext IS NULL OR (
    jsonb_typeof(facts_ciphertext) = 'object' AND facts_ciphertext->>'v' = '1'
    AND facts_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(facts_ciphertext->>'nonce') > 0 AND length(facts_ciphertext->>'ct') > 0 AND length(facts_ciphertext->>'tag') > 0
    AND octet_length(facts_ciphertext::text) <= 65536)),
  facts_deleted_at timestamptz,
  actor_staff_id uuid NOT NULL,
  operation_id uuid NOT NULL CONSTRAINT moderation_decision_operation_once UNIQUE,
  request_sha256 text NOT NULL CONSTRAINT moderation_decision_request_check CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT moderation_decision_flag_shape CHECK ((source = 'REPORT_BUTTON') = (flag_id IS NOT NULL)),
  CONSTRAINT moderation_decision_facts_shape CHECK ((facts_ciphertext IS NULL) = (facts_deleted_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS moderation_decision_publication ON identity.moderation_decision (publication_ref, recorded_at);
SELECT core.install_truncate_guard('identity.moderation_decision');
-- The automatic hide's quote: the words of the page the check copied, sealed under the publication's key. 0151 throws them away; the
-- statement's page shows them to the debate's owner only (D2). One per report, and only for a report that hid its debate.
CREATE TABLE IF NOT EXISTS identity.public_flag_quote (
  flag_id uuid PRIMARY KEY REFERENCES identity.public_flag(flag_id),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  quote_ciphertext jsonb CONSTRAINT public_flag_quote_content_check CHECK (quote_ciphertext IS NULL OR (
    jsonb_typeof(quote_ciphertext) = 'object' AND quote_ciphertext->>'v' = '1'
    AND quote_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(quote_ciphertext->>'nonce') > 0 AND length(quote_ciphertext->>'ct') > 0 AND length(quote_ciphertext->>'tag') > 0
    AND octet_length(quote_ciphertext::text) <= 65536)),
  quote_deleted_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT public_flag_quote_gone CHECK ((quote_ciphertext IS NULL) = (quote_deleted_at IS NOT NULL))
);
SELECT core.install_truncate_guard('identity.public_flag_quote');
-- These rows only move forward: the sealed words go once (section 6's twelve months). Nothing else changes, and nothing is deleted.
CREATE OR REPLACE FUNCTION identity.guard_moderation_words() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_old jsonb; v_new jsonb; v_words text; v_gone text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='MODERATION_RECORD_APPEND_ONLY'; END IF;
  v_words := CASE TG_TABLE_NAME WHEN 'public_flag_quote' THEN 'quote_ciphertext' ELSE 'facts_ciphertext' END;
  v_gone := CASE TG_TABLE_NAME WHEN 'public_flag_quote' THEN 'quote_deleted_at' ELSE 'facts_deleted_at' END;
  v_old := pg_catalog.to_jsonb(OLD); v_new := pg_catalog.to_jsonb(NEW);
  IF v_old->v_words <> 'null'::jsonb AND v_new->v_words = 'null'::jsonb AND v_new->v_gone <> 'null'::jsonb
    AND (v_new - ARRAY[v_words, v_gone]) = (v_old - ARRAY[v_words, v_gone]) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='MODERATION_RECORD_APPEND_ONLY';
END $$;
DROP TRIGGER IF EXISTS guard_moderation_words ON identity.moderation_ground;
CREATE TRIGGER guard_moderation_words BEFORE UPDATE OR DELETE ON identity.moderation_ground FOR EACH ROW EXECUTE FUNCTION identity.guard_moderation_words();
DROP TRIGGER IF EXISTS guard_moderation_words ON identity.moderation_decision;
CREATE TRIGGER guard_moderation_words BEFORE UPDATE OR DELETE ON identity.moderation_decision FOR EACH ROW EXECUTE FUNCTION identity.guard_moderation_words();
DROP TRIGGER IF EXISTS guard_moderation_words ON identity.public_flag_quote;
CREATE TRIGGER guard_moderation_words BEFORE UPDATE OR DELETE ON identity.public_flag_quote FOR EACH ROW EXECUTE FUNCTION identity.guard_moderation_words();

-- Whether a step's ground is whole: a removal, a hidden report, a correction and a decision need a known ground, a source (with the report,
-- of this debate, when it is the Report button's) and facts a person typed, sealed under this debate's key. A re-publish and a put-back carry none.
CREATE OR REPLACE FUNCTION identity.moderation_ground_whole(p_step text, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid, p_facts_sha256 text, p_facts jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE
    WHEN p_step IN ('REPUBLISH','PUT_BACK') THEN cardinality(COALESCE(p_grounds, '{}'::text[])) = 0 AND p_source IS NULL AND p_flag_id IS NULL AND p_facts_sha256 IS NULL AND p_facts IS NULL
    WHEN p_step IN ('REMOVE_DIG','HIDE_REPORT','CORRECT','DECIDE') THEN identity.moderation_grounds_known(p_grounds, false)
      AND p_source IN ('REPORT_BUTTON','EMAIL_NOTICE','OWN_INITIATIVE','AUTHORITY_ORDER')
      AND (p_source = 'REPORT_BUTTON') = (p_flag_id IS NOT NULL)
      AND (p_flag_id IS NULL OR EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id AND flag.publication_ref = p_publication_ref))
      AND p_facts_sha256 ~ '^[0-9a-f]{64}$' AND p_facts IS NOT NULL AND p_facts->>'keyId' = 'publication-snapshot:' || p_publication_ref::text || ':v1'
    ELSE false END
$$;
-- A hide's ground, recorded beside its log row (found by the step's operation). It never raises: what a hide carries that does not hold becomes the
-- hold of Terms §9 and our own initiative, so containment never waits for a ground (0150). The grounds a person named at the hide are kept as suspected.
CREATE OR REPLACE FUNCTION identity.record_hide_ground(p_operation uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_event_id uuid; v_source text; v_flag uuid; v_suspected text[];
BEGIN
  SELECT event.event_id INTO v_event_id FROM identity.public_review_event AS event WHERE event.operation_id = p_operation AND event.publication_ref = p_publication_ref AND event.action = 'HIDE';
  IF NOT FOUND THEN RETURN; END IF;
  BEGIN
    v_flag := CASE WHEN p_source = 'REPORT_BUTTON' AND EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id AND flag.publication_ref = p_publication_ref) THEN p_flag_id END;
    v_source := CASE WHEN v_flag IS NOT NULL THEN 'REPORT_BUTTON' WHEN p_source IN ('EMAIL_NOTICE','OWN_INITIATIVE','AUTHORITY_ORDER') THEN p_source ELSE 'OWN_INITIATIVE' END;
    v_suspected := CASE WHEN identity.moderation_grounds_known(p_grounds, false) THEN p_grounds ELSE '{}'::text[] END;
    INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, suspected, source, flag_id, interim)
    VALUES (v_event_id, p_publication_ref, ARRAY['REVIEW_HOLD'], v_suspected, v_source, v_flag, true) ON CONFLICT (event_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, interim)
    VALUES (v_event_id, p_publication_ref, ARRAY['REVIEW_HOLD'], 'OWN_INITIATIVE', true) ON CONFLICT (event_id) DO NOTHING;
  END;
END $$;
-- The final ground of a debate that stays hidden, at the log's revision, under the debate's lock. The caller checked the ground is whole.
CREATE OR REPLACE FUNCTION identity.moderation_decide(p_actor uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid, p_facts_sha256 text, p_facts jsonb,
  p_expected_revision integer, p_operation uuid, p_request_sha256 text) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_revision integer; v_at timestamptz;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0));
  SELECT COALESCE(max(event.revision), 0) INTO v_revision FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref;
  IF v_revision <> p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_STALE'; END IF;
  IF NOT identity.public_review_held(p_publication_ref) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_NOT_HIDDEN'; END IF;
  INSERT INTO identity.moderation_decision (publication_ref, revision, grounds, source, flag_id, facts_sha256, facts_ciphertext, actor_staff_id, operation_id, request_sha256)
  VALUES (p_publication_ref, v_revision, p_grounds, p_source, p_flag_id, p_facts_sha256, p_facts, p_actor, p_operation, p_request_sha256)
  RETURNING recorded_at INTO v_at;
  RETURN v_at;
END $$;
CREATE OR REPLACE FUNCTION identity.moderation_decision_replay(p_operation uuid, p_request_sha256 text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.moderation_decision%ROWTYPE;
BEGIN
  SELECT * INTO v FROM identity.moderation_decision AS decision WHERE decision.operation_id = p_operation;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v.request_sha256 <> p_request_sha256 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='STAFF_OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('operationId', v.operation_id, 'outcome', 'COMPLETED', 'recordedAt', v.recorded_at);
END $$;
-- A step's ground, recorded beside its log row (found by the step's operation): the caller checked it is whole.
CREATE OR REPLACE FUNCTION identity.record_step_ground(p_operation uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid, p_facts_sha256 text, p_facts jsonb) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, flag_id, facts_sha256, facts_ciphertext, interim)
  SELECT event.event_id, p_publication_ref, p_grounds, p_source, p_flag_id, p_facts_sha256, p_facts, false
  FROM identity.public_review_event AS event WHERE event.operation_id = p_operation AND event.publication_ref = p_publication_ref
$$;
-- The automatic hide's quote, once, for a report that hid its debate (the API's pool, after 0151's settle). False: nothing to keep.
CREATE OR REPLACE FUNCTION identity.record_public_flag_quote(p_flag_id uuid, p_content jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_flag%ROWTYPE;
BEGIN
  SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id;
  IF NOT FOUND OR v.state <> 'HIDDEN' OR v.verdict <> 'AGREE' OR p_content IS NULL OR p_content->>'keyId' IS DISTINCT FROM 'publication-snapshot:' || v.publication_ref::text || ':v1' THEN RETURN false; END IF;
  INSERT INTO identity.public_flag_quote (flag_id, publication_ref, quote_ciphertext) VALUES (p_flag_id, v.publication_ref, p_content) ON CONFLICT (flag_id) DO NOTHING;
  RETURN FOUND;
END $$;

-- 2. Staff's door, with the ground (0150's pair stays for the release before) ---------------------------------------------------
-- The body the passkey binds: 0150's, and the ground's four fields. The grounds go in as one sorted, comma-joined string; the facts as their digest.
CREATE OR REPLACE FUNCTION staff.public_review_body_grounded(p_action text,p_command jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT register.canonical_json_text(json_build_object('action',p_action,'target_id',p_command->>'targetId','step',p_command->>'step','piece_kind',p_command->>'pieceKind',
    'piece_id',p_command->>'pieceId','pointer',p_command->>'pointer','text_sha256',p_command->>'textSha256','expected_revision',(p_command->>'expectedRevision')::bigint,'operation_id',p_command->>'operationId',
    'grounds',p_command->>'grounds','source',p_command->>'source','flag_id',p_command->>'flagId','facts_sha256',p_command->>'factsSha256')::text)
$$;
-- The one change door, as 0150's, with DECIDE and the ground. p_facts: the typed facts, sealed by the API under the debate's key. A hide's ground
-- is never refused; any other step's must be whole before the proof is spent.
CREATE OR REPLACE FUNCTION staff.public_review_act_grounded(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_content jsonb,p_facts jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid; v_step text:=p_command->>'step'; v_action text; v_target uuid; v_operation uuid;
  v_request jsonb; v_request_sha text; v_replay jsonb; v_at timestamptz; v_kind text; v_piece uuid; v_pointer text; v_text text;
  v_grounds text[]; v_source text; v_flag uuid; v_facts_sha text;
BEGIN
  IF core.jsonb_has_exact_keys(p_command,ARRAY['targetId','step','pieceKind','pieceId','pointer','textSha256','expectedRevision','operationId','grounds','source','flagId','factsSha256']) IS DISTINCT FROM true
    OR v_step IS NULL OR v_step NOT IN ('HIDE','REPUBLISH','REMOVE_DIG','PUT_BACK','CORRECT','HIDE_REPORT','DECIDE')
    OR jsonb_typeof(p_command->'expectedRevision') IS DISTINCT FROM 'number' OR jsonb_typeof(p_command->'grounds') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_command->'source') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'flagId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_command->'factsSha256') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'PUBLIC_REVIEW_COMMAND_INVALID'; END IF;
  v_action:=CASE WHEN v_step='HIDE' THEN 'PUBLIC_REVIEW_HIDE' ELSE 'PUBLIC_REVIEW_STEP' END;
  v_target:=(p_command->>'targetId')::uuid; v_operation:=(p_command->>'operationId')::uuid;
  v_kind:=NULLIF(p_command->>'pieceKind',''); v_piece:=NULLIF(p_command->>'pieceId','')::uuid; v_pointer:=NULLIF(p_command->>'pointer',''); v_text:=NULLIF(p_command->>'textSha256','');
  v_grounds:=string_to_array(NULLIF(p_command->>'grounds',''),','); v_source:=NULLIF(p_command->>'source','');
  v_facts_sha:=NULLIF(p_command->>'factsSha256','');
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  IF staff.authorize_action(p_context,'TEAM_LIMIT_SET') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  -- Locked team tools stop everything but the hide.
  IF v_step<>'HIDE' AND p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;
  IF p_binding->>'action' IS DISTINCT FROM v_action OR p_binding->>'targetId' IS DISTINCT FROM v_target::text OR p_binding->>'operationId' IS DISTINCT FROM v_operation::text
    OR p_binding->'expectedRevision' IS DISTINCT FROM p_command->'expectedRevision'
    OR p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(staff.public_review_body_grounded(v_action,p_command),'UTF8')),'hex') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID';
  END IF;
  -- The facts the API sealed are the facts the passkey bound.
  IF (v_facts_sha IS NULL) <> (p_facts IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PUBLIC_REVIEW_GROUND_INVALID'; END IF;
  PERFORM staff.expected_revision(p_binding);
  v_request:=jsonb_build_array(v_staff,p_binding,p_command);
  v_request_sha:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
  v_replay:=CASE WHEN v_step='DECIDE' THEN identity.moderation_decision_replay(v_operation,v_request_sha) ELSE identity.public_review_replay(v_operation,v_request_sha) END;
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_step<>'HIDE' THEN
    BEGIN v_flag:=NULLIF(p_command->>'flagId','')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PUBLIC_REVIEW_GROUND_INVALID'; END;
    IF NOT identity.moderation_ground_whole(v_step,v_target,v_grounds,v_source,v_flag,v_facts_sha,p_facts) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PUBLIC_REVIEW_GROUND_INVALID'; END IF;
  END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET',v_action,v_target,v_operation);
  IF v_step='DECIDE' THEN
    v_at:=identity.moderation_decide(v_staff,v_target,v_grounds,v_source,v_flag,v_facts_sha,p_facts,(p_command->>'expectedRevision')::integer,v_operation,v_request_sha);
  ELSE
    v_at:=identity.public_review_apply(v_staff,v_step,v_target,v_kind,v_piece,v_pointer,v_text,p_content,(p_command->>'expectedRevision')::integer,v_operation,v_request_sha);
    IF v_step='HIDE' THEN
      BEGIN v_flag:=NULLIF(p_command->>'flagId','')::uuid; EXCEPTION WHEN OTHERS THEN v_flag:=NULL; END;
      PERFORM identity.record_hide_ground(v_operation,v_target,v_grounds,v_source,v_flag);
    ELSIF v_step IN ('REMOVE_DIG','HIDE_REPORT','CORRECT') THEN
      PERFORM identity.record_step_ground(v_operation,v_target,v_grounds,v_source,v_flag,v_facts_sha,p_facts);
    END IF;
  END IF;
  PERFORM staff.queue_public_review_notices(v_operation);
  IF p_alert IS NOT NULL THEN
    PERFORM staff.record_mutation(v_operation,'PUBLIC_REVIEW_CHANGED',v_staff,v_staff,jsonb_build_object('code','SECURITY_RESPONSE'),v_user,p_alert,v_request);
  END IF;
  RETURN jsonb_build_object('operationId',v_operation,'outcome','COMPLETED','recordedAt',v_at);
END $$;

-- 3. Ownership and the exact grants of sections 1 and 2 ---------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and the new functions their owners, the owners of 0150's identity and staff functions; touches no earlier object
DO $moderation_ground_owner$
DECLARE v_owner name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_ground','identity.moderation_decision','identity.public_flag_quote'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_grounds_known(text[],boolean)','identity.guard_moderation_words()',
    'identity.moderation_ground_whole(text,uuid,text[],text,uuid,text,jsonb)','identity.record_hide_ground(uuid,uuid,text[],text,uuid)',
    'identity.moderation_decide(uuid,uuid,text[],text,uuid,text,jsonb,integer,uuid,text)','identity.moderation_decision_replay(uuid,text)',
    'identity.record_step_ground(uuid,uuid,text[],text,uuid,text,jsonb)','identity.record_public_flag_quote(uuid,jsonb)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  -- Staff's door calls the identity side, as 0150's does.
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_ground_whole(text,uuid,text[],text,uuid,text,jsonb)','identity.record_hide_ground(uuid,uuid,text[],text,uuid)',
    'identity.moderation_decide(uuid,uuid,text[],text,uuid,text,jsonb,integer,uuid,text)','identity.moderation_decision_replay(uuid,text)',
    'identity.record_step_ground(uuid,uuid,text[],text,uuid,text,jsonb)'] LOOP
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO debateai_staff_security_owner', v_name);
  END LOOP;
END
$moderation_ground_owner$;
ALTER FUNCTION staff.public_review_body_grounded(text,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.public_review_body_grounded(text,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
REVOKE ALL ON FUNCTION staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_flag_quote(uuid,jsonb) TO debateai_runtime;

-- 4. The statements of reasons (D1, D3, D7, D8, D9) --------------------------------------------------------------------------------
-- One statement per person a step affects, kept in their account and mailed once. The mail names what was done, the source, the automated
-- means, the ground and the routes; the signed-in page adds the facts and, for the automatic hide, the quote (D1: mail is not a private channel).
--   HIDE         -> the debate's newest owner (DEBATE_HIDDEN), and each other person whose dig or report left the page with it (D7: *_AFFECTED)
--   DECIDE       -> the debate's newest owner (DEBATE_DECIDED): the final ground of a debate that stays hidden
--   REMOVE_DIG   -> the person who dug (CONTRIBUTION_REMOVED), and each other person whose later row or report left the page with it (D7)
--   HIDE_REPORT  -> the report's writer (REPORT_REMOVED)
--   REPUBLISH    -> each person whose text a correction of this review changed, once, listing the places, not the words (D3: CORRECTED)
-- WHO IS TOLD (D8): an active account, and an account in its closure grace (suspended), which still has its address. An erased account is told
-- nothing and nothing waits for it: its statements go with it (CASCADE), and nothing keeps an address to make a statement possible.
-- SINCE WHEN (D9): from 0156's own start, once, so a step since 0156 applied gets its statement; a step from before 0157 has no recorded ground,
-- and its statement says so and how to ask. Nothing before 0156 is told. 0156's own queue goes on beside this one for the release before.
CREATE TABLE IF NOT EXISTS identity.moderation_statement (
  statement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT moderation_statement_kind_check CHECK (kind IN ('DEBATE_HIDDEN','DEBATE_DECIDED','CONTRIBUTION_REMOVED','REPORT_REMOVED','CORRECTED','CONTRIBUTION_AFFECTED','REPORT_AFFECTED')),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  event_id uuid REFERENCES identity.public_review_event(event_id),
  decision_id uuid REFERENCES identity.moderation_decision(decision_id),
  -- Whose grounds this statement gives: the step itself, the corrections it lists, or the step that took this person's content along.
  ground_events uuid[] NOT NULL DEFAULT '{}'::uuid[],
  piece_kind text CONSTRAINT moderation_statement_piece_kind_check CHECK (piece_kind IN ('DIG','REPORT')),
  piece_id uuid,
  places jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT moderation_statement_places_check CHECK (jsonb_typeof(places) = 'array' AND jsonb_array_length(places) <= 200),
  mail_locale text NOT NULL CONSTRAINT moderation_statement_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr')),
  happened_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CONSTRAINT moderation_statement_attempts_check CHECK (attempts BETWEEN 0 AND 20),
  claim_token uuid,
  claim_expires_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  CONSTRAINT moderation_statement_one_source CHECK ((event_id IS NULL) <> (decision_id IS NULL)),
  CONSTRAINT moderation_statement_piece_shape CHECK ((piece_kind IS NULL) = (piece_id IS NULL)),
  CONSTRAINT moderation_statement_claim_shape CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CONSTRAINT moderation_statement_settled_once CHECK (NOT (delivered_at IS NOT NULL AND failed_at IS NOT NULL)),
  CONSTRAINT moderation_statement_event_once UNIQUE (owner_ref, kind, event_id, piece_id),
  CONSTRAINT moderation_statement_decision_once UNIQUE (owner_ref, kind, decision_id)
);
CREATE INDEX IF NOT EXISTS moderation_statement_open ON identity.moderation_statement (created_at, statement_id) WHERE delivered_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS moderation_statement_owner ON identity.moderation_statement (owner_ref, happened_at);
SELECT core.install_truncate_guard('identity.moderation_statement');
-- Each log row and decision the queue has read, once, whether or not anyone was left to tell.
CREATE TABLE IF NOT EXISTS identity.moderation_statement_seen (
  source_id uuid PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SELECT core.install_truncate_guard('identity.moderation_statement_seen');
-- When the queue's watch starts (D9): 0156's own start, once, never moved.
CREATE TABLE IF NOT EXISTS identity.moderation_statement_since (
  only_row boolean PRIMARY KEY DEFAULT true CONSTRAINT moderation_statement_since_one CHECK (only_row),
  since timestamptz NOT NULL
);
SELECT core.install_truncate_guard('identity.moderation_statement_since');
DROP TRIGGER IF EXISTS reject_mutation ON identity.moderation_statement_since;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.moderation_statement_since FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
INSERT INTO identity.moderation_statement_since (since) SELECT start.since FROM identity.moderation_notice_since AS start ON CONFLICT (only_row) DO NOTHING;

-- The debate's newest owner, as 0156 finds it.
CREATE OR REPLACE FUNCTION identity.moderation_debate_owner(p_publication_ref uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
  WHERE ownership.run_id = core.run_of_publication(p_publication_ref) ORDER BY ownership.at_seq DESC LIMIT 1
$$;
-- One statement for one person, in the language of their newest Terms acceptance (English when it is not a mail language), only while the
-- account is active or in its closure grace (D8). Nobody to tell: nothing is written.
CREATE OR REPLACE FUNCTION identity.state_moderation(p_owner_ref uuid, p_kind text, p_publication_ref uuid, p_event_id uuid, p_decision_id uuid, p_ground_events uuid[],
  p_piece_kind text, p_piece_id uuid, p_places jsonb, p_happened_at timestamptz) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO identity.moderation_statement (owner_ref, kind, publication_ref, event_id, decision_id, ground_events, piece_kind, piece_id, places, mail_locale, happened_at)
  SELECT identity_user.owner_ref, p_kind, p_publication_ref, p_event_id, p_decision_id, COALESCE(p_ground_events, '{}'::uuid[]), p_piece_kind, p_piece_id, COALESCE(p_places, '[]'::jsonb),
    COALESCE((SELECT acceptance.locale FROM legal.acceptance AS acceptance WHERE acceptance.owner_ref = identity_user.owner_ref AND acceptance.kind = 'TERMS'
      AND acceptance.locale = ANY (ARRAY['bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr'])
      ORDER BY acceptance.accepted_at DESC, acceptance.recorded_at DESC LIMIT 1), 'en'),
    p_happened_at
  FROM identity."user" AS identity_user WHERE identity_user.owner_ref = p_owner_ref AND identity_user.state IN ('active','suspended')
  ON CONFLICT DO NOTHING
$$;
-- From the log and the decisions to the statements: each unseen row since the start, oldest first, at most 200 a call. Two senders at once: one
-- wins each row (the seen row is written first, under its primary key).
CREATE OR REPLACE FUNCTION identity.queue_moderation_statements() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_review_event%ROWTYPE; d identity.moderation_decision%ROWTYPE; v_count integer := 0; v_owner uuid; v_row record; v_since timestamptz; v_opened integer;
BEGIN
  SELECT start.since INTO v_since FROM identity.moderation_statement_since AS start;
  FOR v IN SELECT event.* FROM identity.public_review_event AS event
    WHERE event.recorded_at >= v_since AND event.action IN ('HIDE','REMOVE_DIG','HIDE_REPORT','REPUBLISH')
      AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = event.event_id)
    ORDER BY event.recorded_at, event.event_id LIMIT 200 LOOP
    INSERT INTO identity.moderation_statement_seen (source_id) VALUES (v.event_id) ON CONFLICT (source_id) DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_count := v_count + 1;
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
  END LOOP;
  FOR d IN SELECT decision.* FROM identity.moderation_decision AS decision
    WHERE NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = decision.decision_id)
    ORDER BY decision.recorded_at, decision.decision_id LIMIT 200 LOOP
    INSERT INTO identity.moderation_statement_seen (source_id) VALUES (d.decision_id) ON CONFLICT (source_id) DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_count := v_count + 1;
    PERFORM identity.state_moderation(identity.moderation_debate_owner(d.publication_ref), 'DEBATE_DECIDED', d.publication_ref, NULL, d.decision_id, '{}'::uuid[], NULL, NULL, NULL, d.recorded_at);
  END LOOP;
  RETURN v_count;
END $$;

-- What a statement says, whatever its kind: the grounds (for the automatic hide, read from 0151's row), whether a person decided it for now
-- (interim), the source (with the report), and how automated means were used. recorded false: a step from before 0157 kept no ground (D9).
CREATE OR REPLACE FUNCTION identity.moderation_statement_ground(p_statement_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s identity.moderation_statement%ROWTYPE; d identity.moderation_decision%ROWTYPE; v_grounds text[] := '{}'; v_suspected text[] := '{}'; v_sources text[] := '{}';
  v_flag uuid; v_detected boolean := false; v_decided boolean := false; v_interim boolean := false; v_recorded boolean := false; v_event record;
BEGIN
  SELECT * INTO s FROM identity.moderation_statement AS statement WHERE statement.statement_id = p_statement_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s.decision_id IS NOT NULL THEN
    SELECT * INTO d FROM identity.moderation_decision AS decision WHERE decision.decision_id = s.decision_id;
    v_grounds := d.grounds; v_sources := ARRAY[d.source]; v_flag := d.flag_id; v_recorded := true;
  ELSE
    FOR v_event IN SELECT event.event_id, event.action, event.actor_staff_id, event.operation_id, ground.grounds, ground.suspected, ground.source, ground.flag_id, ground.interim
      FROM identity.public_review_event AS event LEFT JOIN identity.moderation_ground AS ground ON ground.event_id = event.event_id
      WHERE event.event_id = ANY (s.ground_events) LOOP
      IF v_event.action = 'HIDE' AND v_event.actor_staff_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        -- 0151's automatic hide: the report it settled is its source, an AI found it and the hide itself was automated, pending a person.
        SELECT flag.flag_id, CASE flag.reason WHEN 'CONTENT' THEN ARRAY['UNLAWFUL','HATE_SPEECH'] WHEN 'PERSONAL' THEN ARRAY['PERSONAL_DATA'] ELSE '{}'::text[] END
          INTO v_flag, v_suspected FROM identity.public_flag AS flag WHERE flag.flag_id = v_event.operation_id;
        v_grounds := v_grounds || ARRAY['REVIEW_HOLD']; v_sources := v_sources || ARRAY['REPORT_BUTTON']; v_decided := true; v_interim := true; v_recorded := true;
      ELSIF v_event.grounds IS NOT NULL THEN
        v_grounds := v_grounds || v_event.grounds; v_suspected := v_suspected || v_event.suspected; v_sources := v_sources || ARRAY[v_event.source];
        v_flag := COALESCE(v_flag, v_event.flag_id); v_interim := v_interim OR v_event.interim; v_recorded := true;
      END IF;
    END LOOP;
  END IF;
  -- An AI read the report that led here (0151's check), so automated means helped detect it.
  v_detected := v_decided OR EXISTS (SELECT 1 FROM identity.public_flag AS flag WHERE flag.flag_id = v_flag AND flag.judge_model_id IS NOT NULL);
  RETURN jsonb_build_object('recorded', v_recorded, 'interim', v_interim,
    'grounds', COALESCE((SELECT jsonb_agg(DISTINCT code ORDER BY code) FROM unnest(v_grounds) AS code), '[]'::jsonb),
    'suspected', COALESCE((SELECT jsonb_agg(DISTINCT code ORDER BY code) FROM unnest(v_suspected) AS code), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(DISTINCT code ORDER BY code) FROM unnest(v_sources) AS code), '[]'::jsonb),
    'automated_detection', v_detected, 'automated_decision', v_decided);
END $$;

-- The API's sender: claim, read, settle, as 0156's ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION identity.claim_moderation_statements(p_limit integer)
RETURNS TABLE(statement_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MODERATION_STATEMENT_LIMIT_INVALID'; END IF;
  PERFORM identity.queue_moderation_statements();
  RETURN QUERY WITH picked AS (
    SELECT s.statement_id FROM identity.moderation_statement AS s
    WHERE s.delivered_at IS NULL AND s.failed_at IS NULL AND (s.claim_expires_at IS NULL OR s.claim_expires_at <= clock_timestamp())
    ORDER BY s.created_at, s.statement_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE identity.moderation_statement AS s SET claim_token = gen_random_uuid(), claim_expires_at = clock_timestamp() + interval '5 minutes'
    FROM picked WHERE s.statement_id = picked.statement_id RETURNING s.statement_id, s.claim_token;
END $$;
-- Under a live claim: the account's own address (read now), the kind, the moment, the language, the item and what the mail may say of the
-- ground. Never the facts, the quote, a staff id or the reporter. NULL: no live claim, or nobody to send to now.
CREATE OR REPLACE FUNCTION identity.read_moderation_statement(p_statement_id uuid, p_claim uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('userId', identity_user.user_id, 'statementId', s.statement_id, 'kind', s.kind, 'happenedAt', s.happened_at, 'mailLocale', s.mail_locale,
    'publicationRef', s.publication_ref, 'ground', identity.moderation_statement_ground(s.statement_id), 'emailCiphertext', identity_user.email_ciphertext)
  FROM identity.moderation_statement AS s JOIN identity."user" AS identity_user ON identity_user.owner_ref = s.owner_ref AND identity_user.state IN ('active','suspended')
  WHERE s.statement_id = p_statement_id AND s.claim_token = p_claim AND s.claim_expires_at > clock_timestamp()
$$;
CREATE OR REPLACE FUNCTION identity.complete_moderation_statement(p_statement_id uuid, p_claim uuid, p_outcome text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_found boolean;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('SENT','RETRY','DROPPED') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MODERATION_STATEMENT_OUTCOME_INVALID'; END IF;
  UPDATE identity.moderation_statement AS s SET claim_token = NULL, claim_expires_at = NULL, attempts = least(s.attempts + 1, 20),
    delivered_at = CASE WHEN p_outcome = 'SENT' THEN clock_timestamp() END,
    failed_at = CASE WHEN p_outcome = 'DROPPED' OR (p_outcome = 'RETRY' AND s.attempts >= 19) THEN clock_timestamp() END
  WHERE s.statement_id = p_statement_id AND s.claim_token = p_claim AND s.claim_expires_at > clock_timestamp();
  v_found := FOUND;
  RETURN v_found;
END $$;

-- The signed-in page (D1): the person's own statements, newest first, each with what the mail says and, sealed under its debate's key, the
-- facts a person typed and the automatic hide's quote (the debate's owner only). The API opens them; nobody else's statement is ever read.
CREATE OR REPLACE FUNCTION identity.read_own_moderation_statements(p_owner_ref uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('statement_id', s.statement_id, 'kind', s.kind, 'publication_ref', s.publication_ref,
      'run_id', core.run_of_publication(s.publication_ref), 'happened_at', s.happened_at, 'piece_kind', s.piece_kind, 'places', s.places,
      'ground', identity.moderation_statement_ground(s.statement_id), 'hidden_now', identity.public_review_held(s.publication_ref),
      'facts', CASE WHEN s.decision_id IS NOT NULL THEN (SELECT jsonb_build_array(decision.facts_ciphertext) FROM identity.moderation_decision AS decision WHERE decision.decision_id = s.decision_id)
        ELSE COALESCE((SELECT jsonb_agg(ground.facts_ciphertext ORDER BY ground.recorded_at) FROM identity.moderation_ground AS ground
          WHERE ground.event_id = ANY (s.ground_events) AND ground.facts_ciphertext IS NOT NULL AND s.kind NOT IN ('CONTRIBUTION_AFFECTED','REPORT_AFFECTED')), '[]'::jsonb) END,
      'facts_deleted', EXISTS (SELECT 1 FROM identity.moderation_ground AS ground WHERE ground.event_id = ANY (s.ground_events) AND ground.facts_deleted_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM identity.moderation_decision AS decision WHERE decision.decision_id = s.decision_id AND decision.facts_deleted_at IS NOT NULL),
      'quote', CASE WHEN s.kind = 'DEBATE_HIDDEN' THEN (SELECT quote.quote_ciphertext FROM identity.public_review_event AS event JOIN identity.public_flag_quote AS quote ON quote.flag_id = event.operation_id
        WHERE event.event_id = ANY (s.ground_events) AND event.actor_staff_id = '00000000-0000-0000-0000-000000000000'::uuid LIMIT 1) END)
    ORDER BY s.happened_at DESC, s.statement_id), '[]'::jsonb)
  FROM identity.moderation_statement AS s WHERE s.owner_ref = p_owner_ref AND p_owner_ref IS NOT NULL
$$;
-- Twelve months after a step, the words a person typed and the automatic hide's quote go; the codes, the digest and the statement stay
-- (the six months to complain, and six more for a complaint or an out-of-court body to finish). The API's sweep; returns how many went.
CREATE OR REPLACE FUNCTION identity.delete_moderation_words_due() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows integer; v_total integer := 0;
BEGIN
  UPDATE identity.moderation_ground SET facts_ciphertext = NULL, facts_deleted_at = clock_timestamp()
  WHERE facts_ciphertext IS NOT NULL AND recorded_at < clock_timestamp() - interval '12 months';
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_total := v_total + v_rows;
  UPDATE identity.moderation_decision SET facts_ciphertext = NULL, facts_deleted_at = clock_timestamp()
  WHERE facts_ciphertext IS NOT NULL AND recorded_at < clock_timestamp() - interval '12 months';
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_total := v_total + v_rows;
  UPDATE identity.public_flag_quote SET quote_ciphertext = NULL, quote_deleted_at = clock_timestamp()
  WHERE quote_ciphertext IS NOT NULL AND recorded_at < clock_timestamp() - interval '12 months';
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_total := v_total + v_rows;
  RETURN v_total;
END $$;

-- Gap 5, the digger's own line: an allowed dig whose rows are off the public page while a review runs, because its debate is hidden or an
-- earlier dig was taken out (0150's rule), is not "on the page"; a dig the hide settled is kept private by the review, not by its own check.
CREATE OR REPLACE FUNCTION identity.read_own_contribution_review(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('dig_run_id', contribution.dig_run_id,
      'off_for_review', contribution.outcome = 'ALLOWED'
        AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS removal WHERE removal.action = 'REMOVE_DIG' AND removal.piece_id = contribution.dig_run_id)
        AND (identity.public_review_held(contribution.publication_ref)
          OR EXISTS (SELECT 1 FROM identity.public_debate_update AS update_row WHERE update_row.dig_run_id = contribution.dig_run_id
            AND identity.public_review_row_off(update_row.publication_ref, update_row.update_id, update_row.dig_run_id, update_row.update_seq))),
      'kept_private_by_review', EXISTS (SELECT 1 FROM identity.public_review_detached AS detached WHERE detached.dig_run_id = contribution.dig_run_id))
    ORDER BY contribution.contributed_at, contribution.dig_run_id), '[]'::jsonb)
  FROM identity.public_contribution AS contribution
  WHERE contribution.owner_ref = p_owner_ref AND p_owner_ref IS NOT NULL
    AND (contribution.dig_run_id = p_run_id OR contribution.parent_run_id = p_run_id OR contribution.root_run_id = p_run_id)
$$;

-- 5. Ownership and the exact grants of section 4 ------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and the new functions their owner, the owner of 0150's identity functions; touches no earlier object
DO $moderation_statement_owner$
DECLARE v_owner name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_statement','identity.moderation_statement_seen','identity.moderation_statement_since'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_debate_owner(uuid)','identity.state_moderation(uuid,text,uuid,uuid,uuid,uuid[],text,uuid,jsonb,timestamptz)',
    'identity.queue_moderation_statements()','identity.moderation_statement_ground(uuid)','identity.claim_moderation_statements(integer)',
    'identity.read_moderation_statement(uuid,uuid)','identity.complete_moderation_statement(uuid,uuid,text)','identity.read_own_moderation_statements(uuid)',
    'identity.delete_moderation_words_due()','identity.read_own_contribution_review(uuid,uuid)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
END
$moderation_statement_owner$;
GRANT EXECUTE ON FUNCTION identity.claim_moderation_statements(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_moderation_statement(uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.complete_moderation_statement(uuid,uuid,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_own_moderation_statements(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.delete_moderation_words_due() TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_own_contribution_review(uuid,uuid) TO debateai_runtime;

-- 6. The answers to people who report (D4) -----------------------------------------------------------------------------------------
-- A person's close of a report says what they found: NO_BREACH (nothing to act on) or ACTED (they acted on it). It is kept here, beside
-- 0151's dismissal, which the close also writes through identity.public_flag_dismiss (the one move 0151's guard allows; the words' six
-- months run from it). Cannot be edited.
CREATE TABLE IF NOT EXISTS identity.public_flag_answer (
  flag_id uuid PRIMARY KEY REFERENCES identity.public_flag(flag_id),
  outcome text NOT NULL CONSTRAINT public_flag_answer_outcome_check CHECK (outcome IN ('NO_BREACH','ACTED')),
  actor_staff_id uuid NOT NULL,
  operation_id uuid NOT NULL CONSTRAINT public_flag_answer_operation_once UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SELECT core.install_truncate_guard('identity.public_flag_answer');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_flag_answer;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_flag_answer FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
-- The mails to the reporter, one of each kind per report at most: RECEIPT (a stored report went to a person), AUTO_HIDDEN and AUTO_NOT_FOUND
-- (the automatic check decided, with no person), NO_BREACH and ACTED (a person decided: a close, or a review step that names the report as its
-- source). No address, no words and no name here: the reporter is read from 0151's row at sending time, so an erased reporter (whose link 0151
-- sets to NULL) is never mailed.
CREATE TABLE IF NOT EXISTS identity.public_flag_mail (
  mail_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id uuid NOT NULL REFERENCES identity.public_flag(flag_id),
  kind text NOT NULL CONSTRAINT public_flag_mail_kind_check CHECK (kind IN ('RECEIPT','AUTO_HIDDEN','AUTO_NOT_FOUND','NO_BREACH','ACTED')),
  happened_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claim_token uuid,
  claim_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CONSTRAINT public_flag_mail_attempts_check CHECK (attempts BETWEEN 0 AND 20),
  delivered_at timestamptz,
  failed_at timestamptz,
  CONSTRAINT public_flag_mail_once UNIQUE (flag_id, kind),
  CONSTRAINT public_flag_mail_claim_pair CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CONSTRAINT public_flag_mail_one_end CHECK (NOT (delivered_at IS NOT NULL AND failed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS public_flag_mail_pending ON identity.public_flag_mail (created_at) WHERE delivered_at IS NULL AND failed_at IS NULL;
SELECT core.install_truncate_guard('identity.public_flag_mail');
-- What happens to a report from the moment this step applied is answered (a receipt, a decision); nothing before.
CREATE TABLE IF NOT EXISTS identity.public_flag_mail_since (
  only_row boolean PRIMARY KEY DEFAULT true CONSTRAINT public_flag_mail_since_one CHECK (only_row),
  since timestamptz NOT NULL
);
SELECT core.install_truncate_guard('identity.public_flag_mail_since');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_flag_mail_since;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_flag_mail_since FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
INSERT INTO identity.public_flag_mail_since (since) VALUES (clock_timestamp()) ON CONFLICT (only_row) DO NOTHING;

-- The language of a person's mail: their newest Terms acceptance in a language mail is written in, else English (as 0156's).
CREATE OR REPLACE FUNCTION identity.moderation_mail_locale(p_owner_ref uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE((SELECT acceptance.locale FROM legal.acceptance AS acceptance WHERE acceptance.owner_ref = p_owner_ref AND acceptance.kind = 'TERMS'
      AND acceptance.locale = ANY (ARRAY['bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr'])
    ORDER BY acceptance.accepted_at DESC, acceptance.recorded_at DESC LIMIT 1), 'en')
$$;
-- From 0151's rows, this step's answers and the review steps to the mails: what is new since the start, at most 200 of each a call.
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
    UNION ALL
      SELECT decision.flag_id, 'ACTED', decision.recorded_at FROM identity.moderation_decision AS decision
      WHERE decision.flag_id IS NOT NULL AND decision.source = 'REPORT_BUTTON') AS due
    JOIN identity.public_flag AS flag ON flag.flag_id = due.flag_id
  WHERE due.happened_at >= v_since AND flag.reporter_ref IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM identity.public_flag_mail AS mail WHERE mail.flag_id = due.flag_id AND mail.kind = due.kind)
  GROUP BY due.flag_id, due.kind ORDER BY min(due.happened_at), due.flag_id LIMIT 200
  ON CONFLICT (flag_id, kind) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + v_rows;
  RETURN v_count;
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
    ORDER BY mail.created_at, mail.mail_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE identity.public_flag_mail AS mail SET claim_token = gen_random_uuid(), claim_expires_at = clock_timestamp() + interval '5 minutes'
    FROM picked WHERE mail.mail_id = picked.mail_id RETURNING mail.mail_id, mail.claim_token;
END $$;
-- Under a live claim: the reporter's own address (read now), the kind, the moment, the language and the debate. Never the report's words, the
-- debate's text or a staff id. NULL: no live claim, or no reporter to send to now (erased, or no longer active or in their closure grace).
CREATE OR REPLACE FUNCTION identity.read_public_flag_mail(p_mail_id uuid, p_claim uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('userId', identity_user.user_id, 'mailId', mail.mail_id, 'kind', mail.kind, 'happenedAt', mail.happened_at,
    'mailLocale', identity.moderation_mail_locale(identity_user.owner_ref), 'publicationRef', flag.publication_ref, 'emailCiphertext', identity_user.email_ciphertext)
  FROM identity.public_flag_mail AS mail JOIN identity.public_flag AS flag ON flag.flag_id = mail.flag_id
    JOIN identity."user" AS identity_user ON identity_user.owner_ref = flag.reporter_ref AND identity_user.state IN ('active','suspended')
  WHERE mail.mail_id = p_mail_id AND mail.claim_token = p_claim AND mail.claim_expires_at > clock_timestamp()
$$;
CREATE OR REPLACE FUNCTION identity.complete_public_flag_mail(p_mail_id uuid, p_claim uuid, p_outcome text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_found boolean;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('SENT','RETRY','DROPPED') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_MAIL_OUTCOME_INVALID'; END IF;
  UPDATE identity.public_flag_mail AS mail SET claim_token = NULL, claim_expires_at = NULL, attempts = least(mail.attempts + 1, 20),
    delivered_at = CASE WHEN p_outcome = 'SENT' THEN clock_timestamp() END,
    failed_at = CASE WHEN p_outcome = 'DROPPED' OR (p_outcome = 'RETRY' AND mail.attempts >= 19) THEN clock_timestamp() END
  WHERE mail.mail_id = p_mail_id AND mail.claim_token = p_claim AND mail.claim_expires_at > clock_timestamp();
  v_found := FOUND;
  RETURN v_found;
END $$;
-- A report left CHECKING (the API stopped between the press and the check's answer) is settled as the check being unavailable after five
-- minutes, through 0151's own settle: it goes to a person, and the two accounts are told (PUBLIC_FLAG_WAITING). Returns how many.
CREATE OR REPLACE FUNCTION identity.settle_stuck_public_flags() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_flag uuid; v_count integer := 0;
BEGIN
  FOR v_flag IN SELECT flag.flag_id FROM identity.public_flag AS flag WHERE flag.state = 'CHECKING' AND flag.created_at < clock_timestamp() - interval '5 minutes'
    ORDER BY flag.created_at, flag.flag_id LIMIT 100 LOOP
    IF identity.settle_public_flag(v_flag, 'UNAVAILABLE', NULL, NULL, NULL, NULL, NULL, NULL) = 'QUEUED' THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END $$;
-- The close's identity half: 0151's dismissal, then the outcome. Raises as 0151's does for an unknown or already-closed report.
CREATE OR REPLACE FUNCTION identity.public_flag_close(p_flag_id uuid, p_outcome text, p_actor uuid, p_operation uuid, p_request_sha256 text) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_at timestamptz;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('NO_BREACH','ACTED') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_OUTCOME_INVALID'; END IF;
  v_at := identity.public_flag_dismiss(p_flag_id, p_actor, p_operation, p_request_sha256);
  INSERT INTO identity.public_flag_answer (flag_id, outcome, actor_staff_id, operation_id, recorded_at) VALUES (p_flag_id, p_outcome, p_actor, p_operation, v_at);
  RETURN v_at;
END $$;
-- The queue as 0151 reads it, each report with its close's outcome (null: not closed by this release's close).
CREATE OR REPLACE FUNCTION identity.public_flag_queue_answered() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_agg(row_found.value || jsonb_build_object('outcome', (SELECT answer.outcome FROM identity.public_flag_answer AS answer WHERE answer.flag_id = (row_found.value->>'flag_id')::uuid))
    ORDER BY row_found.at), '[]'::jsonb)
  FROM jsonb_array_elements(identity.public_flag_queue()) WITH ORDINALITY AS row_found(value, at)
$$;
-- Staff's two doors (0151's pair stays for the release before): the queue with its outcomes, and the close. The close is 0151's Dismiss with
-- the outcome bound into the passkey's body, under the same action name (PUBLIC_REPORT_DISMISS), so the proof's action list does not move.
CREATE OR REPLACE FUNCTION staff.read_public_flag_queue_answered(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  PERFORM identity.public_flag_mark_read((p_context->>'staffId')::uuid);
  v := identity.public_flag_queue_answered();
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION staff.public_flag_close(p_context jsonb,p_proof uuid,p_binding jsonb,p_flag uuid,p_outcome text,p_operation uuid,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid; v_request jsonb; v_sha text; v_replay jsonb; v_at timestamptz;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  IF staff.authorize_action(p_context,'TEAM_LIMIT_SET') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  IF p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('NO_BREACH','ACTED') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PUBLIC_FLAG_OUTCOME_INVALID'; END IF;
  IF p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(register.canonical_json_text(json_build_object('action','PUBLIC_REPORT_DISMISS','target_id',p_flag::text,'outcome',p_outcome,'expected_revision',0,'operation_id',p_operation::text)::text),'UTF8')),'hex')
    OR p_binding->'expectedRevision' IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID';
  END IF;
  v_request:=jsonb_build_array(v_staff,p_binding,p_flag,p_outcome,p_operation);
  v_sha:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
  v_replay:=identity.public_flag_replay(p_operation,v_sha);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET','PUBLIC_REPORT_DISMISS',p_flag,p_operation);
  v_at:=identity.public_flag_close(p_flag,p_outcome,v_staff,p_operation,v_sha);
  PERFORM staff.record_mutation(p_operation,'PUBLIC_REVIEW_CHANGED',v_staff,v_staff,jsonb_build_object('code','SECURITY_RESPONSE'),v_user,p_alert,v_request);
  RETURN jsonb_build_object('operationId',p_operation,'outcome','COMPLETED','recordedAt',v_at);
END $$;

-- 7. Ownership and the exact grants of section 6 ------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and the new functions their owners, the owners of 0150's identity and staff functions; touches no earlier object
DO $public_flag_answer_owner$
DECLARE v_owner name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.public_flag_answer','identity.public_flag_mail','identity.public_flag_mail_since'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_mail_locale(uuid)','identity.queue_public_flag_mail()','identity.claim_public_flag_mail(integer)',
    'identity.read_public_flag_mail(uuid,uuid)','identity.complete_public_flag_mail(uuid,uuid,text)','identity.settle_stuck_public_flags()',
    'identity.public_flag_close(uuid,text,uuid,uuid,text)','identity.public_flag_queue_answered()'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  -- Staff's doors call the identity side, as 0151's do.
  FOREACH v_name IN ARRAY ARRAY['identity.public_flag_close(uuid,text,uuid,uuid,text)','identity.public_flag_queue_answered()'] LOOP
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO debateai_staff_security_owner', v_name);
  END LOOP;
END
$public_flag_answer_owner$;
ALTER FUNCTION staff.read_public_flag_queue_answered(jsonb,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.public_flag_close(jsonb,uuid,jsonb,uuid,text,uuid,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_public_flag_queue_answered(jsonb,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
REVOKE ALL ON FUNCTION staff.public_flag_close(jsonb,uuid,jsonb,uuid,text,uuid,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_public_flag_queue_answered(jsonb,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.public_flag_close(jsonb,uuid,jsonb,uuid,text,uuid,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.claim_public_flag_mail(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_flag_mail(uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.complete_public_flag_mail(uuid,uuid,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.settle_stuck_public_flags() TO debateai_runtime;

-- 8. The person's own data export (D1, D4) ------------------------------------------------------------------------------------------
-- Everything this step keeps about the person, and 0156's notices: their statements of reasons in full (the facts and the quote stay sealed
-- under each debate's key, for the worker to open), whether each was emailed, 0156's earlier notices, and for each report they made how it was
-- closed and which mails went (matched to 0152's report rows by debate and time; 0152's reader is left as it is).
CREATE OR REPLACE FUNCTION identity.read_data_export_moderation(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN jsonb_build_object(
    'statements', (SELECT COALESCE(jsonb_agg(own.value || jsonb_build_object('emailed_at', statement.delivered_at) ORDER BY own.at), '[]'::jsonb)
      FROM jsonb_array_elements(identity.read_own_moderation_statements(v_owner_ref)) WITH ORDINALITY AS own(value, at)
        JOIN identity.moderation_statement AS statement ON statement.statement_id = (own.value->>'statement_id')::uuid),
    'earlier_notices', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', notice.kind, 'publication_ref', event.publication_ref, 'happened_at', notice.happened_at,
        'emailed_at', notice.delivered_at) ORDER BY notice.happened_at, notice.notice_id), '[]'::jsonb)
      FROM identity.moderation_notice AS notice JOIN identity.public_review_event AS event ON event.event_id = notice.event_id WHERE notice.owner_ref = v_owner_ref),
    'report_answers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('publication_ref', flag.publication_ref, 'created_at', flag.created_at,
        'closed_as', (SELECT answer.outcome FROM identity.public_flag_answer AS answer WHERE answer.flag_id = flag.flag_id),
        'emails', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', mail.kind, 'emailed_at', mail.delivered_at) ORDER BY mail.created_at, mail.mail_id), '[]'::jsonb)
          FROM identity.public_flag_mail AS mail WHERE mail.flag_id = flag.flag_id)) ORDER BY flag.created_at, flag.flag_id), '[]'::jsonb)
      FROM identity.public_flag AS flag WHERE flag.reporter_ref = v_owner_ref));
END $$;
-- n1: reviewed gives only the new tables and the new functions their owner (here, the export's one reader), the owner of 0150's identity functions; touches no earlier object
DO $moderation_export_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_data_export_moderation(uuid,uuid) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.read_data_export_moderation(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
END
$moderation_export_owner$;
GRANT EXECUTE ON FUNCTION identity.read_data_export_moderation(uuid,uuid) TO debateai_data_export_worker;
