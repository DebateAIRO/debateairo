-- T16 (goal-v4 lines 80-96) · the schema half of "new sealed rows land via
-- MIGRATION + the deployment-register seeding path". The migration DECLARES
-- which rows a sealed register version must carry; the seeding paths supply the
-- values with their own deployment provenance.
--
-- Without this manifest a seeding path that silently forgets a row family seals
-- an incomplete register, and the omission only surfaces later at a consumer's
-- boot. register.assert_required_rows makes the omission fail loudly at seal
-- time, naming the family and the row key (DoD: "missing row fails loudly").

CREATE TABLE IF NOT EXISTS register.required_row (
  row_key text PRIMARY KEY CHECK (length(btrim(row_key)) > 0),
  row_family text NOT NULL CHECK (length(btrim(row_family)) > 0),
  introduced_in_version bigint NOT NULL CHECK (introduced_in_version > 0),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0)
);

INSERT INTO register.required_row (row_key, row_family, introduced_in_version, source_ref) VALUES
  ('globalStopDelta',          'stopping',       4, 'goal-v4-2026-09-01:80-96'),
  ('branchFreezeEpsilon',      'stopping',       4, 'goal-v4-2026-09-01:80-96'),
  ('verdictMarginGamma',       'verdictLabel',   4, 'goal-v4-2026-09-01:80-96'),
  ('verdictHighCut',           'verdictLabel',   4, 'goal-v4-2026-09-01:80-96'),
  ('verdictLowCut',            'verdictLabel',   4, 'goal-v4-2026-09-01:80-96'),
  ('disagreementThreshold',    'verdictLabel',   4, 'algorithm-live-loop-DECISIONS.md#J1'),
  ('disagreementQuantity',     'verdictLabel',   4, 'goal-v4-2026-09-01:80-96'),
  ('synthesizerRoleRef',       'synthesisRoles', 4, 'algorithm-live-loop-DECISIONS.md#J1'),
  ('evaluatorRoleRef',         'synthesisRoles', 4, 'algorithm-live-loop-DECISIONS.md#J1'),
  ('evaluatorLoopMaxRounds',   'synthesisRoles', 4, 'goal-v4-2026-09-01:80-96'),
  ('dispersionScale',          'panelWeighting', 4, 'algorithm-live-loop-DECISIONS.md#J1'),
  ('repeatedFamilyMultiplier', 'panelWeighting', 4, 'algorithm-live-loop-DECISIONS.md#J1'),
  ('downgradeBands',           'panelWeighting', 4, 'algorithm-live-loop-DECISIONS.md#J1'),
  ('providerFamilyMap',        'panelWeighting', 4, 'algorithm-live-loop-DECISIONS.md#J1'),
  ('envelopeFormulaInputs',    'envelope',       4, 'goal-v4-2026-09-01:285-295')
ON CONFLICT (row_key) DO NOTHING;

-- Raises for the FIRST missing mandatory row of the given register version,
-- naming its family and key. A version older than a row's introduction is
-- untouched, so the sealed bootstrap (version 1) stays valid.
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
  SELECT required.row_family, required.row_key INTO missing
  FROM register.required_row AS required
  WHERE required.introduced_in_version <= p_register_version
    AND NOT EXISTS (
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
GRANT SELECT ON register.required_row TO debateai_runtime, debateai_replay;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON register.required_row FROM PUBLIC, debateai_runtime;
