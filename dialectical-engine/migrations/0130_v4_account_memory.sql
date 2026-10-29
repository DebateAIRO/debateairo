-- 0130 · V4 account memory (owner rulings N7 and N11, 2026-10-29; test-site release R22).
-- .superpowers/sdd/v4-account-memory/DESIGN.md §1.
--
-- The V4 pages remember three things in the person's ACCOUNT, never in the browser (a browser key would need a cookie-page
-- entry in every language, S01-R17):
--   §1 identity.page_reading_level: the reading level the person chose (plain, background or expert), one row per account;
--   §2 identity.debate_last_visit: per debate the person owns, when they last looked at its map and a small snapshot of
--      what the map showed then (item id → state word: a dig's state, a path's fate, open/dug, a point's trust word), so
--      the page can tell what changed "since your last visit", from any device;
--   §3 identity.dig_link (N11): per dig (a follow-up debate started from one place on a map), the debate it came from,
--      the places on that map it was dug from and its mode (quick or thorough), so V4 finds digs and the back link from
--      these rows instead of by question text;
--   §4 the API's six functions, for debateai_billing_runtime alone (the API's own role, as 0125's
--      identity.record_signup_italy_approval; never the runtime role the runner and scheduler share): every run they
--      touch must be the caller's (and not erased), and what they store is validated first;
--   §4b identity.forget_erased_debate_page_memory(uuid) (R22 item 16, owner 2026-10-29: "Yes, delete them too"): deleting
--      one private debate also deletes its visit row and every dig link where it is the parent or the child, in the
--      transaction that finishes the deletion, for debateai_erasure_runtime alone;
--   §5 identity.read_data_export_page_memory(uuid,uuid): the three tables for the account's data export, for the export
--      worker alone, behind 0128's lease gate;
--   §6 one owner for all of it: 0115's export owner (0115:383-386), as 0125 gives its export reader;
--   §7 the closing block: the contract this file claims, checked rather than assumed.
-- No question or answer text is stored: ids, the level, state words, places and times only. Every row names the
-- account's owner_ref with ON DELETE CASCADE, so account erasure (0110's identity.finalize_account_erasure deletes the
-- identity."user" row) removes them with the account. No foreign key to core.run: ownership is checked on every call.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: three new tables and nine new functions; the release before reads and writes none
--                   of them, so it keeps running beside it. No earlier function, table or trigger changes: the deletion
--                   path calls §4b from the API (packages/db/src/account-erasure.ts and synthesis-check-erasure.ts, in
--                   the finalize transaction), not from a trigger on 0040's tombstone. The one grant to an existing role
--                   (§4b's EXECUTE for debateai_erasure_runtime) is the erasure boot check's concern: a release's check
--                   counts that role's functions exactly (assertAccountErasureDatabaseRole), so a release before this
--                   one would refuse to restart its erasure worker beside it, as it already would beside 0126's three.
--                   R22, the first release to carry 0130, goes the drained way for 0126-0129, so none does.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-111.sql (0111's,
--                   migrations/lineage/README.md step 3) stays in force and the manifest names it.
--
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): CREATE TABLE / INDEX IF NOT
-- EXISTS with their constraints inline, CREATE OR REPLACE FUNCTION of names no earlier migration defines, and
-- core.install_truncate_guard (idempotent, 0056).

-- 1. The reading level ------------------------------------------------------------------------------------------------
-- One row per account: the level the person last chose on any V4 page. A level in the page address still wins for that
-- view (the page decides that); this row is what a fresh visit, or another device, starts from.
CREATE TABLE IF NOT EXISTS identity.page_reading_level (
  owner_ref uuid PRIMARY KEY REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  reading_level text NOT NULL CONSTRAINT page_reading_level_level_check CHECK (reading_level IN ('plain','background','expert')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SELECT core.install_truncate_guard('identity.page_reading_level');

-- 2. The last visit of each debate -------------------------------------------------------------------------------------
-- One row per (account, debate): when the map was last shown and what it showed, as item id → state word. Ids are the
-- map's own (a dig's run id, a story path's position id, an open question's id, a point's node id); words come from a
-- closed vocabulary (dig states, path fates, open/dug, trust words). The writer (§4) checks every entry and caps the
-- snapshot at 512 entries; the table itself caps its size, so no row can grow past 64 KiB.
CREATE TABLE IF NOT EXISTS identity.debate_last_visit (
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  items jsonb NOT NULL CONSTRAINT debate_last_visit_items_check CHECK (jsonb_typeof(items) = 'object' AND octet_length(items::text) <= 65536),
  CONSTRAINT debate_last_visit_pkey PRIMARY KEY (owner_ref, run_id)
);
-- By the run alone, for §4b's deletion of one debate.
CREATE INDEX IF NOT EXISTS debate_last_visit_run ON identity.debate_last_visit (run_id);
SELECT core.install_truncate_guard('identity.debate_last_visit');

-- 3. The dig links (N11) -----------------------------------------------------------------------------------------------
-- One row per dig, keyed by the dig's own run (a run is dug from one debate only). places: where on the parent's map it
-- was dug from, as the map names them (an open question "p:<node>", "o:<n>" or "w", or a whole path "path:<id>"); an
-- empty list hangs the dig under the question itself. The index serves "the digs of this debate" and the cascade.
CREATE TABLE IF NOT EXISTS identity.dig_link (
  child_run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  parent_run_id uuid NOT NULL,
  places text[] NOT NULL CONSTRAINT dig_link_places_check CHECK (cardinality(places) <= 16 AND array_position(places, NULL) IS NULL),
  mode text NOT NULL CONSTRAINT dig_link_mode_check CHECK (mode IN ('quick','thorough')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT dig_link_not_itself CHECK (child_run_id <> parent_run_id)
);
CREATE INDEX IF NOT EXISTS dig_link_parent ON identity.dig_link (owner_ref, parent_run_id, created_at);
-- By the parent alone, for §4b's deletion of one debate (the child is the primary key).
CREATE INDEX IF NOT EXISTS dig_link_parent_run ON identity.dig_link (parent_run_id);
SELECT core.install_truncate_guard('identity.dig_link');

-- 4. The API's functions -----------------------------------------------------------------------------------------------
-- Ownership: the server branch of 0037's core.run_is_owned_by — the run's latest ownership event names this account,
-- and the account is active — and the run is not erased (R22 item 16: once 0040's erasure tombstone exists, the debate
-- is gone, so nothing of it is read or written again). A private helper: no role may call it; the definers below run it
-- as their owner.
CREATE OR REPLACE FUNCTION identity.page_memory_run_owned(p_owner_ref uuid, p_run_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(p_owner_ref IS NOT NULL AND p_run_id IS NOT NULL
    AND (SELECT event.owner_ref FROM core.run_ownership_event AS event
         WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1) = p_owner_ref
    AND EXISTS (SELECT 1 FROM identity."user" AS identity_user
         WHERE identity_user.owner_ref = p_owner_ref AND identity_user.state = 'active')
    AND NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
         WHERE tombstone.run_id = p_run_id), false)
$$;
-- The two writers and §4b's deletion take a transaction lock on each run they touch ('identity:page-memory:<run>'),
-- the writers before their ownership check: a write that arrives while a deletion commits waits for it and then finds
-- the run erased, and a deletion that arrives while a write commits waits for it and then deletes what it wrote.

-- The account's level, or null before the person first chooses one.
CREATE OR REPLACE FUNCTION identity.read_page_reading_level(p_owner_ref uuid) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT level.reading_level FROM identity.page_reading_level AS level WHERE level.owner_ref = p_owner_ref
$$;

-- Saves the level (the last choice wins). Refusals, each 22023: PAGE_READING_LEVEL_INVALID (not one of the three),
-- PAGE_MEMORY_ACCOUNT_INVALID (no active account with that owner_ref).
CREATE OR REPLACE FUNCTION identity.save_page_reading_level(p_owner_ref uuid, p_reading_level text) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_reading_level IS NULL OR p_reading_level NOT IN ('plain','background','expert') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PAGE_READING_LEVEL_INVALID';
  END IF;
  IF p_owner_ref IS NULL OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user
      WHERE identity_user.owner_ref = p_owner_ref AND identity_user.state = 'active') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PAGE_MEMORY_ACCOUNT_INVALID';
  END IF;
  INSERT INTO identity.page_reading_level (owner_ref, reading_level, updated_at)
  VALUES (p_owner_ref, p_reading_level, clock_timestamp())
  ON CONFLICT (owner_ref) DO UPDATE SET reading_level = EXCLUDED.reading_level, updated_at = EXCLUDED.updated_at;
  RETURN p_reading_level;
END;
$$;

-- One row, always: owned false (not this account's debate: the API answers its closed 404), or owned true with the last
-- visit (seen_at and items both null before a first visit).
CREATE OR REPLACE FUNCTION identity.read_debate_last_visit(p_owner_ref uuid, p_run_id uuid)
RETURNS TABLE (owned boolean, seen_at timestamptz, items jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN
    RETURN QUERY SELECT false, NULL::timestamptz, NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT true, visit.seen_at, visit.items FROM identity.debate_last_visit AS visit
    WHERE visit.owner_ref = p_owner_ref AND visit.run_id = p_run_id
    UNION ALL
    SELECT true, NULL::timestamptz, NULL::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM identity.debate_last_visit AS visit
      WHERE visit.owner_ref = p_owner_ref AND visit.run_id = p_run_id);
END;
$$;

-- Saves what the map showed now and returns the time it was saved, or null when the debate is not this account's.
-- Refusal 22023 DEBATE_VISIT_INVALID, before any read: not a JSON object, more than 512 entries, larger than 64 KiB as
-- stored, a key that is not "<dig|path|open|point>:<id>" (id 1-150 printable ASCII characters other than a space, a
-- double quote or a backslash, so the stored size is the one the contract computes) or a word that is not 1-32 letters or _.
CREATE OR REPLACE FUNCTION identity.record_debate_last_visit(p_owner_ref uuid, p_run_id uuid, p_items jsonb) RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_seen_at timestamptz := clock_timestamp();
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'object'
    OR octet_length(p_items::text) > 65536
    OR (SELECT count(*) FROM jsonb_each(p_items)) > 512
    OR EXISTS (SELECT 1 FROM jsonb_each(p_items) AS item
      WHERE item.key !~ '^(dig|path|open|point):[\x21\x23-\x5b\x5d-\x7e]{1,150}$'
        OR jsonb_typeof(item.value) IS DISTINCT FROM 'string'
        OR (item.value #>> '{}') !~ '^[A-Za-z_]{1,32}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='DEBATE_VISIT_INVALID';
  END IF;
  IF p_run_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || p_run_id::text, 0));
  END IF;
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO identity.debate_last_visit (owner_ref, run_id, seen_at, items)
  VALUES (p_owner_ref, p_run_id, v_seen_at, p_items)
  ON CONFLICT (owner_ref, run_id) DO UPDATE SET seen_at = EXCLUDED.seen_at, items = EXCLUDED.items;
  RETURN v_seen_at;
END;
$$;

-- The links around one debate: null when it is not this account's; else {"parent": the link it was dug by, or null;
-- "children": the digs made from it, oldest first, at most 200}. Each link: parent_run_id, child_run_id, places, mode,
-- created_at.
CREATE OR REPLACE FUNCTION identity.read_dig_links(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'parent', (SELECT jsonb_build_object('parent_run_id', link.parent_run_id, 'child_run_id', link.child_run_id,
        'places', to_jsonb(link.places), 'mode', link.mode, 'created_at', link.created_at)
      FROM identity.dig_link AS link WHERE link.child_run_id = p_run_id AND link.owner_ref = p_owner_ref),
    'children', COALESCE((SELECT jsonb_agg(jsonb_build_object('parent_run_id', child.parent_run_id,
        'child_run_id', child.child_run_id, 'places', to_jsonb(child.places), 'mode', child.mode,
        'created_at', child.created_at) ORDER BY child.created_at, child.child_run_id)
      FROM (SELECT link.* FROM identity.dig_link AS link
        WHERE link.owner_ref = p_owner_ref AND link.parent_run_id = p_run_id
        ORDER BY link.created_at, link.child_run_id LIMIT 200) AS child), '[]'::jsonb));
END;
$$;

-- Records that p_child_run_id was dug from p_parent_run_id. RECORDED (also when the same link is sent again; the first
-- places and mode stay), NOT_OWNED (either debate is not this account's), CONFLICT (the dig is already linked to another
-- debate). Refusal 22023 DIG_LINK_INVALID, before any read: a missing id, the same id twice, more than 16 places, a place
-- that is not 1-160 printable ASCII characters (no space, double quote or backslash), or a mode that is not quick or thorough.
CREATE OR REPLACE FUNCTION identity.record_dig_link(p_owner_ref uuid, p_parent_run_id uuid, p_child_run_id uuid, p_places text[], p_mode text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_parent uuid;
BEGIN
  IF p_parent_run_id IS NULL OR p_child_run_id IS NULL OR p_parent_run_id = p_child_run_id
    OR p_places IS NULL OR cardinality(p_places) > 16 OR COALESCE(array_ndims(p_places), 1) <> 1
    OR EXISTS (SELECT 1 FROM unnest(p_places) AS place WHERE place IS NULL OR place !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,160}$')
    OR p_mode IS NULL OR p_mode NOT IN ('quick','thorough') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='DIG_LINK_INVALID';
  END IF;
  -- Both runs' locks, the lower id first, so two writers never wait on each other in a circle.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || LEAST(p_parent_run_id, p_child_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || GREATEST(p_parent_run_id, p_child_run_id)::text, 0));
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_parent_run_id)
    OR NOT identity.page_memory_run_owned(p_owner_ref, p_child_run_id) THEN
    RETURN 'NOT_OWNED';
  END IF;
  INSERT INTO identity.dig_link (child_run_id, owner_ref, parent_run_id, places, mode)
  VALUES (p_child_run_id, p_owner_ref, p_parent_run_id, p_places, p_mode)
  ON CONFLICT (child_run_id) DO NOTHING;
  SELECT link.parent_run_id INTO v_parent FROM identity.dig_link AS link WHERE link.child_run_id = p_child_run_id;
  RETURN CASE WHEN v_parent = p_parent_run_id THEN 'RECORDED' ELSE 'CONFLICT' END;
END;
$$;

-- 4b. Deleting one debate (R22 item 16) ----------------------------------------------------------------------------------
-- The person deletes one private debate (DELETE /v1/debates/:id: 0123's chain of 0040's per-run erasure), or 0126's
-- system erasure removes it: each run ends in a transaction that writes the run's serve.private_run_erasure_tombstone.
-- In that same transaction the API's erasure repository (debateai_erasure_runtime) calls this for the run: its visit
-- row (any account's, though only its owner's can exist) and every dig link where it is the parent or the child go, so
-- a dig started from a deleted debate keeps its own map but loses the link back. It acts only on an erased run: without
-- the tombstone it refuses 55000 PAGE_MEMORY_DEBATE_NOT_ERASED and deletes nothing. Returns how many rows went (0 when
-- asked again). Account erasure needs none of this: its rows cascade with identity."user".
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_page_memory(p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_visits integer;
  v_links integer;
BEGIN
  IF p_run_id IS NULL OR NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
      WHERE tombstone.run_id = p_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PAGE_MEMORY_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || p_run_id::text, 0));
  DELETE FROM identity.debate_last_visit AS visit WHERE visit.run_id = p_run_id;
  GET DIAGNOSTICS v_visits = ROW_COUNT;
  DELETE FROM identity.dig_link AS link WHERE link.parent_run_id = p_run_id OR link.child_run_id = p_run_id;
  GET DIAGNOSTICS v_links = ROW_COUNT;
  RETURN v_visits + v_links;
END;
$$;

-- 5. The export reader -------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate refuses a wrong worker or lease DATA_EXPORT_LEASE_INVALID): its level (or
-- null), its visits and its dig links. A visit's items leave as [{"item", "word"}] pairs, so the archive's key scan
-- (apps/api/src/data-export/archive.ts assertSafeKeys) only ever meets fixed key names, never a map id.
CREATE OR REPLACE FUNCTION identity.read_data_export_page_memory(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
    'page_reading_level', (SELECT jsonb_build_object('reading_level', level.reading_level, 'updated_at', level.updated_at)
      FROM identity.page_reading_level AS level WHERE level.owner_ref = v_owner_ref),
    'debate_visits', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', visit.run_id, 'seen_at', visit.seen_at,
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('item', entry.key, 'word', entry.value #>> '{}') ORDER BY entry.key)
          FROM jsonb_each(visit.items) AS entry), '[]'::jsonb))
        ORDER BY visit.seen_at, visit.run_id)
      FROM identity.debate_last_visit AS visit WHERE visit.owner_ref = v_owner_ref), '[]'::jsonb),
    'dig_links', COALESCE((SELECT jsonb_agg(jsonb_build_object('parent_run_id', link.parent_run_id,
        'child_run_id', link.child_run_id, 'places', to_jsonb(link.places), 'mode', link.mode, 'created_at', link.created_at)
        ORDER BY link.created_at, link.child_run_id)
      FROM identity.dig_link AS link WHERE link.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 6. One owner, then the grants ----------------------------------------------------------------------------------------
-- 0115 gave every export function one owner (0115:383-386); that owner reads identity."user" and core.run_ownership_event
-- (0115's snapshot) and may call 0128's lease gate, which it owns; it reads 0040's erasure tombstones (0115's snapshot
-- lists them). The three tables and nine functions take it too.
-- n1: reviewed gives only the three new tables and nine new functions 0115's export owner, as 0125 does; touches no earlier object
DO $page_memory_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.page_reading_level', 'identity.debate_last_visit', 'identity.dig_link'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.page_memory_run_owned(uuid,uuid)',
    'identity.read_page_reading_level(uuid)',
    'identity.save_page_reading_level(uuid,text)',
    'identity.read_debate_last_visit(uuid,uuid)',
    'identity.record_debate_last_visit(uuid,uuid,jsonb)',
    'identity.read_dig_links(uuid,uuid)',
    'identity.record_dig_link(uuid,uuid,uuid,text[],text)',
    'identity.forget_erased_debate_page_memory(uuid)',
    'identity.read_data_export_page_memory(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$page_memory_owner$;

-- No role reads or writes the tables directly: every access goes through the functions above.
REVOKE ALL ON identity.page_reading_level FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.debate_last_visit FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.dig_link FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.page_memory_run_owned(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_page_reading_level(uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.save_page_reading_level(uuid,text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_debate_last_visit(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_debate_last_visit(uuid,uuid,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_dig_links(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_dig_link(uuid,uuid,uuid,text[],text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_page_memory(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_page_memory(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.read_page_reading_level(uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.save_page_reading_level(uuid,text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_debate_last_visit(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.record_debate_last_visit(uuid,uuid,jsonb) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_dig_links(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.record_dig_link(uuid,uuid,uuid,text[],text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_page_memory(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_page_memory(uuid,uuid) TO debateai_data_export_worker;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0125's closing shape) ---------------------------------
DO $page_memory_contract$
DECLARE
  v_owner oid;
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.page_reading_level', 'identity.debate_last_visit', 'identity.dig_link'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = pg_catalog.to_regclass(v_name)) IS DISTINCT FROM v_owner
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal) THEN
      RAISE EXCEPTION 'V4_ACCOUNT_MEMORY_0130_CONTRACT tables %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'V4_ACCOUNT_MEMORY_0130_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.read_page_reading_level(uuid)', 'identity.save_page_reading_level(uuid,text)',
    'identity.read_debate_last_visit(uuid,uuid)', 'identity.record_debate_last_visit(uuid,uuid,jsonb)',
    'identity.read_dig_links(uuid,uuid)', 'identity.record_dig_link(uuid,uuid,uuid,text[],text)',
    'identity.forget_erased_debate_page_memory(uuid)', 'identity.read_data_export_page_memory(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'V4_ACCOUNT_MEMORY_0130_CONTRACT definers %', v_name;
    END IF;
    -- Exactly one of the six roles may call each: the export worker the reader, the erasure role §4b, the API's role the rest.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (v_role = CASE v_name
          WHEN 'identity.read_data_export_page_memory(uuid,uuid)' THEN 'debateai_data_export_worker'
          WHEN 'identity.forget_erased_debate_page_memory(uuid)' THEN 'debateai_erasure_runtime'
          ELSE 'debateai_billing_runtime' END) THEN
        RAISE EXCEPTION 'V4_ACCOUNT_MEMORY_0130_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.page_memory_run_owned(uuid,uuid)'::regprocedure)
      IS DISTINCT FROM v_owner
    OR pg_catalog.has_function_privilege('debateai_billing_runtime', 'identity.page_memory_run_owned(uuid,uuid)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_runtime', 'identity.page_memory_run_owned(uuid,uuid)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_erasure_runtime', 'identity.page_memory_run_owned(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'V4_ACCOUNT_MEMORY_0130_CONTRACT helper';
  END IF;
END
$page_memory_contract$;
