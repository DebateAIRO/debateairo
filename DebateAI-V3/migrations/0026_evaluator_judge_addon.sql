-- The add-on grader is evaluator-scoped: its provider evidence intentionally has
-- ledger.raw_artifact.run_id = NULL. The graded judge artifact remains product-run
-- scoped, and maker inequality is enforced for every BLIND_JUDGE_GRADE insert.
CREATE OR REPLACE FUNCTION evaluator.reject_same_maker_addon()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  graded_maker text;
  grader_maker text;
  graded_run uuid;
  grader_run uuid;
BEGIN
  IF NEW.source_kind <> 'BLIND_JUDGE_GRADE' THEN
    RETURN NEW;
  END IF;
  SELECT maker, run_id INTO graded_maker, graded_run
    FROM ledger.raw_artifact WHERE raw_artifact_id=NEW.graded_raw_artifact_ref;
  SELECT maker, run_id INTO grader_maker, grader_run
    FROM ledger.raw_artifact WHERE raw_artifact_id=NEW.grader_raw_artifact_ref;
  IF graded_maker IS NULL OR grader_maker IS NULL
     OR graded_run IS DISTINCT FROM NEW.run_id
     OR grader_run IS NOT NULL THEN
    RAISE EXCEPTION 'ADDON_GRADING_LINEAGE_UNRESOLVED: run %', NEW.run_id;
  END IF;
  IF graded_maker = grader_maker THEN
    RAISE EXCEPTION 'PRODUCER_GRADING_FORBIDDEN: run % graded % grader %',
      NEW.run_id, graded_maker, grader_maker;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION evaluator.reject_same_maker_addon() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evaluator.reject_same_maker_addon()
  TO debateai_evaluator_worker;
