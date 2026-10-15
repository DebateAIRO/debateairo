-- 0118 · The fast language check's site cost (question-language spec 2026-10-13; plan P2L Task 19).
-- One short call made before a debate exists: a SITE cost in the day's pot, never a run's and never a person's.
--
-- The day's pot is ledger.model_spend summed by charged_on (0066's model_spend_day_idx, readDaySpentMicros). This
-- step widens 0074's source list by exactly LANGUAGE_CHECK, keeps such a row run-, phase- and attempt-less, and adds ONE
-- writer: a SECURITY DEFINER function the API's runtime role may execute (pre-flight PF-L58, option (a): the
-- application's direct INSERT, PostgresModelSpendStore.recordSpend, refuses the source). The function runs as
-- debateai_staff_security_owner, the NOLOGIN role 0093 and 0107 gave column INSERT on ledger.model_spend for their
-- own spend writers, so it holds no right of the migration owner. No question text reaches this row: the provider
-- reference is a code (language-check:<provider>:<model>) and the rest are a day, money and two token counts.
-- 0066's append-only guards (reject_mutation, the TRUNCATE guard) are untouched; one INSERT guard is added below.
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): each CHECK is dropped IF EXISTS
-- before it is added (0074's form for the same constraint), each function is CREATE OR REPLACE of a name no earlier
-- migration defines (on its one application it replaces nothing), and the trigger is dropped IF EXISTS first.
-- One ALTER TABLE, so ledger.model_spend is scanned once for both CHECKs.
ALTER TABLE ledger.model_spend
  DROP CONSTRAINT IF EXISTS model_spend_spend_source_check,
  ADD CONSTRAINT model_spend_spend_source_check CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK')),
  DROP CONSTRAINT IF EXISTS model_spend_language_check_is_runless,
  ADD CONSTRAINT model_spend_language_check_is_runless
    CHECK (spend_source <> 'LANGUAGE_CHECK' OR (run_id IS NULL AND spend_phase IS NULL AND attempt_id IS NULL));

-- The one writer. It refuses (23514, check_violation) a day outside UTC today +-1 (a check is recorded right after its
-- call; a clock that far off is a fault, not a cost to book on another day) and a provider reference that is not the
-- code shape language-check:<provider>:<model>, so no free text can reach the ledger through it.
CREATE OR REPLACE FUNCTION ledger.record_language_check_spend(
  p_spend_id uuid, p_provider_ref text, p_charged_on date, p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_charged_on IS NULL OR p_charged_on < v_today - 1 OR p_charged_on > v_today + 1
    OR p_provider_ref IS NULL OR p_provider_ref !~ '^language-check:[a-z0-9-]+:[A-Za-z0-9._/-]{1,128}$' THEN
    RAISE EXCEPTION 'LANGUAGE_CHECK_SPEND_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, attempt_id)
  VALUES (p_spend_id, 'LANGUAGE_CHECK', NULL, p_provider_ref, p_charged_on, p_charge_micros, p_input_tokens, p_output_tokens, NULL, NULL);
END
$$;
ALTER FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) TO debateai_runtime;

-- Option (a) held IN THE DATABASE, not only in TypeScript: a LANGUAGE_CHECK row is refused (42501) unless the role
-- inserting it is the writer's owner, which only the SECURITY DEFINER writer above runs as. debateai_runtime keeps
-- 0066's table INSERT for its other sources; a raw INSERT of this source by it, or by anyone, is refused here. The
-- guard is SECURITY INVOKER on purpose: current_user is the inserting role (the owner inside the writer).
CREATE OR REPLACE FUNCTION ledger.refuse_language_check_spend_outside_writer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user)
    IS DISTINCT FROM (SELECT p.proowner FROM pg_catalog.pg_proc AS p
      WHERE p.oid = pg_catalog.to_regprocedure('ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)')) THEN
    RAISE EXCEPTION 'LANGUAGE_CHECK_SPEND_WRITER_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION ledger.refuse_language_check_spend_outside_writer() FROM PUBLIC;
DROP TRIGGER IF EXISTS language_check_spend_writer_only ON ledger.model_spend;
CREATE TRIGGER language_check_spend_writer_only BEFORE INSERT ON ledger.model_spend
  FOR EACH ROW WHEN (NEW.spend_source = 'LANGUAGE_CHECK') EXECUTE FUNCTION ledger.refuse_language_check_spend_outside_writer();

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
