-- 0156 · A moderation notice: the person whose content a review took off the public page is told by email (owner request of
-- 5 November 2026: "an email sent to users whenever their content gets deleted").
--
-- Plain words. Every step of 0150's review, the automatic hide of 0151's Report button included, writes one row of
-- identity.public_review_event through identity.public_review_apply, and that log is append-only. Three of its steps take a
-- person's content off the page:
--   HIDE         the whole debate goes off the page          -> its author (the run's newest owner)       DEBATE_HIDDEN
--   REMOVE_DIG   one contribution goes off the page          -> the person who dug (public_contribution)  CONTRIBUTION_REMOVED
--   HIDE_REPORT  one public report goes off the page         -> the person who asked for it (writer_ref)  REPORT_REMOVED
-- The log is the outbox: the API's sender first queues one notice for each such row it has not seen, then sends. Nothing of
-- 0150 changes, so a hide is never slowed or blocked by its notice (it is containment, 0150), and no row is lost: the log keeps it.
-- Only rows written after this step applies are told (identity.moderation_notice_since): a debate hidden before it hears nothing now.
-- CORRECT, PUT_BACK and REPUBLISH tell no one: nothing of theirs left the page. Decision 36's purge six months later is the
-- sealed original going, not the page changing, and tells no one either: the person was told when it left the page.
-- WHAT THE EMAIL SAYS: what left the page and when, and where the Terms are. As the answer page's REMOVED_AFTER_REVIEW
-- (decision 33), it gives no reason and no staff name, and no text of the debate: the words stay under the publication's key.
-- THE LANGUAGE: the language the person last accepted the Terms in (legal.acceptance), English when it is not a mail language.
-- An account has no other stored language, and the request that hid the debate is a staff person's, not theirs.
-- NOBODY TO TELL: an author who is gone or not active gets a row that is settled at once (no owner, failed), so the log row is
-- seen once. Erasing an account takes its notices with it (CASCADE); its log rows are then seen again and settle the same way.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          additive only: two new tables and four new functions; it reads 0150's log and changes nothing of it, so
--                   the release before writes it as it did, and its rows are told by the new release's sender.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The queue ------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.moderation_notice (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL CONSTRAINT moderation_notice_event_once UNIQUE REFERENCES identity.public_review_event(event_id),
  owner_ref uuid REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT moderation_notice_kind_check CHECK (kind IN ('DEBATE_HIDDEN','CONTRIBUTION_REMOVED','REPORT_REMOVED')),
  mail_locale text NOT NULL CONSTRAINT moderation_notice_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr')),
  happened_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CONSTRAINT moderation_notice_attempts_check CHECK (attempts BETWEEN 0 AND 20),
  claim_token uuid,
  claim_expires_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  CONSTRAINT moderation_notice_claim_shape CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CONSTRAINT moderation_notice_settled_once CHECK (NOT (delivered_at IS NOT NULL AND failed_at IS NOT NULL)),
  CONSTRAINT moderation_notice_nobody_settled CHECK (owner_ref IS NOT NULL OR (failed_at IS NOT NULL AND claim_token IS NULL))
);
CREATE INDEX IF NOT EXISTS moderation_notice_open ON identity.moderation_notice (created_at, notice_id) WHERE delivered_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS moderation_notice_owner ON identity.moderation_notice (owner_ref);
SELECT core.install_truncate_guard('identity.moderation_notice');
-- When the sender's watch starts: the moment this step applied, once, never moved.
CREATE TABLE IF NOT EXISTS identity.moderation_notice_since (
  only_row boolean PRIMARY KEY DEFAULT true CONSTRAINT moderation_notice_since_one CHECK (only_row),
  since timestamptz NOT NULL
);
SELECT core.install_truncate_guard('identity.moderation_notice_since');
DROP TRIGGER IF EXISTS reject_mutation ON identity.moderation_notice_since;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.moderation_notice_since FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
INSERT INTO identity.moderation_notice_since (since) VALUES (clock_timestamp()) ON CONFLICT (only_row) DO NOTHING;

-- 2. From 0150's log to the queue -------------------------------------------------------------------------------------------------
-- Each unseen HIDE / REMOVE_DIG / HIDE_REPORT row since the start, oldest first, at most 500 a call. Two senders at once: one wins each row.
CREATE OR REPLACE FUNCTION identity.queue_moderation_notices() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  WITH due AS (
    SELECT event.event_id, event.recorded_at,
      CASE event.action WHEN 'HIDE' THEN 'DEBATE_HIDDEN' WHEN 'REMOVE_DIG' THEN 'CONTRIBUTION_REMOVED' ELSE 'REPORT_REMOVED' END AS kind,
      CASE event.action
        WHEN 'HIDE' THEN (SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
          WHERE ownership.run_id = core.run_of_publication(event.publication_ref) ORDER BY ownership.at_seq DESC LIMIT 1)
        WHEN 'REMOVE_DIG' THEN (SELECT contribution.owner_ref FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = event.piece_id)
        ELSE (SELECT report.writer_ref FROM identity.public_report AS report WHERE report.report_id = event.piece_id)
      END AS author
    FROM identity.public_review_event AS event CROSS JOIN identity.moderation_notice_since AS start
    WHERE event.action IN ('HIDE','REMOVE_DIG','HIDE_REPORT') AND event.recorded_at >= start.since
      AND NOT EXISTS (SELECT 1 FROM identity.moderation_notice AS notice WHERE notice.event_id = event.event_id)
    ORDER BY event.recorded_at, event.event_id LIMIT 500
  ), told AS (
    SELECT due.event_id, due.recorded_at, due.kind, identity_user.owner_ref AS recipient,
      (SELECT acceptance.locale FROM legal.acceptance AS acceptance WHERE acceptance.owner_ref = identity_user.owner_ref AND acceptance.kind = 'TERMS'
        ORDER BY acceptance.accepted_at DESC, acceptance.recorded_at DESC LIMIT 1) AS locale
    FROM due LEFT JOIN identity."user" AS identity_user ON identity_user.owner_ref = due.author AND identity_user.state = 'active'
  )
  INSERT INTO identity.moderation_notice (event_id, owner_ref, kind, mail_locale, happened_at, failed_at)
  SELECT told.event_id, told.recipient, told.kind,
    CASE WHEN told.locale = ANY (ARRAY['bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr']) THEN told.locale ELSE 'en' END,
    told.recorded_at, CASE WHEN told.recipient IS NULL THEN clock_timestamp() END
  FROM told
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- 3. The API's sender: claim, read, settle ----------------------------------------------------------------------------------------
-- Queues what is new, then claims oldest first with five minutes to send; a claim that runs out is claimable again.
CREATE OR REPLACE FUNCTION identity.claim_moderation_notices(p_limit integer)
RETURNS TABLE(notice_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MODERATION_NOTICE_LIMIT_INVALID'; END IF;
  PERFORM identity.queue_moderation_notices();
  RETURN QUERY WITH picked AS (
    SELECT n.notice_id FROM identity.moderation_notice AS n
    WHERE n.delivered_at IS NULL AND n.failed_at IS NULL AND (n.claim_expires_at IS NULL OR n.claim_expires_at <= clock_timestamp())
    ORDER BY n.created_at, n.notice_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE identity.moderation_notice AS n SET claim_token = gen_random_uuid(), claim_expires_at = clock_timestamp() + interval '5 minutes'
    FROM picked WHERE n.notice_id = picked.notice_id RETURNING n.notice_id, n.claim_token;
END $$;
-- What the sender needs, under a live claim: the account's own address (sealed under its key, read now so a changed address is
-- the one written to), the kind, the moment and the language. NULL: no live claim, or the account is no longer active.
CREATE OR REPLACE FUNCTION identity.read_moderation_notice(p_notice uuid, p_claim uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('userId', identity_user.user_id, 'kind', n.kind, 'happenedAt', n.happened_at, 'mailLocale', n.mail_locale,
    'emailCiphertext', identity_user.email_ciphertext)
  FROM identity.moderation_notice AS n JOIN identity."user" AS identity_user ON identity_user.owner_ref = n.owner_ref AND identity_user.state = 'active'
  WHERE n.notice_id = p_notice AND n.claim_token = p_claim AND n.claim_expires_at > clock_timestamp()
$$;
-- SENT: delivered. RETRY: the transport failed; the twentieth failure is final. DROPPED: nothing to send to (the read was NULL
-- or the address does not pass the mail guard); final at once. False: the claim was not live, nothing changed.
CREATE OR REPLACE FUNCTION identity.complete_moderation_notice(p_notice uuid, p_claim uuid, p_outcome text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_found boolean;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('SENT','RETRY','DROPPED') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MODERATION_NOTICE_OUTCOME_INVALID'; END IF;
  UPDATE identity.moderation_notice AS n SET claim_token = NULL, claim_expires_at = NULL, attempts = least(n.attempts + 1, 20),
    delivered_at = CASE WHEN p_outcome = 'SENT' THEN clock_timestamp() END,
    failed_at = CASE WHEN p_outcome = 'DROPPED' OR (p_outcome = 'RETRY' AND n.attempts >= 19) THEN clock_timestamp() END
  WHERE n.notice_id = p_notice AND n.claim_token = p_claim AND n.claim_expires_at > clock_timestamp();
  v_found := FOUND;
  RETURN v_found;
END $$;

-- 4. Ownership and the exact grants -------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and the new functions their owner, the owner of 0150's identity functions; touches no earlier object
DO $moderation_notice_owner$
DECLARE v_owner name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_notice','identity.moderation_notice_since'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.queue_moderation_notices()','identity.claim_moderation_notices(integer)','identity.read_moderation_notice(uuid,uuid)',
    'identity.complete_moderation_notice(uuid,uuid,text)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
END
$moderation_notice_owner$;
GRANT EXECUTE ON FUNCTION identity.claim_moderation_notices(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_moderation_notice(uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.complete_moderation_notice(uuid,uuid,text) TO debateai_runtime;

-- 5. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed --------------------------------------------------------------------
DO $moderation_notice_contract$
DECLARE v_name text; v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['identity.moderation_notice','identity.moderation_notice_since'] LOOP
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime','debateai_erasure_runtime','debateai_replay','debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role,v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'MODERATION_NOTICE_0156_CONTRACT table privilege % %',v_role,v_name;
      END IF;
    END LOOP;
  END LOOP;
  IF pg_catalog.has_function_privilege('debateai_runtime','identity.queue_moderation_notices()','EXECUTE') THEN
    RAISE EXCEPTION 'MODERATION_NOTICE_0156_CONTRACT the queue function is callable on its own';
  END IF;
END
$moderation_notice_contract$;
