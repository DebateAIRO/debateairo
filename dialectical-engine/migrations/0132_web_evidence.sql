-- 0132 · The web evidence store (Perplexity web search, test-site release R22; plan
-- docs/superpowers/plans/2026-10-30-perplexity-and-dig-map.md task W1-3, owner answers of 2026-10-29/30, "Perplexity design
-- round" to the end, which override the plan).
--
-- What one debate's web step keeps, per run, written by the runner (debateai_runtime) through the definers below:
--   §1 identity.web_search: each search the planner wrote (path, for/against or a dig's one, English or local, language,
--      country, look-back window, outcome, the per-request charge); the search words themselves are encrypted;
--   §2 identity.web_page: each page a search found (rank, read depth whole / preview only / abstract only, whether its
--      text was kept, its size and keyed digest); its address, site, title and date are encrypted;
--   §3 identity.web_page_text: the page's whole text, TRANSIENT and encrypted, in its own table and nowhere else (owner,
--      Q4: "never copied into the AI call records; its own encrypted store only"). A row goes when the investigation
--      closes or 30 days after its last activity (0133's definers), and with the debate or the account (§9);
--   §4 identity.web_reading: each reader's reading of a page (reader 1 for every page, readers 2 and 3 for the top
--      pages): its outcome, the maker that read it and its grade 0-3 (the reader spread); the one line and the leads are
--      encrypted;
--   §5 identity.web_extract: each checked extract (the verbatim quote, encrypted), with its id (S<path>-<n>), its page,
--      its path and which readers found it;
--   §6 identity.web_pick: the top pages of each path (3, or 5 on Thorough), by rank; every other page of the path is an
--      "other page" (read by joining §2 to §1 and leaving out §6: nothing is stored twice);
--   §7 identity.web_pack: each path's pack (its extract ids and the pack text the arguing calls read, encrypted);
--   §8 identity.web_researched: the person's "added to researched" choices (an other page of a path) and, once the
--      readers have weighed it, the outcome; the API (debateai_billing_runtime) records the choice, the runner the outcome.
-- Every content column is a run content carrier (packages/crypto CONTENT_CARRIERS): AES-GCM under the run's content key,
-- attested by the runner and checked here by 0127's three checks in one trigger (§10), which also refuses a run without
-- content encryption, so no web text is ever kept as plaintext. Plaintext columns are ids, enums, numbers and times.
--
-- The page text never enters the ledger: a reader's prompt kept in ledger.call_prompt (0090) names a page by its page_id
-- and keyed text_digest, and the runner puts the text in only on the way to the vendor (W2's duty; see
-- packages/db/src/web-evidence.ts).
--
-- Deleting: every row names its account's owner_ref ON DELETE CASCADE (account erasure deletes identity."user", 0110),
-- and identity.forget_erased_debate_web_evidence(uuid) deletes one erased debate's rows for the erasure role in the
-- finalize transaction (R22 item 16, as 0131 §4b). A guard (§10) keeps every table append-only otherwise: no UPDATE but
-- the researched outcome (set once), no DELETE but those two and the transient text's.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: eight new tables and fifteen new functions; the release before reads and writes none
--                   of them, so it keeps running beside it. No earlier function, table or trigger changes. The one grant
--                   to an existing role's boot check (the erasure role's new function, counted exactly by
--                   assertAccountErasureDatabaseRole) is moot for R22, which goes the drained way for 0126-0130 (0131's
--                   note).
--   row security    0130 (row-level security) leaves these tables outside its scope rule: no request role can SELECT them
--                   (every role's table rights are revoked below; only the definers, owned by 0115's export owner as in
--                   0131, read and write them), so their row security stays off as on every out-of-scope table.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form: CREATE TABLE / INDEX IF NOT EXISTS with their constraints inline, CREATE OR
-- REPLACE FUNCTION of names no earlier migration defines, DROP TRIGGER IF EXISTS before each CREATE TRIGGER on these new
-- tables, and core.install_truncate_guard (idempotent, 0056).

-- 1. The searches -----------------------------------------------------------------------------------------------------
-- path_ref: the map's own id of the path (a story path's position id), 1-150 printable ASCII characters other than a space,
-- a double quote or a backslash (0131's id shape). A refused search (the personal-data guard) keeps no words; a failed or
-- refused one costs nothing; a successful one costs what the gate charged per request (fast mode, $0.001).
CREATE TABLE IF NOT EXISTS identity.web_search (
  search_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  path_ref text NOT NULL CONSTRAINT web_search_path_check CHECK (path_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  side text NOT NULL CONSTRAINT web_search_side_check CHECK (side IN ('for','against','dig')),
  language_kind text NOT NULL CONSTRAINT web_search_language_kind_check CHECK (language_kind IN ('english','local')),
  language text NOT NULL CONSTRAINT web_search_language_check CHECK (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  country text CONSTRAINT web_search_country_check CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  look_back text NOT NULL CONSTRAINT web_search_look_back_check CHECK (look_back IN ('12m','3y','none')),
  outcome text NOT NULL CONSTRAINT web_search_outcome_check CHECK (outcome IN ('FOUND','EMPTY','FAILED','REFUSED')),
  charge_micros bigint NOT NULL CONSTRAINT web_search_charge_check CHECK (charge_micros BETWEEN 0 AND 1000000),
  result_count smallint NOT NULL CONSTRAINT web_search_result_count_check CHECK (result_count BETWEEN 0 AND 20),
  searched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT web_search_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea,
  CONSTRAINT web_search_run_key UNIQUE (search_id, run_id),
  CONSTRAINT web_search_local_has_country CHECK (language_kind = 'english' OR country IS NOT NULL),
  CONSTRAINT web_search_charged_only_when_answered CHECK (outcome IN ('FOUND','EMPTY') OR charge_micros = 0),
  CONSTRAINT web_search_found_has_results CHECK ((outcome = 'FOUND') = (result_count > 0)),
  CONSTRAINT web_search_refused_keeps_no_words CHECK ((outcome = 'REFUSED') = (content_ciphertext IS NULL))
);
CREATE INDEX IF NOT EXISTS web_search_run_path ON identity.web_search (run_id, path_ref, searched_at);
CREATE INDEX IF NOT EXISTS web_search_owner ON identity.web_search (owner_ref);
SELECT core.install_truncate_guard('identity.web_search');

-- 2. The pages a search found -------------------------------------------------------------------------------------------
-- text_kept: whether the page's text was stored (§3); a kept text that is gone was wiped. text_chars sizes a reader batch
-- without decrypting; text_digest is the runner's KEYED digest of the text (never a plain hash of public text), which a
-- reader prompt in the ledger names instead of the text.
CREATE TABLE IF NOT EXISTS identity.web_page (
  page_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  search_id uuid NOT NULL,
  rank smallint NOT NULL CONSTRAINT web_page_rank_check CHECK (rank BETWEEN 1 AND 20),
  read_depth text NOT NULL CONSTRAINT web_page_read_depth_check CHECK (read_depth IN ('whole','preview','abstract')),
  text_kept boolean NOT NULL,
  text_chars integer CONSTRAINT web_page_text_chars_check CHECK (text_chars IS NULL OR text_chars BETWEEN 1 AND 262144),
  text_digest bytea CONSTRAINT web_page_text_digest_check CHECK (text_digest IS NULL OR octet_length(text_digest) = 32),
  found_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT web_page_content_size CHECK (octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea NOT NULL,
  CONSTRAINT web_page_run_key UNIQUE (page_id, run_id),
  CONSTRAINT web_page_one_per_rank UNIQUE (search_id, rank),
  CONSTRAINT web_page_text_shape CHECK (text_kept = (text_chars IS NOT NULL) AND text_kept = (text_digest IS NOT NULL)),
  CONSTRAINT web_page_search_fk FOREIGN KEY (search_id, run_id) REFERENCES identity.web_search(search_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS web_page_run ON identity.web_page (run_id, search_id, rank);
CREATE INDEX IF NOT EXISTS web_page_owner ON identity.web_page (owner_ref);
SELECT core.install_truncate_guard('identity.web_page');

-- 3. The page text (transient) ------------------------------------------------------------------------------------------
-- One row per kept page text, encrypted under the run's key (carrier identity.web_page_text, primary key the page_id).
-- At most 2 MiB as stored (262,144 characters, base64 inside the envelope).
CREATE TABLE IF NOT EXISTS identity.web_page_text (
  page_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT web_page_text_content_size CHECK (octet_length(content_ciphertext::text) <= 2097152),
  content_attestation bytea NOT NULL,
  CONSTRAINT web_page_text_page_fk FOREIGN KEY (page_id, run_id) REFERENCES identity.web_page(page_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS web_page_text_run ON identity.web_page_text (run_id, stored_at);
CREATE INDEX IF NOT EXISTS web_page_text_owner ON identity.web_page_text (owner_ref);
SELECT core.install_truncate_guard('identity.web_page_text');

-- 4. The readings -------------------------------------------------------------------------------------------------------
-- reader 1 reads every page; readers 2 and 3 the top pages, each from another maker (owner, Q11: makers count as
-- different companies even when one vendor hosts them). A reader that fails leaves a FAILED row, with no grade or text.
CREATE TABLE IF NOT EXISTS identity.web_reading (
  reading_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  page_id uuid NOT NULL,
  reader smallint NOT NULL CONSTRAINT web_reading_reader_check CHECK (reader BETWEEN 1 AND 3),
  maker text NOT NULL CONSTRAINT web_reading_maker_check CHECK (maker ~ '^[a-z0-9][a-z0-9.-]{0,39}$'),
  outcome text NOT NULL CONSTRAINT web_reading_outcome_check CHECK (outcome IN ('READ','FAILED')),
  grade smallint CONSTRAINT web_reading_grade_check CHECK (grade IS NULL OR grade BETWEEN 0 AND 3),
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT web_reading_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea,
  CONSTRAINT web_reading_one_per_reader UNIQUE (page_id, reader),
  CONSTRAINT web_reading_read_shape CHECK ((outcome = 'READ') = (grade IS NOT NULL) AND (outcome = 'READ') = (content_ciphertext IS NOT NULL)),
  CONSTRAINT web_reading_page_fk FOREIGN KEY (page_id, run_id) REFERENCES identity.web_page(page_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS web_reading_run ON identity.web_reading (run_id, page_id, reader);
CREATE INDEX IF NOT EXISTS web_reading_owner ON identity.web_reading (owner_ref);
SELECT core.install_truncate_guard('identity.web_reading');

-- 5. The checked extracts -----------------------------------------------------------------------------------------------
-- label: the id the debate cites (S<path number>-<n>), unique in the run. found_by: the readers that found it (1-3).
-- The path is the page's own (its search's), copied by the writer so a pack reads its extracts by path.
CREATE TABLE IF NOT EXISTS identity.web_extract (
  extract_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  page_id uuid NOT NULL,
  path_ref text NOT NULL CONSTRAINT web_extract_path_check CHECK (path_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  label text NOT NULL CONSTRAINT web_extract_label_check CHECK (label ~ '^S[0-9]{1,2}-[0-9]{1,3}$'),
  found_by smallint[] NOT NULL CONSTRAINT web_extract_found_by_check CHECK (cardinality(found_by) BETWEEN 1 AND 3
    AND array_position(found_by, NULL) IS NULL AND found_by <@ ARRAY[1,2,3]::smallint[]),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT web_extract_content_size CHECK (octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea NOT NULL,
  CONSTRAINT web_extract_label_once UNIQUE (run_id, label),
  CONSTRAINT web_extract_page_fk FOREIGN KEY (page_id, run_id) REFERENCES identity.web_page(page_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS web_extract_run_path ON identity.web_extract (run_id, path_ref);
CREATE INDEX IF NOT EXISTS web_extract_page ON identity.web_extract (page_id);
CREATE INDEX IF NOT EXISTS web_extract_owner ON identity.web_extract (owner_ref);
SELECT core.install_truncate_guard('identity.web_extract');

-- 6. The top pages of each path ------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.web_pick (
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  path_ref text NOT NULL CONSTRAINT web_pick_path_check CHECK (path_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  rank smallint NOT NULL CONSTRAINT web_pick_rank_check CHECK (rank BETWEEN 1 AND 5),
  page_id uuid NOT NULL,
  picked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT web_pick_pkey PRIMARY KEY (run_id, path_ref, rank),
  CONSTRAINT web_pick_page_once UNIQUE (page_id),
  CONSTRAINT web_pick_page_fk FOREIGN KEY (page_id, run_id) REFERENCES identity.web_page(page_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS web_pick_owner ON identity.web_pick (owner_ref);
SELECT core.install_truncate_guard('identity.web_pick');

-- 7. The packs -----------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.web_pack (
  pack_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  path_ref text NOT NULL CONSTRAINT web_pack_path_check CHECK (path_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  extract_labels text[] NOT NULL CONSTRAINT web_pack_labels_check CHECK (cardinality(extract_labels) <= 64
    AND array_position(extract_labels, NULL) IS NULL),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT web_pack_content_size CHECK (octet_length(content_ciphertext::text) <= 262144),
  content_attestation bytea NOT NULL,
  CONSTRAINT web_pack_one_per_path UNIQUE (run_id, path_ref)
);
CREATE INDEX IF NOT EXISTS web_pack_owner ON identity.web_pack (owner_ref);
SELECT core.install_truncate_guard('identity.web_pack');

-- 8. "Added to researched" ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.web_researched (
  page_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  path_ref text NOT NULL CONSTRAINT web_researched_path_check CHECK (path_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  chosen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome text CONSTRAINT web_researched_outcome_check CHECK (outcome IS NULL OR outcome IN ('ADDS','DOES_NOT_ADD','FAILED')),
  settled_at timestamptz,
  CONSTRAINT web_researched_settled_shape CHECK ((outcome IS NULL) = (settled_at IS NULL)),
  CONSTRAINT web_researched_page_fk FOREIGN KEY (page_id, run_id) REFERENCES identity.web_page(page_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS web_researched_run ON identity.web_researched (run_id, path_ref);
CREATE INDEX IF NOT EXISTS web_researched_owner ON identity.web_researched (owner_ref);
SELECT core.install_truncate_guard('identity.web_researched');

-- 9. The guards ------------------------------------------------------------------------------------------------------------
-- Content (0127's three checks in one, for the six carriers; TG_ARGV[0] names the primary key the envelope is bound to):
-- the run must use content encryption (no web text is ever plaintext), its private content must still be live (not
-- erased, owner active), and a present envelope must carry the runner's attestation under the run's secret. A row with
-- no envelope (a refused search, a failed reading) carries no attestation either; each table says which rows may.
CREATE OR REPLACE FUNCTION identity.enforce_web_evidence_content() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_row jsonb := pg_catalog.to_jsonb(NEW);
  v_run uuid := (v_row->>'run_id')::uuid;
  v_envelope jsonb := v_row->'content_ciphertext';
  v_owner uuid;
  v_secret bytea;
  v_expected bytea;
BEGIN
  IF NOT COALESCE(core.run_uses_content_encryption(v_run), false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_ENCRYPTION_REQUIRED';
  END IF;
  PERFORM 1 FROM core.run AS run WHERE run.run_id = v_run FOR KEY SHARE;
  SELECT event.owner_ref INTO v_owner FROM core.run_ownership_event AS event
  WHERE event.run_id = v_run ORDER BY event.at_seq ASC LIMIT 1;
  PERFORM 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = v_owner FOR KEY SHARE;
  IF NOT core.run_private_content_is_live(v_run) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
  END IF;
  IF v_envelope IS NULL OR pg_catalog.jsonb_typeof(v_envelope) = 'null' THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(v_envelope)
    OR NEW.content_attestation IS NULL OR pg_catalog.octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret.secret INTO v_secret FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = v_run;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  v_expected := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(v_run, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, v_row->>TG_ARGV[0],
      'content_ciphertext', v_envelope), v_secret, 'sha256');
  IF audit_crypto_internal.digest(NEW.content_attestation, 'sha256') <> audit_crypto_internal.digest(v_expected, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := v_expected;
  RETURN NEW;
END;
$$;

-- Append-only: no UPDATE, but the researched outcome set once (outcome and settled_at, from NULL); no DELETE, but of a
-- deleted account's rows (its identity."user" row is already gone: the cascade), within the forget definer (it sets
-- debateai.web_evidence_forget for its own statements), or of the transient text (TG_ARGV[0] 'transient', which only the
-- wipe and forget definers can reach: no role holds a table right).
CREATE OR REPLACE FUNCTION identity.guard_web_evidence_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Read through jsonb: the other tables have no outcome column for a field reference to name.
    IF TG_TABLE_NAME = 'web_researched' THEN
      IF (pg_catalog.to_jsonb(OLD)->>'outcome') IS NULL AND (pg_catalog.to_jsonb(NEW)->>'outcome') IS NOT NULL
        AND (pg_catalog.to_jsonb(NEW) - 'outcome' - 'settled_at') = (pg_catalog.to_jsonb(OLD) - 'outcome' - 'settled_at') THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='WEB_EVIDENCE_APPEND_ONLY';
  END IF;
  IF COALESCE(TG_ARGV[0], '') = 'transient'
    OR pg_catalog.current_setting('debateai.web_evidence_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='WEB_EVIDENCE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_search;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_search
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('search_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_page;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_page
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('page_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_page_text;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_page_text
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('page_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_reading;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_reading
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('reading_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_extract;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_extract
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('extract_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_pack;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_pack
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('pack_id');
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_search;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_search
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record();
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_page;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_page
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record();
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_page_text;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_page_text
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record('transient');
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_reading;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_reading
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record();
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_extract;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_extract
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record();
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_pick;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_pick
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record();
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_pack;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_pack
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record();
DROP TRIGGER IF EXISTS guard_web_evidence_record ON identity.web_researched;
CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON identity.web_researched
FOR EACH ROW EXECUTE FUNCTION identity.guard_web_evidence_record();

-- 10. The runner's writers and readers ------------------------------------------------------------------------------------
-- The run's account: its latest ownership event's (0131's rule), active and the run not erased; null otherwise. Private.
CREATE OR REPLACE FUNCTION identity.web_evidence_run_owner(p_run_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT owner.owner_ref FROM (SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1) AS owner
  WHERE EXISTS (SELECT 1 FROM identity."user" AS identity_user
      WHERE identity_user.owner_ref = owner.owner_ref AND identity_user.state = 'active')
    AND NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone WHERE tombstone.run_id = p_run_id)
$$;
-- Every writer and the deletion take one transaction lock per run ('identity:web-evidence:<run>') before the owner
-- check: a write that arrives while a deletion commits waits and then finds the run erased (NOT_LIVE); a deletion that
-- arrives while a write commits waits and then deletes what it wrote. Each writer answers RECORDED, or ALREADY when its
-- row is there (a resumed run writes the same rows again; the first write stays), or NOT_LIVE (the run is not a live
-- private debate). A row that breaks a table rule is refused by that rule (23514 / 23505 / 23503).

-- A search (§1). content/attestation: the encrypted search words, absent for a REFUSED one.
CREATE OR REPLACE FUNCTION identity.record_web_search(p_run_id uuid, p_search_id uuid, p_path_ref text, p_side text,
  p_language_kind text, p_language text, p_country text, p_look_back text, p_outcome text, p_charge_micros bigint,
  p_result_count smallint, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_search_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_search AS search WHERE search.search_id = p_search_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.web_search (search_id, run_id, owner_ref, path_ref, side, language_kind, language, country, look_back,
    outcome, charge_micros, result_count, content_ciphertext, content_attestation)
  VALUES (p_search_id, p_run_id, v_owner, p_path_ref, p_side, p_language_kind, p_language, p_country, p_look_back,
    p_outcome, p_charge_micros, p_result_count, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- A page and, in the same call, its text (§2, §3): the pages are stored before any reader call (a resumed run reads them
-- again and replays its reader calls). p_text_* all null: no text kept (preview-only or abstract-only pages may still
-- carry one). NO_SEARCH: the search is not this run's FOUND one, or the rank is past its result count.
CREATE OR REPLACE FUNCTION identity.record_web_page(p_run_id uuid, p_page_id uuid, p_search_id uuid, p_rank smallint,
  p_read_depth text, p_content jsonb, p_attestation bytea, p_text_chars integer, p_text_digest bytea,
  p_text_content jsonb, p_text_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_text boolean := p_text_content IS NOT NULL;
BEGIN
  IF p_run_id IS NULL OR p_page_id IS NULL
    OR v_text <> (p_text_chars IS NOT NULL) OR v_text <> (p_text_digest IS NOT NULL) OR v_text <> (p_text_attestation IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_page AS page WHERE page.page_id = p_page_id) THEN RETURN 'ALREADY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.web_search AS search WHERE search.search_id = p_search_id
      AND search.run_id = p_run_id AND search.outcome = 'FOUND' AND p_rank <= search.result_count) THEN
    RETURN 'NO_SEARCH';
  END IF;
  INSERT INTO identity.web_page (page_id, run_id, owner_ref, search_id, rank, read_depth, text_kept, text_chars, text_digest,
    content_ciphertext, content_attestation)
  VALUES (p_page_id, p_run_id, v_owner, p_search_id, p_rank, p_read_depth, v_text, p_text_chars, p_text_digest,
    p_content, p_attestation);
  IF v_text THEN
    INSERT INTO identity.web_page_text (page_id, run_id, owner_ref, content_ciphertext, content_attestation)
    VALUES (p_page_id, p_run_id, v_owner, p_text_content, p_text_attestation);
  END IF;
  RETURN 'RECORDED';
END;
$$;

-- A reading (§4). NO_PAGE: not a page of this run. SAME_MAKER: readers 2 and 3 come from makers that have not read this
-- page yet (reader 1's maker included).
CREATE OR REPLACE FUNCTION identity.record_web_reading(p_run_id uuid, p_reading_id uuid, p_page_id uuid, p_reader smallint,
  p_maker text, p_outcome text, p_grade smallint, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_reading_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_reading AS reading WHERE reading.reading_id = p_reading_id
      OR (reading.page_id = p_page_id AND reading.reader = p_reader)) THEN
    RETURN 'ALREADY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.web_page AS page WHERE page.page_id = p_page_id AND page.run_id = p_run_id) THEN
    RETURN 'NO_PAGE';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.web_reading AS reading WHERE reading.page_id = p_page_id AND reading.maker = p_maker) THEN
    RETURN 'SAME_MAKER';
  END IF;
  INSERT INTO identity.web_reading (reading_id, run_id, owner_ref, page_id, reader, maker, outcome, grade,
    content_ciphertext, content_attestation)
  VALUES (p_reading_id, p_run_id, v_owner, p_page_id, p_reader, p_maker, p_outcome, p_grade, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- A checked extract (§5): only code that found the quote on the stored page text writes one (W2-4's checker).
-- LABEL_TAKEN: the label names another extract of this run.
CREATE OR REPLACE FUNCTION identity.record_web_extract(p_run_id uuid, p_extract_id uuid, p_page_id uuid, p_label text,
  p_found_by smallint[], p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_path text;
BEGIN
  IF p_run_id IS NULL OR p_extract_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_extract AS ex WHERE ex.extract_id = p_extract_id) THEN RETURN 'ALREADY'; END IF;
  SELECT search.path_ref INTO v_path FROM identity.web_page AS page
    JOIN identity.web_search AS search ON search.search_id = page.search_id
  WHERE page.page_id = p_page_id AND page.run_id = p_run_id;
  IF NOT FOUND THEN RETURN 'NO_PAGE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_extract AS ex WHERE ex.run_id = p_run_id AND ex.label = p_label) THEN
    RETURN 'LABEL_TAKEN';
  END IF;
  INSERT INTO identity.web_extract (extract_id, run_id, owner_ref, page_id, path_ref, label, found_by,
    content_ciphertext, content_attestation)
  VALUES (p_extract_id, p_run_id, v_owner, p_page_id, v_path, p_label, p_found_by, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- A path's top pages (§6), best first, 1-5 distinct pages of that path. NOT_THIS_PATH: a page is not one of the path's.
CREATE OR REPLACE FUNCTION identity.record_web_picks(p_run_id uuid, p_path_ref text, p_page_ids uuid[]) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_page_ids IS NULL OR COALESCE(array_ndims(p_page_ids), 1) <> 1
    OR cardinality(p_page_ids) NOT BETWEEN 1 AND 5 OR array_position(p_page_ids, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT page) FROM unnest(p_page_ids) AS page) <> cardinality(p_page_ids) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_pick AS pick WHERE pick.run_id = p_run_id AND pick.path_ref = p_path_ref) THEN
    RETURN 'ALREADY';
  END IF;
  IF (SELECT count(*) FROM identity.web_page AS page JOIN identity.web_search AS search ON search.search_id = page.search_id
      WHERE page.run_id = p_run_id AND search.path_ref = p_path_ref AND page.page_id = ANY (p_page_ids)) <> cardinality(p_page_ids) THEN
    RETURN 'NOT_THIS_PATH';
  END IF;
  INSERT INTO identity.web_pick (run_id, owner_ref, path_ref, rank, page_id)
  SELECT p_run_id, v_owner, p_path_ref, picked.rank::smallint, picked.page_id
  FROM unnest(p_page_ids) WITH ORDINALITY AS picked(page_id, rank);
  RETURN 'RECORDED';
END;
$$;

-- A path's pack (§7). UNKNOWN_EXTRACT: a label is not an extract of this run and path.
CREATE OR REPLACE FUNCTION identity.record_web_pack(p_run_id uuid, p_pack_id uuid, p_path_ref text, p_extract_labels text[],
  p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_pack_id IS NULL OR p_extract_labels IS NULL OR COALESCE(array_ndims(p_extract_labels), 1) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_pack AS pack WHERE pack.pack_id = p_pack_id
      OR (pack.run_id = p_run_id AND pack.path_ref = p_path_ref)) THEN
    RETURN 'ALREADY';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_extract_labels) AS wanted(label) WHERE wanted.label IS NULL OR NOT EXISTS (
      SELECT 1 FROM identity.web_extract AS ex WHERE ex.run_id = p_run_id AND ex.path_ref = p_path_ref
        AND ex.label = wanted.label)) THEN
    RETURN 'UNKNOWN_EXTRACT';
  END IF;
  INSERT INTO identity.web_pack (pack_id, run_id, owner_ref, path_ref, extract_labels, content_ciphertext, content_attestation)
  VALUES (p_pack_id, p_run_id, v_owner, p_path_ref, p_extract_labels, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- Everything one run's web step kept, but the page texts: {"searches", "pages", "readings", "extracts", "picks", "packs",
-- "researched"}, each a list in a fixed order, each content as its envelope (the caller decrypts under the run's key).
-- A page's text_state: STORED, WIPED (kept, then wiped) or NONE (never kept). Null when the run is not a live private
-- debate. For the runner (resume, packs, the arguing legs) and the API's serve (debateai_billing_runtime is a member of
-- the runtime role).
CREATE OR REPLACE FUNCTION identity.read_web_evidence(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'searches', COALESCE((SELECT jsonb_agg(jsonb_build_object('search_id', search.search_id, 'path_ref', search.path_ref,
        'side', search.side, 'language_kind', search.language_kind, 'language', search.language, 'country', search.country,
        'look_back', search.look_back, 'outcome', search.outcome, 'charge_micros', search.charge_micros,
        'result_count', search.result_count, 'searched_at', search.searched_at, 'content', search.content_ciphertext)
        ORDER BY search.searched_at, search.search_id)
      FROM identity.web_search AS search WHERE search.run_id = p_run_id), '[]'::jsonb),
    'pages', COALESCE((SELECT jsonb_agg(jsonb_build_object('page_id', page.page_id, 'search_id', page.search_id,
        'rank', page.rank, 'read_depth', page.read_depth, 'text_chars', page.text_chars,
        'text_digest', encode(page.text_digest, 'hex'), 'found_at', page.found_at, 'content', page.content_ciphertext,
        'text_state', CASE WHEN NOT page.text_kept THEN 'NONE'
          WHEN EXISTS (SELECT 1 FROM identity.web_page_text AS kept WHERE kept.page_id = page.page_id) THEN 'STORED'
          ELSE 'WIPED' END)
        ORDER BY page.search_id, page.rank)
      FROM identity.web_page AS page WHERE page.run_id = p_run_id), '[]'::jsonb),
    'readings', COALESCE((SELECT jsonb_agg(jsonb_build_object('reading_id', reading.reading_id, 'page_id', reading.page_id,
        'reader', reading.reader, 'maker', reading.maker, 'outcome', reading.outcome, 'grade', reading.grade,
        'read_at', reading.read_at, 'content', reading.content_ciphertext) ORDER BY reading.page_id, reading.reader)
      FROM identity.web_reading AS reading WHERE reading.run_id = p_run_id), '[]'::jsonb),
    'extracts', COALESCE((SELECT jsonb_agg(jsonb_build_object('extract_id', ex.extract_id, 'page_id', ex.page_id,
        'path_ref', ex.path_ref, 'label', ex.label, 'found_by', to_jsonb(ex.found_by),
        'created_at', ex.created_at, 'content', ex.content_ciphertext) ORDER BY ex.label)
      FROM identity.web_extract AS ex WHERE ex.run_id = p_run_id), '[]'::jsonb),
    'picks', COALESCE((SELECT jsonb_agg(jsonb_build_object('path_ref', pick.path_ref, 'rank', pick.rank, 'page_id', pick.page_id)
        ORDER BY pick.path_ref, pick.rank)
      FROM identity.web_pick AS pick WHERE pick.run_id = p_run_id), '[]'::jsonb),
    'packs', COALESCE((SELECT jsonb_agg(jsonb_build_object('pack_id', pack.pack_id, 'path_ref', pack.path_ref,
        'extract_labels', to_jsonb(pack.extract_labels), 'created_at', pack.created_at, 'content', pack.content_ciphertext)
        ORDER BY pack.path_ref)
      FROM identity.web_pack AS pack WHERE pack.run_id = p_run_id), '[]'::jsonb),
    'researched', COALESCE((SELECT jsonb_agg(jsonb_build_object('page_id', chosen.page_id, 'path_ref', chosen.path_ref,
        'chosen_at', chosen.chosen_at, 'outcome', chosen.outcome, 'settled_at', chosen.settled_at)
        ORDER BY chosen.chosen_at, chosen.page_id)
      FROM identity.web_researched AS chosen WHERE chosen.run_id = p_run_id), '[]'::jsonb));
END;
$$;

-- The stored texts of some of a run's pages (at most 64 per call), for the runner's readers: page_id, its keyed digest,
-- and the envelope. A wiped or never-kept text is simply absent.
CREATE OR REPLACE FUNCTION identity.read_web_page_texts(p_run_id uuid, p_page_ids uuid[])
RETURNS TABLE (page_id uuid, text_digest bytea, content_ciphertext jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
BEGIN
  IF p_page_ids IS NULL OR cardinality(p_page_ids) > 64 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT kept.page_id, page.text_digest, kept.content_ciphertext
    FROM identity.web_page_text AS kept JOIN identity.web_page AS page ON page.page_id = kept.page_id
    WHERE kept.run_id = p_run_id AND kept.page_id = ANY (p_page_ids)
    ORDER BY kept.page_id;
END;
$$;

-- The readers' outcome of a page the person added (§8): set once. NOT_CHOSEN: no such choice in this run.
CREATE OR REPLACE FUNCTION identity.settle_web_researched(p_run_id uuid, p_page_id uuid, p_outcome text) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_outcome text;
BEGIN
  IF p_run_id IS NULL OR p_page_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('ADDS','DOES_NOT_ADD','FAILED') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  SELECT chosen.outcome INTO v_outcome FROM identity.web_researched AS chosen
  WHERE chosen.page_id = p_page_id AND chosen.run_id = p_run_id;
  IF NOT FOUND THEN RETURN 'NOT_CHOSEN'; END IF;
  IF v_outcome IS NOT NULL THEN RETURN 'ALREADY'; END IF;
  UPDATE identity.web_researched SET outcome = p_outcome, settled_at = clock_timestamp()
  WHERE page_id = p_page_id AND run_id = p_run_id;
  RETURN 'SETTLED';
END;
$$;

-- 11. The person's choice (the API) -----------------------------------------------------------------------------------------
-- "Add to researched" (owner, Q7): a page of one of this debate's paths that is not among its top pages. RECORDED,
-- ALREADY (the same page again), NOT_OWNED (not this account's live debate), NOT_OTHER_PAGE (not a page of this run, or
-- one of the top pages). Free plans are refused by the route (W4-4), before this.
CREATE OR REPLACE FUNCTION identity.record_web_researched(p_owner_ref uuid, p_run_id uuid, p_page_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_path text;
BEGIN
  IF p_owner_ref IS NULL OR p_run_id IS NULL OR p_page_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  IF identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN 'NOT_OWNED'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_researched AS chosen WHERE chosen.page_id = p_page_id AND chosen.run_id = p_run_id) THEN
    RETURN 'ALREADY';
  END IF;
  SELECT search.path_ref INTO v_path FROM identity.web_page AS page
    JOIN identity.web_search AS search ON search.search_id = page.search_id
  WHERE page.page_id = p_page_id AND page.run_id = p_run_id
    AND NOT EXISTS (SELECT 1 FROM identity.web_pick AS pick WHERE pick.page_id = page.page_id);
  IF NOT FOUND THEN RETURN 'NOT_OTHER_PAGE'; END IF;
  INSERT INTO identity.web_researched (page_id, run_id, owner_ref, path_ref) VALUES (p_page_id, p_run_id, p_owner_ref, v_path);
  RETURN 'RECORDED';
END;
$$;

-- 12. Deleting one debate (R22 item 16) ------------------------------------------------------------------------------------
-- In the transaction that writes the run's erasure tombstone (0040/0123's per-run erasure, 0126's system erasure), the
-- erasure role calls this for the run (packages/db/src/erasure-page-memory.ts, beside 0131's): every row of its web step
-- goes. Refuses 55000 WEB_EVIDENCE_DEBATE_NOT_ERASED without the tombstone, deleting nothing. Returns how many rows went
-- (0 when asked again). Account erasure needs none of this: every row cascades with identity."user".
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_web_evidence(p_run_id uuid) RETURNS integer
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
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='WEB_EVIDENCE_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'on', true);
  DELETE FROM identity.web_researched AS chosen WHERE chosen.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_pack AS pack WHERE pack.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_pick AS pick WHERE pick.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_extract AS ex WHERE ex.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_reading AS reading WHERE reading.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_page_text AS kept WHERE kept.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_page AS page WHERE page.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_search AS search WHERE search.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 13. The export reader ----------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate): per debate of the account that has a web step, read_web_evidence's lists
-- (envelopes included: the export worker opens them under each run's key). The transient page texts are not exported
-- (third parties' pages, kept at most 30 days); their links and checked quotes are.
CREATE OR REPLACE FUNCTION identity.read_data_export_web_evidence(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', runs.run_id, 'web', identity.read_web_evidence(runs.run_id))
      ORDER BY runs.run_id)
    FROM (SELECT DISTINCT search.run_id FROM identity.web_search AS search WHERE search.owner_ref = v_owner_ref) AS runs
    WHERE identity.read_web_evidence(runs.run_id) IS NOT NULL), '[]'::jsonb);
END;
$$;

-- 14. One owner, then the grants -------------------------------------------------------------------------------------------
-- The tables and definers take 0115's export owner (0115:383-386), as 0131's do: it reads identity."user",
-- core.run_ownership_event and 0040's tombstones, owns 0128's lease gate and 0131's account tables. The two trigger
-- functions keep the migrator as owner, as 0127's content checks do (they read the run's attestation secret).
-- n1: reviewed gives only the eight new tables and thirteen new functions 0115's export owner, as 0131 does; touches no earlier object
DO $web_evidence_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.web_search', 'identity.web_page', 'identity.web_page_text', 'identity.web_reading',
    'identity.web_extract', 'identity.web_pick', 'identity.web_pack', 'identity.web_researched'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.web_evidence_run_owner(uuid)',
    'identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)',
    'identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)',
    'identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)',
    'identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)',
    'identity.record_web_picks(uuid,text,uuid[])',
    'identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)',
    'identity.read_web_evidence(uuid)',
    'identity.read_web_page_texts(uuid,uuid[])',
    'identity.settle_web_researched(uuid,uuid,text)',
    'identity.record_web_researched(uuid,uuid,uuid)',
    'identity.forget_erased_debate_web_evidence(uuid)',
    'identity.read_data_export_web_evidence(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$web_evidence_owner$;

-- No role reads or writes the tables directly: every access goes through the functions above.
REVOKE ALL ON identity.web_search FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_page FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_page_text FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_reading FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_extract FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_pick FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_pack FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_researched FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.enforce_web_evidence_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.guard_web_evidence_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.web_evidence_run_owner(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_picks(uuid,text,uuid[]) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_web_evidence(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_web_page_texts(uuid,uuid[]) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.settle_web_researched(uuid,uuid,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_researched(uuid,uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_web_evidence(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_web_evidence(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_picks(uuid,text,uuid[]) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_web_evidence(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_web_page_texts(uuid,uuid[]) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.settle_web_researched(uuid,uuid,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_researched(uuid,uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_web_evidence(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_web_evidence(uuid,uuid) TO debateai_data_export_worker;

-- 15. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0131's closing shape) ---------------------------------------
DO $web_evidence_contract$
DECLARE
  v_owner oid;
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.web_search', 'identity.web_page', 'identity.web_page_text', 'identity.web_reading',
    'identity.web_extract', 'identity.web_pick', 'identity.web_pack', 'identity.web_researched'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = pg_catalog.to_regclass(v_name)) IS DISTINCT FROM v_owner
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'guard_web_evidence_record' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
      RAISE EXCEPTION 'WEB_EVIDENCE_0132_CONTRACT tables %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'WEB_EVIDENCE_0132_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  -- The six carriers check every insert's content.
  IF (SELECT count(*) FROM pg_catalog.pg_trigger AS t WHERE t.tgname = 'aaa_enforce_web_evidence_content' AND NOT t.tgisinternal
      AND t.tgenabled = 'O' AND t.tgfoid = 'identity.enforce_web_evidence_content()'::regprocedure) <> 6 THEN
    RAISE EXCEPTION 'WEB_EVIDENCE_0132_CONTRACT content triggers';
  END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)',
    'identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)',
    'identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)',
    'identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)',
    'identity.record_web_picks(uuid,text,uuid[])',
    'identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)',
    'identity.read_web_evidence(uuid)',
    'identity.read_web_page_texts(uuid,uuid[])',
    'identity.settle_web_researched(uuid,uuid,text)',
    'identity.record_web_researched(uuid,uuid,uuid)',
    'identity.forget_erased_debate_web_evidence(uuid)',
    'identity.read_data_export_web_evidence(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'WEB_EVIDENCE_0132_CONTRACT definers %', v_name;
    END IF;
    -- Exactly one grantee each: the export worker the reader, the erasure role the deletion, the API's role the person's
    -- choice, the runtime role (the runner) the rest, which the roles that are members of it (the API's two) inherit.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (CASE v_name
          WHEN 'identity.read_data_export_web_evidence(uuid,uuid)' THEN v_role = 'debateai_data_export_worker'
          WHEN 'identity.forget_erased_debate_web_evidence(uuid)' THEN v_role = 'debateai_erasure_runtime'
          WHEN 'identity.record_web_researched(uuid,uuid,uuid)' THEN pg_catalog.pg_has_role(v_role, 'debateai_billing_runtime', 'USAGE')
          ELSE pg_catalog.pg_has_role(v_role, 'debateai_runtime', 'USAGE') END) THEN
        RAISE EXCEPTION 'WEB_EVIDENCE_0132_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'identity.web_evidence_run_owner(uuid)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.enforce_web_evidence_content()', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.guard_web_evidence_record()', 'EXECUTE') THEN
      RAISE EXCEPTION 'WEB_EVIDENCE_0132_CONTRACT helper %', v_role;
    END IF;
  END LOOP;
END
$web_evidence_contract$;
