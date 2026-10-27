-- 0125 · The Italy-specific approval (mission italy-clause-approval, slice S01; Italian Civil Code arts. 1341-1342).
-- docs/missions/italy-clause-approval/slices/S01/PLAN.md steps P05-P07 (R12, R13).
--
-- A sign-up placed in Italy (the picked region is IT, or the request IP resolves to IT) ticks a second box that approves
-- Terms clauses 11, 12, 14, 15 and 18 specifically, and the acceptance record keeps that approval as its own row, kind
-- ITALY_SPECIFIC_APPROVAL, beside the account's ADULT, PRIVACY_SHOWN and TERMS rows. This file is the database half:
--   §1 two nullable columns on legal.acceptance: clauses smallint[] (the clauses approved, in the order shown) and leg
--      text (which test placed the account in Italy: PICKED, IP or BOTH);
--   §2 acceptance_kind_check (0080's inline CHECK) widened with the new kind;
--   §3 acceptance_document_version_shape (0080) widened so the new kind carries the Terms' N.M version;
--   §4 acceptance_italy_fields: the two columns are set exactly on the new kind, to the one clause list and a known leg;
--   §5 identity.record_signup_italy_approval(uuid,jsonb): the sign-up writer, for the API's role, inside the sign-up
--      transaction; the row's document, version, digest, locale and time are the account's own TERMS row's;
--   §6 identity.read_data_export_snapshot_v2(uuid,uuid): 0115's export snapshot with clauses and leg on every
--      acceptance, for the export worker; 0115's reader is called, not replaced, so it keeps its lease check;
--   §7 the closing block: the contract this file claims, checked rather than assumed.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: two nullable columns with no default, two CHECKs widened and one added NOT VALID,
--                   two new functions; the release before writes only kinds both CHECK versions accept and neither
--                   new column, so it keeps running beside it.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-111.sql (0111's,
--                   migrations/lineage/README.md step 3) stays in force and the manifest names it.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: this file replaces no function another migration defines. 0115's
-- identity.read_data_export_snapshot is frozen; the export reads the new columns through a new function that calls it.
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): ADD COLUMN IF NOT EXISTS, each
-- CHECK dropped IF EXISTS before it is added, CREATE OR REPLACE FUNCTION of names no earlier migration defines.

-- 1. The two columns ------------------------------------------------------------------
-- Nullable, no default: the release before inserts rows without them, and no existing row is rewritten.
ALTER TABLE legal.acceptance ADD COLUMN IF NOT EXISTS clauses smallint[];
ALTER TABLE legal.acceptance ADD COLUMN IF NOT EXISTS leg text;

-- 2. The kind list ----------------------------------------------------------------------
-- 0080:47's inline CHECK carries the default name acceptance_kind_check (as 0111:233 dropped acceptance_surface_check).
-- NOT VALID: the rows already there met the narrower list; new rows meet this one.
-- n1: reviewed widens the kind list; every kind the release before writes stays accepted
ALTER TABLE legal.acceptance DROP CONSTRAINT IF EXISTS acceptance_kind_check;
ALTER TABLE legal.acceptance ADD CONSTRAINT acceptance_kind_check CHECK (kind IN ('TERMS','PRIVACY_SHOWN','RENEWAL_TERMS','IMMEDIATE_START','ADULT','ITALY_SPECIFIC_APPROVAL')) NOT VALID;

-- 3. The version shape --------------------------------------------------------------------
-- The approval belongs to the Terms the account accepted, so it carries their `Version N.M`. The second disjunct is
-- 0080:62-63's, unchanged.
-- n1: reviewed widens the version shape to the new kind; every row the release before writes stays accepted
ALTER TABLE legal.acceptance DROP CONSTRAINT IF EXISTS acceptance_document_version_shape;
ALTER TABLE legal.acceptance ADD CONSTRAINT acceptance_document_version_shape CHECK (
  (kind IN ('TERMS','PRIVACY_SHOWN','ADULT','ITALY_SPECIFIC_APPROVAL') AND document_version ~ '^[0-9]{1,4}\.[0-9]{1,4}$')
  OR (kind IN ('RENEWAL_TERMS','IMMEDIATE_START')
    AND document_version = 'sha256-' || left(document_sha256::text, 12))
) NOT VALID;

-- 4. The two columns belong to the new kind -----------------------------------------------------
-- Null-safe (ADR-0003 rule 3): every conjunct on a new column is guarded by its IS NOT NULL, so no operand reaches the
-- CHECK as NULL and an Italy row without its list or leg is refused, never let through as unknown.
-- n1: reviewed a new restriction on the two new columns; the release before writes neither
ALTER TABLE legal.acceptance DROP CONSTRAINT IF EXISTS acceptance_italy_fields;
ALTER TABLE legal.acceptance ADD CONSTRAINT acceptance_italy_fields CHECK ((kind = 'ITALY_SPECIFIC_APPROVAL' AND clauses IS NOT NULL AND clauses = ARRAY[11,12,14,15,18]::smallint[] AND leg IS NOT NULL AND leg IN ('PICKED','IP','BOTH')) OR (kind <> 'ITALY_SPECIFIC_APPROVAL' AND clauses IS NULL AND leg IS NULL)) NOT VALID;

-- 5. The sign-up writer --------------------------------------------------------------------------
-- Called by the API inside the sign-up transaction, after the account and its three sign-up rows (0096's
-- create_pending_account_reserved_with_consent). p_row's keys: acceptance_id (uuid text), clauses (a JSON array of
-- integers), leg (text), evidence_ciphertext (base64: {ip, user_agent} under the records key, 0080's layout) and key_id
-- (16 hex). Refusals, in order, each 22023:
--   ITALY_APPROVAL_INVALID          no user id, or p_row is not a JSON object;
--   ITALY_APPROVAL_ACCOUNT_INVALID  no account with that id in a sign-up state (pending_verification, pending_mfa);
--   ITALY_APPROVAL_TERMS_MISSING    the account does not hold exactly one sign-up TERMS row;
--   ITALY_APPROVAL_DUPLICATE        the account already holds an approval.
-- Then one row. The table's CHECKs refuse a wrong list or leg (23514, acceptance_italy_fields).
CREATE OR REPLACE FUNCTION identity.record_signup_italy_approval(p_user_id uuid, p_row jsonb) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner_ref uuid;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_row) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ITALY_APPROVAL_INVALID';
  END IF;
  SELECT identity_user.owner_ref INTO v_owner_ref
  FROM identity."user" AS identity_user
  WHERE identity_user.user_id = p_user_id AND identity_user.state IN ('pending_verification','pending_mfa');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ITALY_APPROVAL_ACCOUNT_INVALID';
  END IF;
  IF (SELECT count(*) FROM legal.acceptance AS terms
      WHERE terms.owner_ref = v_owner_ref AND terms.kind = 'TERMS' AND terms.surface = 'SIGN_UP') <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ITALY_APPROVAL_TERMS_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM legal.acceptance AS approval
      WHERE approval.owner_ref = v_owner_ref AND approval.kind = 'ITALY_SPECIFIC_APPROVAL') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ITALY_APPROVAL_DUPLICATE';
  END IF;
  INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id,clauses,leg)
  SELECT (p_row->>'acceptance_id')::uuid, terms.owner_ref, 'ITALY_SPECIFIC_APPROVAL', terms.document_version,
    terms.document_sha256, terms.locale, 'SIGN_UP', terms.accepted_at, decode(p_row->>'evidence_ciphertext','base64'),
    p_row->>'key_id',
    (SELECT array_agg(clause.value::smallint ORDER BY clause.ordinality)
      FROM jsonb_array_elements(p_row->'clauses') WITH ORDINALITY AS clause(value, ordinality)),
    p_row->>'leg'
  FROM legal.acceptance AS terms
  WHERE terms.owner_ref = v_owner_ref AND terms.kind = 'TERMS' AND terms.surface = 'SIGN_UP';
END;
$$;

-- The API's sign-up principal alone, as record_registration_region (0095_registration_region.sql:48-50).
REVOKE ALL ON FUNCTION identity.record_signup_italy_approval(uuid,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.record_signup_italy_approval(uuid,jsonb) TO debateai_billing_runtime;

-- 6. The export reader ---------------------------------------------------------------------------
-- 0115's snapshot, whole (its lease check included: a wrong worker or lease is refused DATA_EXPORT_LEASE_INVALID by it),
-- with clauses and leg added to every legal_acceptances element in v1's order (null on the rows of other kinds).
CREATE OR REPLACE FUNCTION identity.read_data_export_snapshot_v2(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v jsonb;
BEGIN
  v := identity.read_data_export_snapshot(p_export_id, p_worker);
  RETURN jsonb_set(v, '{legal_acceptances}', COALESCE((SELECT jsonb_agg(item.value || jsonb_build_object('clauses', to_jsonb(a.clauses), 'leg', to_jsonb(a.leg)) ORDER BY item.ordinality) FROM jsonb_array_elements(v->'legal_acceptances') WITH ORDINALITY AS item(value, ordinality) LEFT JOIN legal.acceptance a ON a.acceptance_id = (item.value->>'acceptance_id')::uuid), '[]'::jsonb));
END;
$$;

-- 0115 gave every export function one owner (0115:383-386), the owner of identity.read_email_settings; the wrapper takes
-- the same owner, so it may call the frozen reader and read legal.acceptance as that reader does.
-- n1: reviewed sets the new function's owner to the export functions' owner (0115:383-386); touches no earlier object
DO $italy_approval_owner$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_data_export_snapshot_v2(uuid,uuid) OWNER TO %I', v_owner);
END
$italy_approval_owner$;
REVOKE ALL ON FUNCTION identity.read_data_export_snapshot_v2(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.read_data_export_snapshot_v2(uuid,uuid) TO debateai_data_export_worker;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0124's closing shape) -------------------------------------
DO $italy_approval_contract$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = 'legal.acceptance'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND ((a.attname = 'clauses' AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'smallint[]')
          OR (a.attname = 'leg' AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'))) <> 2 THEN
    RAISE EXCEPTION 'ITALY_APPROVAL_0125_CONTRACT columns';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS k
      WHERE k.conrelid = 'legal.acceptance'::regclass AND k.contype = 'c'
        AND k.conname IN ('acceptance_kind_check', 'acceptance_document_version_shape', 'acceptance_italy_fields')
        AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(k.oid), 'ITALY_SPECIFIC_APPROVAL') > 0) <> 3 THEN
    RAISE EXCEPTION 'ITALY_APPROVAL_0125_CONTRACT constraints';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS p
      WHERE p.oid IN ('identity.record_signup_italy_approval(uuid,jsonb)'::regprocedure,
          'identity.read_data_export_snapshot_v2(uuid,uuid)'::regprocedure)
        AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[]) <> 2 THEN
    RAISE EXCEPTION 'ITALY_APPROVAL_0125_CONTRACT definers';
  END IF;
  IF NOT pg_catalog.has_function_privilege('debateai_billing_runtime', 'identity.record_signup_italy_approval(uuid,jsonb)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_data_export_worker', 'identity.read_data_export_snapshot_v2(uuid,uuid)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_runtime', 'identity.record_signup_italy_approval(uuid,jsonb)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_authorization_runtime', 'identity.record_signup_italy_approval(uuid,jsonb)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_data_export_worker', 'identity.record_signup_italy_approval(uuid,jsonb)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_billing_runtime', 'identity.read_data_export_snapshot_v2(uuid,uuid)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_runtime', 'identity.read_data_export_snapshot_v2(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ITALY_APPROVAL_0125_CONTRACT privileges';
  END IF;
  IF (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot_v2(uuid,uuid)'::regprocedure)
    IS DISTINCT FROM (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'ITALY_APPROVAL_0125_CONTRACT owner';
  END IF;
END
$italy_approval_contract$;
