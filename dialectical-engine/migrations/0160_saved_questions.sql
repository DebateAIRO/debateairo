-- 0160 · A person's questions not started yet, each under a key of its own (V4 start step; plan
-- docs/superpowers/plans/2026-11-03-v4-start-step.md Task 39d; spec docs/superpowers/specs/2026-11-04-v4-start-step-saved-questions.md
-- §3.1, §3.8, §3.14; owner answers S3 A, S4 A and S5 A of 4 Nov 2026).
--
-- Plain words. Once a person presses Next and the question passes its check, their account keeps the question and all of step 2 until
-- Start, Delete or the account's closing: at most 20 per account (S3 A). Each kept question is encrypted under a key of its own, which the
-- person's account key locks exactly as it locks a debate's key (S4 A); that key is a file outside the database (packages/crypto
-- FileSavedQuestionKeyStore), never here. This step keeps the two encrypted parts (a short title for the list, and the whole step 2) and,
-- in the clear, nothing but ids, a revision and two times.
--
--   §1 identity.saved_question: one row per kept question, keyed by the account's owner_ref with ON DELETE CASCADE, so account erasure
--      (0110's identity.finalize_account_erasure deletes the identity."user" row) removes the rows with the account. Both parts are
--      envelopes naming this row's own key, saved-question:<id>:v1, and no other: no text column, no key column, no fingerprint of the
--      words, no plan or version, no link to core.run (a saved question is not a debate, and the table is not a content carrier).
--   §2 the API's five functions, for debateai_billing_runtime alone (the API's own role, as 0131; never the runtime role the runner and
--      the scheduler share): create, save, the list, one read and the delete, each for the account the API passes from the sign-in.
--   §3 identity.read_data_export_saved_questions(uuid,uuid): every row of the account with both parts, for its data export, for the export
--      worker alone, behind 0128's lease gate.
--   §4 one owner for all of it, 0115's export owner (as 0131 §6), then the grants.
--   §5 the closing block: the contract this file claims, checked rather than assumed (as 0131 §7).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and six new functions; the release before reads and writes none of them, so it keeps
--                   running beside it. No earlier function, table or trigger changes: 0040, 0110 and 0131 are untouched (the account's
--                   closing removes the rows through the cascade, and destroys the question keys in its own key step, in the API).
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql (0130's, which 0159 keeps)
--                   stays in force and the manifest names it.
--   row security    Row security: outside 0130's scope rule: no request role can SELECT this table.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function another migration defines. Replay-safe in the repository's
-- form (tools/orphan-audit auditMigrationReplaySafety), as 0131: CREATE TABLE / INDEX IF NOT EXISTS with their constraints inline, CREATE OR
-- REPLACE FUNCTION of names no earlier migration defines, and core.install_truncate_guard (idempotent, 0056).

-- 1. The kept questions ---------------------------------------------------------------------------------------------------------
-- One row per question the person has not started yet. The id is the API's (randomUUID, a v4 uuid), chosen before the question's key is
-- made, because the key's name holds it. revision goes up by one at every save, so of two windows the one that saved first wins. The title
-- (the question's first line, for the list) and the content (all of step 2) are envelopes under the question's own key. Each envelope
-- CHECK is a table constraint that names the row's own id, written out in full (no role needs EXECUTE on core.is_content_envelope, which
-- 0038 keeps from PUBLIC): an object of exactly v, keyId, nonce, ct and tag, version 1, the key saved-question:<this id>:v1 (a part sealed
-- under the account's key, a debate's key or another row's question key is refused), three strings, and a cap on the stored size. A
-- missing member reads NULL and a CHECK passes on NULL, so each check is closed with COALESCE(..., false), and CASE keeps the operators
-- that need an object from ever meeting anything else.
CREATE TABLE IF NOT EXISTS identity.saved_question (
  saved_question_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  revision integer NOT NULL CONSTRAINT saved_question_revision_check CHECK (revision >= 1),
  title_ciphertext jsonb NOT NULL,
  content_ciphertext jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT saved_question_title_envelope CHECK (COALESCE(CASE WHEN jsonb_typeof(title_ciphertext) = 'object' THEN
    title_ciphertext ?& ARRAY['v','keyId','nonce','ct','tag']
    AND title_ciphertext - ARRAY['v','keyId','nonce','ct','tag'] = '{}'::jsonb
    AND title_ciphertext->>'v' = '1'
    AND title_ciphertext->>'keyId' = 'saved-question:' || saved_question_id::text || ':v1'
    AND jsonb_typeof(title_ciphertext->'nonce') = 'string'
    AND jsonb_typeof(title_ciphertext->'ct') = 'string'
    AND jsonb_typeof(title_ciphertext->'tag') = 'string'
    AND octet_length(title_ciphertext::text) <= 2048
    ELSE false END, false)),
  CONSTRAINT saved_question_content_envelope CHECK (COALESCE(CASE WHEN jsonb_typeof(content_ciphertext) = 'object' THEN
    content_ciphertext ?& ARRAY['v','keyId','nonce','ct','tag']
    AND content_ciphertext - ARRAY['v','keyId','nonce','ct','tag'] = '{}'::jsonb
    AND content_ciphertext->>'v' = '1'
    AND content_ciphertext->>'keyId' = 'saved-question:' || saved_question_id::text || ':v1'
    AND jsonb_typeof(content_ciphertext->'nonce') = 'string'
    AND jsonb_typeof(content_ciphertext->'ct') = 'string'
    AND jsonb_typeof(content_ciphertext->'tag') = 'string'
    AND octet_length(content_ciphertext::text) <= 917504
    ELSE false END, false))
);
-- The list (the account's newest first) and the cascade.
CREATE INDEX IF NOT EXISTS saved_question_owner_recent ON identity.saved_question (owner_ref, updated_at DESC, saved_question_id);
SELECT core.install_truncate_guard('identity.saved_question');

-- 2. The API's functions ----------------------------------------------------------------------------------------------------------
-- The account is the one the API passes from the sign-in (0131's rule: the database does not check the session again). A write needs an
-- active account: once a closing's prepare sets the account suspended (0110), no save is accepted, and the API destroys the key it made
-- for the refused write. Every function names the account in its WHERE, so another account's id reads and writes as a missing one.

-- The first save. Refusals, each 22023: SAVED_QUESTION_ACCOUNT_INVALID (no active account with that owner_ref) and SAVED_QUESTION_ID_TAKEN
-- (the id is already a row, this account's or another's). With 20 rows already, it writes nothing and answers FULL (owner answer S3 A).
-- One account's creates run one at a time under a transaction lock ('identity:saved-questions:<owner_ref>', as 0157's
-- core.record_start_paths takes one per run), so the count and the insert see each other: two creates at once on 19 rows keep one.
CREATE OR REPLACE FUNCTION identity.create_saved_question(p_owner_ref uuid, p_id uuid, p_title jsonb, p_content jsonb) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_written integer;
BEGIN
  IF p_owner_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAVED_QUESTION_ACCOUNT_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:saved-questions:' || p_owner_ref::text, 0));
  IF NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user
      WHERE identity_user.owner_ref = p_owner_ref AND identity_user.state = 'active') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAVED_QUESTION_ACCOUNT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.saved_question AS question WHERE question.saved_question_id = p_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAVED_QUESTION_ID_TAKEN';
  END IF;
  IF (SELECT count(*) FROM identity.saved_question AS question WHERE question.owner_ref = p_owner_ref) >= 20 THEN
    RETURN jsonb_build_object('outcome', 'FULL');
  END IF;
  INSERT INTO identity.saved_question (saved_question_id, owner_ref, revision, title_ciphertext, content_ciphertext, created_at, updated_at)
  VALUES (p_id, p_owner_ref, 1, p_title, p_content, v_now, v_now)
  ON CONFLICT (saved_question_id) DO NOTHING;
  GET DIAGNOSTICS v_written = ROW_COUNT;
  -- Another account's create of the same id, between the check above and this insert (each account has its own lock).
  IF v_written <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAVED_QUESTION_ID_TAKEN';
  END IF;
  RETURN jsonb_build_object('outcome', 'CREATED', 'revision', 1);
END;
$$;

-- A later save, on the revision the page last read: SAVED with the next revision, GONE (no row of this account with that id), or REVISION
-- with the current one (another window saved first; nothing is written). Refusal 22023 SAVED_QUESTION_ACCOUNT_INVALID for an account that
-- is not active.
CREATE OR REPLACE FUNCTION identity.save_saved_question(p_owner_ref uuid, p_id uuid, p_revision integer, p_title jsonb, p_content jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_revision integer;
BEGIN
  IF p_owner_ref IS NULL OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user
      WHERE identity_user.owner_ref = p_owner_ref AND identity_user.state = 'active') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAVED_QUESTION_ACCOUNT_INVALID';
  END IF;
  SELECT question.revision INTO v_revision FROM identity.saved_question AS question
  WHERE question.saved_question_id = p_id AND question.owner_ref = p_owner_ref
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'GONE');
  END IF;
  IF p_revision IS DISTINCT FROM v_revision THEN
    RETURN jsonb_build_object('outcome', 'REVISION', 'revision', v_revision);
  END IF;
  UPDATE identity.saved_question AS question
  SET revision = v_revision + 1, title_ciphertext = p_title, content_ciphertext = p_content, updated_at = clock_timestamp()
  WHERE question.saved_question_id = p_id AND question.owner_ref = p_owner_ref;
  RETURN jsonb_build_object('outcome', 'SAVED', 'revision', v_revision + 1);
END;
$$;

-- The list under the question box: the account's rows, newest first, at most p_limit, each with its title and never its content.
-- Refusal 22023 SAVED_QUESTION_LIMIT_INVALID for a limit outside 1..20.
CREATE OR REPLACE FUNCTION identity.read_saved_questions(p_owner_ref uuid, p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAVED_QUESTION_LIMIT_INVALID';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('saved_question_id', recent.saved_question_id, 'revision', recent.revision,
      'title_ciphertext', recent.title_ciphertext, 'created_at', recent.created_at, 'updated_at', recent.updated_at)
      ORDER BY recent.updated_at DESC, recent.saved_question_id)
    FROM (SELECT question.saved_question_id, question.revision, question.title_ciphertext, question.created_at, question.updated_at
      FROM identity.saved_question AS question WHERE question.owner_ref = p_owner_ref
      ORDER BY question.updated_at DESC, question.saved_question_id LIMIT p_limit) AS recent), '[]'::jsonb);
END;
$$;

-- Pick up: one row of the account with both parts, or NULL (a missing row and another account's row answer the same).
CREATE OR REPLACE FUNCTION identity.read_saved_question(p_owner_ref uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object('saved_question_id', question.saved_question_id, 'revision', question.revision,
    'title_ciphertext', question.title_ciphertext, 'content_ciphertext', question.content_ciphertext,
    'created_at', question.created_at, 'updated_at', question.updated_at)
  FROM identity.saved_question AS question
  WHERE question.saved_question_id = p_id AND question.owner_ref = p_owner_ref
$$;

-- Delete, and the removal at Start: DELETED, or GONE (no row of this account with that id). The API destroys the question's key first.
CREATE OR REPLACE FUNCTION identity.delete_saved_question(p_owner_ref uuid, p_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM identity.saved_question AS question WHERE question.saved_question_id = p_id AND question.owner_ref = p_owner_ref;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN CASE WHEN v_deleted = 1 THEN 'DELETED' ELSE 'GONE' END;
END;
$$;

-- 3. The export reader ------------------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate refuses a wrong worker or lease DATA_EXPORT_LEASE_INVALID): every row with both parts, oldest
-- first, and an empty list when there is none, so the export's exact-section check always finds the section. The export opens each part
-- with the question's own key.
CREATE OR REPLACE FUNCTION identity.read_data_export_saved_questions(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('saved_question_id', question.saved_question_id, 'revision', question.revision,
      'title_ciphertext', question.title_ciphertext, 'content_ciphertext', question.content_ciphertext,
      'created_at', question.created_at, 'updated_at', question.updated_at)
      ORDER BY question.created_at, question.saved_question_id)
    FROM identity.saved_question AS question WHERE question.owner_ref = v_owner_ref), '[]'::jsonb);
END;
$$;

-- 4. One owner, then the grants -----------------------------------------------------------------------------------------------------
-- 0115 gave every export function one owner (0115:383-386); that owner reads identity."user" and may call 0128's lease gate, which it
-- owns. The table and the six functions take it too, as 0131 §6's do.
-- n1: reviewed gives only the new table and the six new functions 0115's export owner, as 0131 §6 does; touches no earlier object
DO $saved_questions_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', 'identity.saved_question', v_owner);
  FOREACH v_name IN ARRAY ARRAY[
    'identity.create_saved_question(uuid,uuid,jsonb,jsonb)',
    'identity.save_saved_question(uuid,uuid,integer,jsonb,jsonb)',
    'identity.read_saved_questions(uuid,integer)',
    'identity.read_saved_question(uuid,uuid)',
    'identity.delete_saved_question(uuid,uuid)',
    'identity.read_data_export_saved_questions(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$saved_questions_owner$;

-- No role reads or writes the table directly: every access goes through the functions above.
REVOKE ALL ON identity.saved_question FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.create_saved_question(uuid,uuid,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.save_saved_question(uuid,uuid,integer,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_saved_questions(uuid,integer) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_saved_question(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.delete_saved_question(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_saved_questions(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.create_saved_question(uuid,uuid,jsonb,jsonb) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.save_saved_question(uuid,uuid,integer,jsonb,jsonb) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_saved_questions(uuid,integer) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_saved_question(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.delete_saved_question(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_saved_questions(uuid,uuid) TO debateai_data_export_worker;

-- 5. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0131 §7's shape) --------------------------------------------------
DO $saved_questions_contract$
DECLARE
  v_owner oid;
  v_table regclass := pg_catalog.to_regclass('identity.saved_question');
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  IF v_table IS NULL
    OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = v_table) IS DISTINCT FROM v_owner
    OR (SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c WHERE c.oid = v_table)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = v_table AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'SAVED_QUESTIONS_0160_CONTRACT table';
  END IF;
  -- The account link deletes with the account; both envelope checks and the revision check are in place.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'f'
      AND k.confrelid = 'identity."user"'::regclass AND k.confdeltype = 'c')
    OR (SELECT count(*) FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'c'
      AND k.conname IN ('saved_question_title_envelope', 'saved_question_content_envelope', 'saved_question_revision_check')) <> 3 THEN
    RAISE EXCEPTION 'SAVED_QUESTIONS_0160_CONTRACT constraints';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'SAVED_QUESTIONS_0160_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.create_saved_question(uuid,uuid,jsonb,jsonb)', 'identity.save_saved_question(uuid,uuid,integer,jsonb,jsonb)',
    'identity.read_saved_questions(uuid,integer)', 'identity.read_saved_question(uuid,uuid)', 'identity.delete_saved_question(uuid,uuid)',
    'identity.read_data_export_saved_questions(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'SAVED_QUESTIONS_0160_CONTRACT definers %', v_name;
    END IF;
    -- Exactly one of the six roles may call each: the export worker the reader, the API's role the rest.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (v_role = CASE v_name
          WHEN 'identity.read_data_export_saved_questions(uuid,uuid)' THEN 'debateai_data_export_worker'
          ELSE 'debateai_billing_runtime' END) THEN
        RAISE EXCEPTION 'SAVED_QUESTIONS_0160_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
END
$saved_questions_contract$;
