-- 0139 · Page texts and passages go when nothing runs (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decisions 6 and 7).
--
-- Passages serve only the debate that found them and its rewrite right after it; every later step reads what the AIs wrote.
-- So a debate's whole page texts and passages go when nothing runs on it, or after the report is written; "other pages" stay
-- until 30 days after last activity (0133's sweep), so "Add to researched" works; links, the 120-character quotes and the
-- notes stay.
--
-- Where a passage lives, and how each place stops keeping it:
--   identity.web_extract and identity.web_pack (0132): sealed rows, wiped here (below).
--   ledger.raw_artifact (a reader's saved reply) and ledger.call_prompt (a prompt carrying a pack, a cited extract, or a
--   rejected reply in a repair): append-only, replayed, under the run's one key: nothing here may edit them. They keep no
--   passage from the start: as W3-0 does for page texts in prompts, the recorded form names the text by a reference
--   (webReplyTextRef, webExtractTextRef in packages/db/src/passage-retention.ts) and the text stands in its own store: the
--   reply's whole body in identity.web_reply_text (§2), a passage in identity.web_extract. Replay rebuilds from the store while
--   the debate runs, and after the wipe nothing replays: a call with no stored reply is made again, as run-replay.ts already
--   does for an unreadable one, and nothing runs a settled debate's readers again.
--
-- What this step adds, reached through definers only, as 0131 to 0138:
--   §1 identity.web_shown_quote: the quote people see, at most 120 characters, sealed under the run's key, stored apart from
--      the passage and written with it. It survives the wipe; the wipe refuses to go first (QUOTES_MISSING).
--   §2 identity.web_reply_text: TRANSIENT, a reader's whole saved reply, sealed under the run's key, keyed by its raw artifact's
--      id. Nothing but the wipe, the forget definer and the account's cascade removes it.
--   §3 identity.web_passage_wipe: one row per wipe, what went and why: counts and codes, never text.
--   §4 identity.wipe_debate_passages(run, reason): the deletion, per debate, when nothing runs on it. Reader 1's notes are in
--      0132's identity.web_reading and are not touched; nor is a page's address and title (identity.web_page).
--   §5 identity.close_investigation_keeping_texts: 0133's closing without 0133's wipe of every page text, so "other pages" keep
--      their 30 days. 0133's function keeps its grant (an expand step revokes nothing), and no code may call it once this is on.
--
-- Deleting: every row names its account's owner_ref ON DELETE CASCADE; a shown quote names its page ON DELETE CASCADE;
-- identity.forget_erased_debate_passages(uuid) handles one erased debate for the erasure role.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: three new tables and ten new functions; the release before reads and writes none of them.
--                   No earlier function, table or trigger changes. 0132's rows go through 0132's own guard, which already lets
--                   a definer that set debateai.web_evidence_forget delete them.
--   row security    outside 0130's scope rule, as 0131 to 0138: no request role can SELECT these tables.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The shown quote -----------------------------------------------------------------------------------------------------------
-- extract_id: the identity.web_extract row's, which this row outlives, so no foreign key to it. The sealed value is
-- {quote}, already cut (the contract's cutQuoteAtWordEdge). 4 KiB fits 120 characters in any script, in an envelope.
CREATE TABLE IF NOT EXISTS identity.web_shown_quote (
  extract_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  page_id uuid NOT NULL,
  path_ref text NOT NULL CONSTRAINT web_shown_quote_path_check CHECK (path_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  label text NOT NULL CONSTRAINT web_shown_quote_label_check CHECK (label ~ '^S[0-9]{1,2}-[0-9]{1,3}$'),
  found_by smallint[] NOT NULL CONSTRAINT web_shown_quote_found_by_check CHECK (cardinality(found_by) BETWEEN 1 AND 3
    AND array_position(found_by, NULL) IS NULL AND found_by <@ ARRAY[1,2,3]::smallint[]),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT web_shown_quote_content_size CHECK (octet_length(content_ciphertext::text) <= 4096),
  content_attestation bytea NOT NULL,
  CONSTRAINT web_shown_quote_label_once UNIQUE (run_id, label),
  CONSTRAINT web_shown_quote_page_fk FOREIGN KEY (page_id, run_id) REFERENCES identity.web_page(page_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS web_shown_quote_page ON identity.web_shown_quote (page_id);
CREATE INDEX IF NOT EXISTS web_shown_quote_owner ON identity.web_shown_quote (owner_ref);
SELECT core.install_truncate_guard('identity.web_shown_quote');

-- 2. The saved reply (transient) ---------------------------------------------------------------------------------------------------
-- One row per reader attempt that got a body. artifact_id: its ledger.raw_artifact row's id, whose recorded text is only
-- webReplyTextRef(artifact_id). The sealed value is the vendor's own bytes. At most 2 MiB as stored, as 0132's page text.
CREATE TABLE IF NOT EXISTS identity.web_reply_text (
  artifact_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT web_reply_text_content_size CHECK (octet_length(content_ciphertext::text) <= 2097152),
  content_attestation bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS web_reply_text_run ON identity.web_reply_text (run_id, stored_at);
CREATE INDEX IF NOT EXISTS web_reply_text_owner ON identity.web_reply_text (owner_ref);
SELECT core.install_truncate_guard('identity.web_reply_text');

-- 3. What went -------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.web_passage_wipe (
  run_id uuid NOT NULL,
  wipe_no integer NOT NULL CONSTRAINT web_passage_wipe_no_check CHECK (wipe_no BETWEEN 1 AND 100000),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  reason text NOT NULL CONSTRAINT web_passage_wipe_reason_check CHECK (reason IN ('NOTHING_RUNS','REPORT_WRITTEN')),
  page_texts integer NOT NULL CONSTRAINT web_passage_wipe_texts_check CHECK (page_texts >= 0),
  extracts integer NOT NULL CONSTRAINT web_passage_wipe_extracts_check CHECK (extracts >= 0),
  packs integer NOT NULL CONSTRAINT web_passage_wipe_packs_check CHECK (packs >= 0),
  replies integer NOT NULL CONSTRAINT web_passage_wipe_replies_check CHECK (replies >= 0),
  wiped_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT web_passage_wipe_pkey PRIMARY KEY (run_id, wipe_no)
);
CREATE INDEX IF NOT EXISTS web_passage_wipe_owner ON identity.web_passage_wipe (owner_ref);
SELECT core.install_truncate_guard('identity.web_passage_wipe');

-- 4. The guards ---------------------------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_shown_quote;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_shown_quote
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('extract_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_reply_text;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_reply_text
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('artifact_id');

-- Append-only: no UPDATE; no DELETE but of a deleted account's rows (the cascade), within a definer here (it sets
-- debateai.passage_retention_forget for its own statements), or of a quote whose page went (the cascade).
CREATE OR REPLACE FUNCTION identity.guard_passage_retention_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (pg_catalog.current_setting('debateai.passage_retention_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref)
    OR (TG_TABLE_NAME = 'web_shown_quote' AND NOT EXISTS (SELECT 1 FROM identity.web_page AS page
      WHERE page.page_id = (pg_catalog.to_jsonb(OLD)->>'page_id')::uuid))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PASSAGE_RETENTION_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS guard_passage_retention_record ON identity.web_shown_quote;
CREATE TRIGGER guard_passage_retention_record BEFORE UPDATE OR DELETE ON identity.web_shown_quote
FOR EACH ROW EXECUTE FUNCTION identity.guard_passage_retention_record();
DROP TRIGGER IF EXISTS guard_passage_retention_record ON identity.web_reply_text;
CREATE TRIGGER guard_passage_retention_record BEFORE UPDATE OR DELETE ON identity.web_reply_text
FOR EACH ROW EXECUTE FUNCTION identity.guard_passage_retention_record();
DROP TRIGGER IF EXISTS guard_passage_retention_record ON identity.web_passage_wipe;
CREATE TRIGGER guard_passage_retention_record BEFORE UPDATE OR DELETE ON identity.web_passage_wipe
FOR EACH ROW EXECUTE FUNCTION identity.guard_passage_retention_record();

-- 5. The runner's writers and readers (debateai_runtime) -----------------------------------------------------------------------------------
-- Under 0132's per-run lock. RECORDED, ALREADY, NOT_LIVE, UNKNOWN_EXTRACT (no such extract of this run, or it names another
-- page, path or label).
CREATE OR REPLACE FUNCTION identity.record_web_shown_quote(p_run_id uuid, p_extract_id uuid, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_extract identity.web_extract%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_extract_id IS NULL OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_SHOWN_QUOTE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_shown_quote AS quote WHERE quote.extract_id = p_extract_id) THEN RETURN 'ALREADY'; END IF;
  SELECT * INTO v_extract FROM identity.web_extract AS extract_row WHERE extract_row.extract_id = p_extract_id AND extract_row.run_id = p_run_id;
  IF NOT FOUND THEN RETURN 'UNKNOWN_EXTRACT'; END IF;
  INSERT INTO identity.web_shown_quote (extract_id, run_id, owner_ref, page_id, path_ref, label, found_by, content_ciphertext, content_attestation)
  VALUES (p_extract_id, p_run_id, v_owner, v_extract.page_id, v_extract.path_ref, v_extract.label, v_extract.found_by, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- A live debate's shown quotes: [{extract_id, page_id, path_ref, label, found_by, created_at, content}] by label; null when it is
-- not a live private debate. What a page and every later AI read, before and after the wipe.
CREATE OR REPLACE FUNCTION identity.read_web_shown_quotes(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('extract_id', quote.extract_id, 'page_id', quote.page_id, 'path_ref', quote.path_ref,
      'label', quote.label, 'found_by', quote.found_by, 'created_at', quote.created_at, 'content', quote.content_ciphertext)
      ORDER BY quote.label)
    FROM identity.web_shown_quote AS quote WHERE quote.run_id = p_run_id), '[]'::jsonb);
END;
$$;

-- A reader's saved reply, stored before its raw artifact row. RECORDED, ALREADY, NOT_LIVE.
CREATE OR REPLACE FUNCTION identity.record_web_reply_text(p_run_id uuid, p_artifact_id uuid, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_artifact_id IS NULL OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_REPLY_TEXT_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_reply_text AS reply WHERE reply.artifact_id = p_artifact_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.web_reply_text (artifact_id, run_id, owner_ref, content_ciphertext, content_attestation)
  VALUES (p_artifact_id, p_run_id, v_owner, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- The replay book's read (run-replay.ts): [{artifact_id, content}] of those still stored; [] when none; null when not live.
CREATE OR REPLACE FUNCTION identity.read_web_reply_texts(p_run_id uuid, p_artifact_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_artifact_ids IS NULL OR cardinality(p_artifact_ids) > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_REPLY_TEXT_INVALID';
  END IF;
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('artifact_id', reply.artifact_id, 'content', reply.content_ciphertext)
      ORDER BY reply.artifact_id)
    FROM identity.web_reply_text AS reply WHERE reply.run_id = p_run_id AND reply.artifact_id = ANY(p_artifact_ids)), '[]'::jsonb);
END;
$$;

-- 6. Nothing runs ------------------------------------------------------------------------------------------------------------------------------
-- A debate holds on to its passages while it may still read them: not yet settled (no work item, or one READY or CLAIMED: it
-- may be claimed again and replays), paused at the month wall (decision 12: it continues and keeps what the AIs found), a dig
-- that settled and whose first rewrite is not written yet (decision 6: "its rewrite right after it"), or a page added to
-- researched that readers 2 and 3 have not weighed yet. A failed debate holds nothing. Private.
CREATE OR REPLACE FUNCTION identity.debate_nothing_runs(p_run_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT work.items > 0 AND NOT work.open
    AND COALESCE((SELECT event.kind FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id
      ORDER BY event.event_no DESC LIMIT 1), 'NONE') <> 'PAUSED'
    AND NOT EXISTS (SELECT 1 FROM identity.web_researched AS chosen WHERE chosen.run_id = p_run_id AND chosen.outcome IS NULL)
    AND (work.failed OR NOT (
      (EXISTS (SELECT 1 FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id AND pick_set.position_ref IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_run_id))
      OR (EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id
          AND contribution.position_ref IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.run_id = p_run_id
          AND path_update.parent_run_id = (SELECT contribution.parent_run_id FROM identity.public_contribution AS contribution
            WHERE contribution.dig_run_id = p_run_id)))))
  FROM (SELECT count(item.work_item_id) AS items, COALESCE(bool_or(item.state = 'FAILED'), false) AS failed,
      COALESCE(bool_or(item.state IN ('READY','CLAIMED')), false) AS open
    FROM core.work_item AS item WHERE item.run_id = p_run_id) AS work
$$;

-- The page texts a wipe takes: each page but the "other pages" (a page outside the top picks that no one has had weighed), which
-- stay for 0133's 30-day sweep. Private.
CREATE OR REPLACE FUNCTION identity.web_page_text_is_passage_bound(p_run_id uuid, p_page_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM identity.web_pick AS pick WHERE pick.run_id = p_run_id AND pick.page_id = p_page_id)
    OR EXISTS (SELECT 1 FROM identity.web_researched AS chosen WHERE chosen.page_id = p_page_id AND chosen.outcome IS NOT NULL)
$$;

-- 7. The deletion ---------------------------------------------------------------------------------------------------------------------------------
-- One debate. WIPED with the counts (0s when asked again, and no row then), STILL_RUNNING (nothing changed), NOT_LIVE,
-- QUOTES_MISSING (an extract has no shown quote yet: nothing changed; the quote must survive, so the runner writes it first).
-- The notes (0132's web_reading), the page rows (links, titles), the readers' grades and the quotes stay. Run again after a
-- page added to researched has been weighed: its passages go too.
CREATE OR REPLACE FUNCTION identity.wipe_debate_passages(p_run_id uuid, p_reason text)
RETURNS TABLE (outcome text, page_texts integer, extracts integer, packs integer, replies integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_owner uuid;
  v_texts integer;
  v_extracts integer;
  v_packs integer;
  v_replies integer;
BEGIN
  IF p_run_id IS NULL OR p_reason IS NULL OR p_reason NOT IN ('NOTHING_RUNS','REPORT_WRITTEN') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PASSAGE_WIPE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN QUERY SELECT 'NOT_LIVE'::text, 0, 0, 0, 0; RETURN; END IF;
  IF NOT COALESCE(identity.debate_nothing_runs(p_run_id), false) THEN
    RETURN QUERY SELECT 'STILL_RUNNING'::text, 0, 0, 0, 0; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM identity.web_extract AS extract_row WHERE extract_row.run_id = p_run_id
      AND NOT EXISTS (SELECT 1 FROM identity.web_shown_quote AS quote WHERE quote.extract_id = extract_row.extract_id)) THEN
    RETURN QUERY SELECT 'QUOTES_MISSING'::text, 0, 0, 0, 0; RETURN;
  END IF;
  PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'on', true);
  PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'on', true);
  DELETE FROM identity.web_pack AS pack WHERE pack.run_id = p_run_id;
  GET DIAGNOSTICS v_packs = ROW_COUNT;
  DELETE FROM identity.web_extract AS extract_row WHERE extract_row.run_id = p_run_id;
  GET DIAGNOSTICS v_extracts = ROW_COUNT;
  DELETE FROM identity.web_reply_text AS reply WHERE reply.run_id = p_run_id;
  GET DIAGNOSTICS v_replies = ROW_COUNT;
  DELETE FROM identity.web_page_text AS kept WHERE kept.run_id = p_run_id
    AND identity.web_page_text_is_passage_bound(p_run_id, kept.page_id);
  GET DIAGNOSTICS v_texts = ROW_COUNT;
  PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'off', true);
  PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'off', true);
  IF v_packs + v_extracts + v_replies + v_texts > 0 THEN
    INSERT INTO identity.web_passage_wipe (run_id, wipe_no, owner_ref, reason, page_texts, extracts, packs, replies)
    VALUES (p_run_id, COALESCE((SELECT max(earlier.wipe_no) FROM identity.web_passage_wipe AS earlier WHERE earlier.run_id = p_run_id), 0) + 1,
      v_owner, p_reason, v_texts, v_extracts, v_packs, v_replies);
  END IF;
  RETURN QUERY SELECT 'WIPED'::text, v_texts, v_extracts, v_packs, v_replies;
END;
$$;

-- The debates a sweep may wipe: live, nothing runs, and holding a passage or a passage-bound text; oldest stored first, at most
-- p_limit (1..500): a JSON array of run ids.
CREATE OR REPLACE FUNCTION identity.read_debates_holding_passages(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PASSAGE_WIPE_INVALID';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(holding.run_id ORDER BY holding.since, holding.run_id)
    FROM (
      SELECT held.run_id, min(held.since) AS since FROM (
        SELECT extract_row.run_id, extract_row.created_at AS since FROM identity.web_extract AS extract_row
        UNION ALL SELECT pack.run_id, pack.created_at FROM identity.web_pack AS pack
        UNION ALL SELECT reply.run_id, reply.stored_at FROM identity.web_reply_text AS reply
        UNION ALL SELECT kept.run_id, kept.stored_at FROM identity.web_page_text AS kept
          WHERE identity.web_page_text_is_passage_bound(kept.run_id, kept.page_id)
      ) AS held
      WHERE identity.web_evidence_run_owner(held.run_id) IS NOT NULL AND COALESCE(identity.debate_nothing_runs(held.run_id), false)
      GROUP BY held.run_id
      ORDER BY since, held.run_id
      LIMIT p_limit
    ) AS holding), '[]'::jsonb);
END;
$$;

-- 8. The closing without 0133's wipe (debateai_billing_runtime) --------------------------------------------------------------------------------------
-- 0133's closing word for word but for its wipe: "other pages" keep their 30 days (decision 7), and the rest go by the wipe
-- above once the report is written. wiped_texts is always 0: the same row shape.
CREATE OR REPLACE FUNCTION identity.close_investigation_keeping_texts(p_owner_ref uuid, p_investigation_id uuid)
RETURNS TABLE (outcome text, report_version integer, wiped_texts integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_row identity.investigation%ROWTYPE;
  v_version integer;
BEGIN
  SELECT * INTO v_row FROM identity.investigation AS investigation
  WHERE investigation.investigation_id = p_investigation_id FOR UPDATE;
  IF NOT FOUND OR v_row.owner_ref IS DISTINCT FROM p_owner_ref
    OR NOT identity.page_memory_run_owned(p_owner_ref, v_row.root_run_id) THEN
    RETURN QUERY SELECT 'NOT_OWNED'::text, NULL::integer, 0; RETURN;
  END IF;
  IF v_row.state = 'closed' THEN
    RETURN QUERY SELECT 'ALREADY_CLOSED'::text, v_row.report_version, 0; RETURN;
  END IF;
  v_version := v_row.report_version + 1;
  UPDATE identity.investigation SET state = 'closed', closed_at = clock_timestamp(), last_activity_at = clock_timestamp(),
    report_version = v_version
  WHERE identity.investigation.investigation_id = p_investigation_id;
  INSERT INTO identity.investigation_closing (investigation_id, report_version, owner_ref)
  VALUES (p_investigation_id, v_version, p_owner_ref);
  RETURN QUERY SELECT 'CLOSED'::text, v_version, 0;
END;
$$;

-- 9. Deleting one debate --------------------------------------------------------------------------------------------------------------------------------
-- In the finalize transaction of the run's erasure, after 0132's: its quotes (the cascade may have taken them), saved replies and
-- wipe rows. Refuses 55000 PASSAGE_RETENTION_DEBATE_NOT_ERASED without the tombstone. Returns how many rows went.
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_passages(p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_rows integer := 0;
  v_step integer;
BEGIN
  IF p_run_id IS NULL OR NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
      WHERE tombstone.run_id = p_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PASSAGE_RETENTION_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'on', true);
  DELETE FROM identity.web_shown_quote AS quote WHERE quote.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_reply_text AS reply WHERE reply.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_passage_wipe AS wipe WHERE wipe.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 10. The export reader -----------------------------------------------------------------------------------------------------------------------------------
-- The leased export's account: {"web_shown_quotes": [{extract_id, run_id, page_id, path_ref, label, created_at, content}],
-- "web_passage_wipes": [{run_id, wipe_no, reason, page_texts, extracts, packs, replies, wiped_at}]}. The saved replies are not
-- exported (third parties' passages, kept only while the debate runs), as 0132 leaves out the page texts.
CREATE OR REPLACE FUNCTION identity.read_data_export_passage_retention(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN jsonb_build_object(
    'web_shown_quotes', COALESCE((SELECT jsonb_agg(jsonb_build_object('extract_id', quote.extract_id, 'run_id', quote.run_id,
        'page_id', quote.page_id, 'path_ref', quote.path_ref, 'label', quote.label, 'created_at', quote.created_at,
        'content', quote.content_ciphertext) ORDER BY quote.created_at, quote.extract_id)
      FROM identity.web_shown_quote AS quote WHERE quote.owner_ref = v_owner_ref), '[]'::jsonb),
    'web_passage_wipes', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', wipe.run_id, 'wipe_no', wipe.wipe_no, 'reason', wipe.reason,
        'page_texts', wipe.page_texts, 'extracts', wipe.extracts, 'packs', wipe.packs, 'replies', wipe.replies, 'wiped_at', wipe.wiped_at)
        ORDER BY wipe.wiped_at, wipe.run_id, wipe.wipe_no)
      FROM identity.web_passage_wipe AS wipe WHERE wipe.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 11. One owner, then the grants -------------------------------------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and functions 0115's export owner, as 0135 does; touches no earlier object
DO $passage_retention_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.web_shown_quote', 'identity.web_reply_text', 'identity.web_passage_wipe'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_passage_retention_record()',
    'identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)',
    'identity.read_web_shown_quotes(uuid)',
    'identity.record_web_reply_text(uuid,uuid,jsonb,bytea)',
    'identity.read_web_reply_texts(uuid,uuid[])',
    'identity.debate_nothing_runs(uuid)',
    'identity.web_page_text_is_passage_bound(uuid,uuid)',
    'identity.wipe_debate_passages(uuid,text)',
    'identity.read_debates_holding_passages(integer)',
    'identity.close_investigation_keeping_texts(uuid,uuid)',
    'identity.forget_erased_debate_passages(uuid)',
    'identity.read_data_export_passage_retention(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$passage_retention_owner$;

REVOKE ALL ON identity.web_shown_quote, identity.web_reply_text, identity.web_passage_wipe FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_passage_retention_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.debate_nothing_runs(uuid), identity.web_page_text_is_passage_bound(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_shown_quote(uuid,uuid,jsonb,bytea), identity.read_web_shown_quotes(uuid), identity.record_web_reply_text(uuid,uuid,jsonb,bytea), identity.read_web_reply_texts(uuid,uuid[]), identity.wipe_debate_passages(uuid,text), identity.read_debates_holding_passages(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.close_investigation_keeping_texts(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_passages(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_passage_retention(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.record_web_shown_quote(uuid,uuid,jsonb,bytea), identity.read_web_shown_quotes(uuid), identity.record_web_reply_text(uuid,uuid,jsonb,bytea), identity.read_web_reply_texts(uuid,uuid[]), identity.wipe_debate_passages(uuid,text), identity.read_debates_holding_passages(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.close_investigation_keeping_texts(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_passages(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_passage_retention(uuid,uuid) TO debateai_data_export_worker;

-- 12. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -------------------------------------------------------------------------------------------------
DO $passage_retention_contract$
DECLARE
  v_name text;
  v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['identity.web_shown_quote', 'identity.web_reply_text', 'identity.web_passage_wipe'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'guard_passage_retention_record' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
      RAISE EXCEPTION 'PASSAGE_RETENTION_0139_CONTRACT table %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PASSAGE_RETENTION_0139_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
END
$passage_retention_contract$;
