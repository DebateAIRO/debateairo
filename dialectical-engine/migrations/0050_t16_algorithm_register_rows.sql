-- T16 (goal-v4 lines 80-96) · the schema half of "new sealed rows land via
-- MIGRATION + the deployment-register seeding path". The migration DECLARES
-- which rows a sealed register version must carry, and WHICH versions carry
-- them; the seeding paths supply the values with their own deployment
-- provenance.
--
-- Sealed-version identity: the versions that existed at the base -- dev 4,
-- ceremony/bootstrap 1 -- are HISTORICAL and are deliberately absent from
-- register.required_row_version, so they stay valid untouched. The rows land in
-- newly minted versions: dev 5 and ceremony 2.
--
-- Without this manifest a seeding path that silently forgets a row family seals
-- an incomplete register, and the omission only surfaces later at a consumer's
-- boot. register.assert_required_rows makes the omission fail loudly at seal
-- time, naming the family and the row key (DoD: "missing row fails loudly").

CREATE TABLE IF NOT EXISTS register.required_row (
  row_key text PRIMARY KEY CHECK (length(btrim(row_key)) > 0),
  row_family text NOT NULL CHECK (length(btrim(row_family)) > 0),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0)
);

CREATE TABLE IF NOT EXISTS register.required_row_version (
  register_version bigint PRIMARY KEY CHECK (register_version > 0),
  profile text NOT NULL CHECK (length(btrim(profile)) > 0)
);

-- Each row cites the ruling that ACTUALLY chose its value. J1 rules exactly
-- five values; the two role identities are ruled by J8. A sealed row naming a
-- ruling that never mentioned its value is audit poison.
INSERT INTO register.required_row (row_key, row_family, source_ref) VALUES
  ('globalStopDelta',          'stopping',       'goal-v4-2026-09-01:80-96'),
  ('branchFreezeEpsilon',      'stopping',       'goal-v4-2026-09-01:80-96'),
  ('verdictMarginGamma',       'verdictLabel',   'goal-v4-2026-09-01:80-96'),
  ('verdictHighCut',           'verdictLabel',   'goal-v4-2026-09-01:80-96'),
  ('verdictLowCut',            'verdictLabel',   'goal-v4-2026-09-01:80-96'),
  ('disagreementThreshold',    'verdictLabel',   'algorithm-live-loop-DECISIONS.md#J1'),
  ('disagreementQuantity',     'verdictLabel',   'goal-v4-2026-09-01:80-96'),
  ('synthesizerRoleRef',       'synthesisRoles', 'algorithm-live-loop-DECISIONS.md#J8'),
  ('evaluatorRoleRef',         'synthesisRoles', 'algorithm-live-loop-DECISIONS.md#J8'),
  ('evaluatorLoopMaxRounds',   'synthesisRoles', 'goal-v4-2026-09-01:80-96'),
  ('dispersionScale',          'panelWeighting', 'algorithm-live-loop-DECISIONS.md#J1'),
  ('repeatedFamilyMultiplier', 'panelWeighting', 'algorithm-live-loop-DECISIONS.md#J1'),
  ('downgradeBands',           'panelWeighting', 'algorithm-live-loop-DECISIONS.md#J1'),
  ('providerFamilyMap',        'panelWeighting', 'algorithm-live-loop-DECISIONS.md#J1'),
  ('envelopeFormulaInputs',    'envelope',       'goal-v4-2026-09-01:285-295')
ON CONFLICT (row_key) DO NOTHING;

INSERT INTO register.required_row_version (register_version, profile) VALUES
  (5, 'development'),
  (2, 'acceptance')
ON CONFLICT (register_version) DO NOTHING;

-- Raises for the FIRST missing mandatory row of a version that is declared to
-- carry them, naming its family and key. A version absent from
-- register.required_row_version is historical and is left alone, so the sealed
-- bootstrap (1) and the sealed dev register (4) remain valid.
CREATE OR REPLACE FUNCTION register.assert_required_rows(p_register_version bigint)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $$
DECLARE missing record;
BEGIN
  IF p_register_version IS NULL OR p_register_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='REGISTER_REQUIRED_ROW_VERSION_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM register.required_row_version AS declared
    WHERE declared.register_version = p_register_version
  ) THEN
    RETURN;
  END IF;
  SELECT required.row_family, required.row_key INTO missing
  FROM register.required_row AS required
  WHERE NOT EXISTS (
      SELECT 1 FROM register.register_row AS present
      WHERE present.register_version = p_register_version
        AND present.row_key = required.row_key
    )
  ORDER BY required.row_family, required.row_key
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE='22023',
      MESSAGE='REGISTER_REQUIRED_ROW_MISSING:' || missing.row_family || ':' || missing.row_key;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION register.assert_required_rows(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register.assert_required_rows(bigint) TO debateai_runtime;
GRANT SELECT ON register.required_row, register.required_row_version
  TO debateai_runtime, debateai_replay;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON register.required_row, register.required_row_version
  FROM PUBLIC, debateai_runtime;
