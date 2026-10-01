-- 0083 — the budget spec 2026-09-28 "A debate is (almost) never stopped for
-- money" (§2.6 holds, §2.7 the waiting line, §2.9 the owner record of cheaper
-- models), amended by the paid-plans spec 2026-09-29 §2.4. The spec named this
-- file 0077; dev's age gate took 0077, 0078 is the sensitive-data consent,
-- 0079 the change-email turn, 0080 is legal acceptance, and 0081 and 0082 are
-- dev's publication check record, so the budget's file is 0083.
--
-- Forward-only, idempotent and replayable, and this file OWNS every object it
-- creates. It also re-creates 0076's two stop CHECKs on serve.serve_disclosure
-- (the one change to an older object, at the end). Every new table is
-- APPEND-ONLY with the 0066 treatment: the truncate guard, the statement-level
-- reject_mutation trigger, grants of SELECT and INSERT only, and a closing
-- block that verifies both triggers are installed. Every grant is to
-- debateai_runtime alone: the API's DATABASE_URL role, which writes the holds
-- and the line, and the runner's.
--
-- CONTENT-FREE, and NO OWNER COLUMN on any of them: a run's owner is always read
-- through core.run_ownership_event, so account erasure (0040), which destroys
-- keys, deletes the account row and never deletes a core.run row, needs no new
-- path. A waiting run whose private content is no longer live, or whose owner
-- has no active account (suspended, age-frozen by 0077, or erased), simply
-- leaves the line (the view below).

-- THE HOLD (§2.6). Written once, when a run starts, in the advisory-locked
-- transaction that decided it. Nothing ever releases it: it counts its unspent
-- part while its run has a READY or CLAIMED job, so a run that dies at birth
-- cannot wedge a day shut — the property 0066's expiring reservation gave.
CREATE TABLE IF NOT EXISTS ledger.model_spend_hold (
  hold_id uuid PRIMARY KEY,
  run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  held_micros bigint NOT NULL CHECK (held_micros > 0),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The holds are counted from the live jobs outward: this partial index answers
-- "which runs still have a READY or CLAIMED job" without reading history.
CREATE INDEX IF NOT EXISTS work_item_live_run_idx
  ON core.work_item (run_id) WHERE state IN ('READY','CLAIMED');

-- THE WAITING LINE (§2.7). A waiting run has its run row, its memory question
-- and its pinned panel, and NO first job; the waker writes run_wait_start when
-- it starts it, in the same locked transaction as its hold.
CREATE TABLE IF NOT EXISTS core.run_wait (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  waiting_since timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS run_wait_since_idx ON core.run_wait (waiting_since, run_id);

CREATE TABLE IF NOT EXISTS core.run_wait_start (
  run_id uuid PRIMARY KEY REFERENCES core.run_wait(run_id),
  started_at timestamptz NOT NULL
);

-- WHY A RUN WAITS (budget spec §2.3 rule 1: "a run waiting only because its own
-- person's allowance is full never holds anyone else back"). Appended in the
-- transaction that made the run wait, and again by the waker whenever it finds
-- the reason changed; the line reads the LATEST row. SITE: it waits for the
-- site's day or for the line. PERSON: its own person's window is full, and
-- person_recheck_at is the earliest instant that block can lift by itself (the
-- latest reset among the windows full on spend alone, or the next tick when only
-- the person's own live holds fill them). evaluated_at is the deciding process's
-- clock (the instant the room measured at); recorded_at is the database's, so
-- "an entitlement event recorded after this reason" compares like with like.
-- A word and an instant: no figure, no owner, no content.
CREATE TABLE IF NOT EXISTS core.run_wait_reason (
  reason_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run_wait(run_id),
  evaluated_at timestamptz NOT NULL,
  waits_for text NOT NULL CHECK (waits_for IN ('SITE', 'PERSON')),
  person_recheck_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT run_wait_reason_names_its_recheck
    CHECK ((waits_for = 'PERSON') = (person_recheck_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS run_wait_reason_latest_idx
  ON core.run_wait_reason (run_id, recorded_at DESC, reason_id DESC);

-- THE OWNER RECORD OF CHEAPER MODELS (§2.9). Written only through
-- RunCostSubstitutionRepository (packages/db/src/run-cost-substitution.ts),
-- by the interim coarse fit and by the runner; shown only in the operator's run
-- report, never in any verdict, story, PDF or public page.
CREATE TABLE IF NOT EXISTS core.run_cost_substitution (
  substitution_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  call_site_key text NOT NULL CHECK (length(btrim(call_site_key)) > 0),
  planned_provider_ref text NOT NULL CHECK (length(btrim(planned_provider_ref)) > 0),
  used_provider_ref text NOT NULL CHECK (length(btrim(used_provider_ref)) > 0),
  reason text NOT NULL CHECK (reason IN ('RUN_ARGUING','RUN_FIRST_CALL','SITE_DAY','PERSON')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT run_cost_substitution_changes_the_model CHECK (planned_provider_ref <> used_provider_ref)
);
CREATE INDEX IF NOT EXISTS run_cost_substitution_run_idx
  ON core.run_cost_substitution (run_id, recorded_at);

SELECT core.install_truncate_guard('ledger.model_spend_hold');
SELECT core.install_truncate_guard('core.run_wait');
SELECT core.install_truncate_guard('core.run_wait_start');
SELECT core.install_truncate_guard('core.run_wait_reason');
SELECT core.install_truncate_guard('core.run_cost_substitution');

DROP TRIGGER IF EXISTS reject_mutation ON ledger.model_spend_hold;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.model_spend_hold
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.run_wait;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_wait
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.run_wait_start;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_wait_start
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.run_wait_reason;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_wait_reason
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.run_cost_substitution;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_cost_substitution
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- THE LINE AS IT IS READ: waiting = a wait row, no start row, no FAILED job
-- (a run whose setup failed has left the line), content that is still live for
-- an encrypted run, and — for an owner's run, encrypted or not — an account row
-- that is still active (erasure deletes it; a run of a suspended account, or of
-- one the age interstitial froze — 0077's 'age_frozen' — rests until the account
-- is active again). The owner is the latest ownership event, else the
-- 'owner:' asker id; a run with neither is a legacy asker's. Each run carries
-- its LATEST reason (null only for a row written before any reason). The model
-- count is the panel's length: the same count the ask side takes from the
-- plan's roster (B2). The view reads identity."user" with its owner's rights.
CREATE OR REPLACE VIEW core.run_waiting_v AS
SELECT wait.run_id,
       wait.waiting_since,
       run_owner.owner_ref,
       CASE WHEN run_owner.owner_ref IS NULL THEN run.asker_id END AS legacy_asker_id,
       run.plan_tier,
       run.composition_budget_tier,
       COALESCE((run.depth_params->>'depth')::integer, 1) AS depth,
       jsonb_array_length(run.discovered_panel) AS maker_count,
       reason.waits_for,
       reason.person_recheck_at,
       reason.evaluated_at AS reason_at,
       reason.recorded_at AS reason_recorded_at
FROM core.run_wait AS wait
JOIN core.run AS run ON run.run_id = wait.run_id
LEFT JOIN LATERAL (
  SELECT event.owner_ref
  FROM core.run_ownership_event AS event
  WHERE event.run_id = wait.run_id
  ORDER BY event.at_seq DESC
  LIMIT 1
) AS latest ON true
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN latest.owner_ref IS NOT NULL THEN latest.owner_ref
           WHEN run.asker_id LIKE 'owner:%' THEN substr(run.asker_id, 7)::uuid
         END AS owner_ref
) AS run_owner
LEFT JOIN LATERAL (
  SELECT recorded.waits_for, recorded.person_recheck_at, recorded.evaluated_at, recorded.recorded_at
  FROM core.run_wait_reason AS recorded
  WHERE recorded.run_id = wait.run_id
  ORDER BY recorded.recorded_at DESC, recorded.reason_id DESC
  LIMIT 1
) AS reason ON true
WHERE NOT EXISTS (SELECT 1 FROM core.run_wait_start AS started WHERE started.run_id = wait.run_id)
  AND NOT EXISTS (
    SELECT 1 FROM core.work_item AS work WHERE work.run_id = wait.run_id AND work.state = 'FAILED'
  )
  AND (run.content_encryption_version IS DISTINCT FROM 1
    OR core.run_private_content_is_live(wait.run_id))
  AND (run_owner.owner_ref IS NULL OR EXISTS (
    SELECT 1 FROM identity."user" AS account
    WHERE account.owner_ref = run_owner.owner_ref AND account.state = 'active'
  ));

GRANT SELECT, INSERT ON ledger.model_spend_hold TO debateai_runtime;
GRANT SELECT, INSERT ON core.run_wait, core.run_wait_start, core.run_wait_reason, core.run_cost_substitution TO debateai_runtime;
GRANT SELECT ON core.run_waiting_v TO debateai_runtime;

DO $budget_holds_guard_contract$
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
        'ledger.model_spend_hold'::regclass,
        'core.run_wait'::regclass,
        'core.run_wait_start'::regclass,
        'core.run_wait_reason'::regclass,
        'core.run_cost_substitution'::regclass
      ])
  )<>10 THEN
    RAISE EXCEPTION 'BUDGET_HOLDS_APPEND_ONLY_GUARD_INVALID';
  END IF;
END
$budget_holds_guard_contract$;

-- THE PERSON'S ALLOWANCE AS A STOP (budget spec §2.9, paid-plans spec §2.4.1).
-- A running debate can now be stopped by its owner's window (stop kind
-- ALLOWANCE, written by the runner). 0076's two stop CHECKs listed the kinds of
-- their day, and a CHECK that refused the new one would lose the whole
-- disclosure row. PostgreSQL named 0076's inline column CHECKs
-- serve_disclosure_body_stop_check / serve_disclosure_serve_stop_check; each is
-- dropped IF EXISTS and re-created, so a replay changes nothing.
ALTER TABLE serve.serve_disclosure DROP CONSTRAINT IF EXISTS serve_disclosure_body_stop_check;
ALTER TABLE serve.serve_disclosure ADD CONSTRAINT serve_disclosure_body_stop_check
  CHECK (body_stop IS NULL OR body_stop IN ('MONEY', 'ATTEMPTS', 'USAGE', 'DAILY', 'ALLOWANCE'));
ALTER TABLE serve.serve_disclosure DROP CONSTRAINT IF EXISTS serve_disclosure_serve_stop_check;
ALTER TABLE serve.serve_disclosure ADD CONSTRAINT serve_disclosure_serve_stop_check
  CHECK (serve_stop IS NULL OR serve_stop IN ('MONEY', 'ATTEMPTS', 'USAGE', 'DAILY', 'ALLOWANCE', 'TRANSPORT_DEATH', 'NO_ARTIFACT'));
