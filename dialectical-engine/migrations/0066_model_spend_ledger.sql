-- 0066 — security hardening 2026-09-01, package BUDGET (owner ruling V-28,
-- finding DL4-F2 of docs/missions/2026-09-01-security-hardening/findings/
-- delta-L4-runner-llm.md).
--
-- THE PERSISTED SPEND. Until this file the engine's run-wide bound counted
-- ATTEMPTS only: the sealed ceiling bounded the NUMBER of model calls and
-- nothing bounded the money, so a worst-case topology billing 2 748 attempts,
-- or a truncated answer retried at up to 3x its token bound, cost whatever the
-- vendor charged. V-28 rules two ceilings in money -- one per run, one per day
-- across the whole application -- and the daily one has to survive a restart and
-- be the SAME number for the API and for the runner, which are separate
-- processes. That is what this table is for.
--
-- Forward-only, and this file OWNS every object it creates. No landed migration
-- is edited: migrate() keys its ledger on the file name, so an edited applied
-- file is inert and a standalone replay of one silently restores the owner's
-- definition (the lesson 0063:20-39 records). Every statement is idempotent and
-- the whole file is replayable.
--
-- WHY A SUM AND NOT A COUNTER COLUMN. "The daily envelope needs a persisted
-- counter" is satisfied by these rows plus the index on `charged_on`: the
-- counter is `sum(charge_micros)` over one day. A separate counter row kept
-- beside the rows would be a SECOND source of truth that can drift from them --
-- silently, and in the direction that matters, since a drifted counter reads as
-- "there is still budget" -- and the rows are the record an operator reconciles
-- a vendor invoice against. One source of truth, two cheap indexes.
--
-- WHY MONEY IS bigint AND NOT numeric. Every amount is a whole number of USD
-- micro-units (1e-6 USD); no fraction of the unit exists, so there is nothing
-- for a scale to hold, and an integer sum is exact at any length. `numeric`
-- would invite a fractional charge, and a fractional charge is the beginning of
-- floating-point money.
--
-- WHY ONE TABLE FOR RUNS AND SUPPORT. V-28(2) rules a daily envelope "across
-- all runs and vendors" -- the whole application's model spend. `spend_source`
-- carries which surface a charge came from, and the daily sum takes every row.
-- This package writes the 'RUN' rows; the support chat's own per-message
-- accounting (support.message.cost_usd, migration 0054) stays exactly where task
-- 12 put it and is not duplicated here. The column exists so that wiring support
-- spend into the daily ceiling later is one INSERT at task 12's own seam and
-- needs no further migration.

CREATE TABLE IF NOT EXISTS ledger.model_spend (
  spend_id uuid PRIMARY KEY,
  -- Which surface spent it. 'RUN' is a debate; 'SUPPORT' is the help chat.
  spend_source text NOT NULL CHECK (spend_source IN ('RUN', 'SUPPORT')),
  -- The debate this charge belongs to. NULL only for support-chat spend, which
  -- has no run; the CHECK below makes a run charge without a run impossible.
  run_id uuid REFERENCES core.run(run_id),
  provider_ref text NOT NULL CHECK (length(btrim(provider_ref)) > 0),
  -- The UTC day the charge counts against. Stored rather than derived from
  -- `recorded_at` so the day a charge was BILLED to cannot move if a row is ever
  -- backfilled, and so the index below answers the daily question directly.
  charged_on date NOT NULL,
  -- USD micro-units, integer. Non-negative: a refund is not a model call.
  charge_micros bigint NOT NULL CHECK (charge_micros >= 0),
  -- What the vendor reported, kept beside the money so a charge can be checked
  -- against the price that produced it without re-reading the raw artifact.
  input_tokens bigint NOT NULL CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL CHECK (output_tokens >= 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT model_spend_run_charge_names_its_run
    CHECK (spend_source <> 'RUN' OR run_id IS NOT NULL)
);

-- The per-run envelope's question: everything this run has been charged.
CREATE INDEX IF NOT EXISTS model_spend_run_idx
  ON ledger.model_spend (run_id) WHERE run_id IS NOT NULL;

-- The daily envelope's question: everything the application spent that UTC day.
-- INCLUDE carries the summed column so the count is answered from the index.
CREATE INDEX IF NOT EXISTS model_spend_day_idx
  ON ledger.model_spend (charged_on) INCLUDE (charge_micros);

-- APPEND-ONLY, treatment (a) of 0065's table: a spend record is evidence of
-- money already gone, so UPDATE and DELETE are closed for every role, the owner
-- included, and TRUNCATE -- which fires no row trigger and which no privilege
-- stops for the owner -- is closed with the guard 0056 installed on 78 other
-- relations. Without the TRUNCATE guard a single statement would erase the only
-- record that a day's ceiling had been reached, and the next run would be
-- admitted as though the day were untouched.
SELECT core.install_truncate_guard('ledger.model_spend');

DROP TRIGGER IF EXISTS reject_mutation ON ledger.model_spend;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.model_spend
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The runner charges its calls and reads its own run's total; the API reads the
-- day's total before it admits a new ask. Both run as debateai_runtime. No
-- UPDATE and no DELETE are granted to anybody: the triggers above refuse them
-- regardless, and the absent grant says the same thing one layer earlier.
GRANT SELECT, INSERT ON ledger.model_spend TO debateai_runtime;
GRANT SELECT ON ledger.model_spend TO debateai_replay;

-- I1 (review round 2) — ADMISSION RESERVATIONS.
--
-- Reading the day's total and then deciding, with nothing in between, admits
-- every simultaneous ask: they all see the same low number, and each may then
-- spend a whole per-run ceiling. So an admitted ask RESERVES one per-run ceiling
-- against the day, and the read, the decision and the reservation happen inside
-- one transaction holding pg_advisory_xact_lock keyed on the day.
--
-- The reservation is NOT keyed on a run. The gate is asked BEFORE the run exists
-- — that is what "no new run starts" means — so it cannot be released when a run
-- ends. It EXPIRES instead, over a window long enough to cover admission
-- reaching its first charged call, which is exactly the race. That is what makes
-- the control self-healing: a run that dies at birth cannot wedge the day shut,
-- and nothing has to be deleted for the day to recover.
CREATE TABLE IF NOT EXISTS ledger.model_spend_reservation (
  reservation_id uuid PRIMARY KEY,
  reserved_on date NOT NULL,
  reserved_micros bigint NOT NULL CHECK (reserved_micros > 0),
  opened_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT model_spend_reservation_expires_after_open CHECK (expires_at > opened_at)
);

-- The admission query's own question: what is still live on this day.
CREATE INDEX IF NOT EXISTS model_spend_reservation_day_idx
  ON ledger.model_spend_reservation (reserved_on, expires_at) INCLUDE (reserved_micros);

-- Append-only, like the spend rows and for the same reason: an expired
-- reservation stops counting by its own timestamp, so nothing ever needs to
-- update or delete one, and a TRUNCATE would erase the evidence of a burst of
-- admissions at the moment it mattered most.
SELECT core.install_truncate_guard('ledger.model_spend_reservation');

DROP TRIGGER IF EXISTS reject_mutation ON ledger.model_spend_reservation;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.model_spend_reservation
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

GRANT SELECT, INSERT ON ledger.model_spend_reservation TO debateai_runtime;
GRANT SELECT ON ledger.model_spend_reservation TO debateai_replay;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (the shape 0065
-- ends with). A migration that creates a guard and does not verify it installed
-- is a guard nobody has seen work: both relations must carry BOTH triggers —
-- the TRUNCATE guard and the append-only refusal — or this file refuses to
-- finish, loudly, with the deployment unchanged.
DO $model_spend_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid=ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'core.reject_mutation()'::regprocedure
      ])
      AND trigger.tgrelid=ANY(ARRAY[
        'ledger.model_spend'::regclass,
        'ledger.model_spend_reservation'::regclass
      ])
  )<>4 THEN
    RAISE EXCEPTION 'MODEL_SPEND_APPEND_ONLY_GUARD_INVALID';
  END IF;
END
$model_spend_guard_contract$;
