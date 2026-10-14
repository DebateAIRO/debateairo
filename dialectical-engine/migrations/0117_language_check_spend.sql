-- 0117 · The fast language check's site cost (question-language spec 2026-10-13; plan P2L Task 19).
-- One short call made before a debate exists: a SITE cost in the day's pot, never a run's and never a person's.
--
-- The day's pot is ledger.model_spend summed by charged_on (0066's model_spend_day_idx, readDaySpentMicros). This
-- step widens 0074's source list by exactly LANGUAGE_CHECK, keeps such a row run-less and phase-less, and adds ONE
-- writer: a SECURITY DEFINER function the API's runtime role may execute (pre-flight PF-L58, option (a): the
-- application's direct INSERT, PostgresModelSpendStore.recordSpend, refuses the source). The function runs as
-- debateai_staff_security_owner, the NOLOGIN role 0093 and 0107 gave column INSERT on ledger.model_spend for their
-- own spend writers, so it holds no right of the migration owner. No question text reaches this row: the provider
-- reference is a code (language-check:<provider>:<model>) and the rest are a day, money and two token counts.
-- 0066's append-only guards (reject_mutation, the TRUNCATE guard) are untouched: the CHECKs change, not the triggers.
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): each CHECK is dropped IF EXISTS
-- before it is added (0074's form for the same constraint), and the writer is CREATE OR REPLACE of a name no earlier
-- migration defines, so on its one application it replaces nothing.
ALTER TABLE ledger.model_spend
  DROP CONSTRAINT IF EXISTS model_spend_spend_source_check,
  ADD CONSTRAINT model_spend_spend_source_check CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK'));
ALTER TABLE ledger.model_spend
  DROP CONSTRAINT IF EXISTS model_spend_language_check_is_runless,
  ADD CONSTRAINT model_spend_language_check_is_runless CHECK (spend_source <> 'LANGUAGE_CHECK' OR (run_id IS NULL AND spend_phase IS NULL));

CREATE OR REPLACE FUNCTION ledger.record_language_check_spend(
  p_spend_id uuid, p_provider_ref text, p_charged_on date, p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint
) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, attempt_id)
  VALUES (p_spend_id, 'LANGUAGE_CHECK', NULL, p_provider_ref, p_charged_on, p_charge_micros, p_input_tokens, p_output_tokens, NULL, NULL);
$$;
ALTER FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) TO debateai_runtime;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0075's closing shape): 0066's append-only guards are
-- still installed and enabled on ledger.model_spend after these ALTERs, or the migration refuses.
DO $language_check_spend_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid = 'ledger.model_spend'::regclass
      AND trigger.tgfoid = ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'core.reject_mutation()'::regprocedure
      ])
  ) <> 2 THEN
    RAISE EXCEPTION 'LANGUAGE_CHECK_SPEND_GUARD_CONTRACT_INVALID';
  END IF;
END
$language_check_spend_guard_contract$;
