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
