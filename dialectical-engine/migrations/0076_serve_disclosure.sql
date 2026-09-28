-- 0076 — the engine money rule's owner-side disclosure row
-- (docs/superpowers/specs/2026-09-26-verdict-story-design.md §14.4.5, Task M3).
--
-- serve.serve_disclosure holds ONE row per served answer version: which makers
-- were PLANNED for the answer-writer and the checker, which ones actually wrote
-- and checked the round the answer serves, whether a cheaper maker was used and
-- why, whether both roles ended on one maker (R9: DEGRADED-DIVERSITY is derived
-- from the SEALED refs, so a fallback onto one maker is recorded here instead),
-- the stop that cut the arguing short and the points it left without a
-- cross-review, and what cut the answer-writing loop short. The digest columns
-- are filled by Task M4 and the floor columns by Task M5; this file only
-- creates them.
--
-- AMENDED IN PLACE (M3 review polish, 2026-09-27), before it ever shipped: the
-- serve_stop column and the 256-character ref CHECKs were added to the CREATE
-- TABLE itself. Every database that applied the first text of this file was an
-- embedded test database, created in a temporary directory and deleted when its
-- suite stopped; no persistent database applied it. migrate() keys on the file
-- name, so a database that had applied the first text would never re-apply this
-- one anyway.
--
-- It exists because the sealed serve file (packages/serve/src/index.ts) has no
-- place for a new disclosure: the answer and its marks are sealed. The runner
-- writes this row AFTER the sealed persist, for every answer — served, or
-- components-only with the facts known — and a failure to write it never
-- changes the answer.
--
-- CONTENT-FREE: provider refs, codes, counts and one node id. No debate or model
-- text, so it is NOT a content carrier (0063's mechanism does not apply: no
-- envelope, no attestation, no erasure barrier), exactly like
-- serve.synthesis_round (0057), which records the same kind of facts per round.
--
-- ERASURE follows the answer's own path. An account erasure never deletes a
-- serve.answer row (0000 closed UPDATE and DELETE on it for every role); it
-- destroys the run's keys, so the answer's content becomes unreadable while its
-- structure stays. This row carries no content to destroy, so it stays with its
-- answer, as serve.synthesis_round does.
--
-- APPEND-ONLY, 0074's treatment: insert-once per (answer_id, answer_version);
-- UPDATE and DELETE closed by core.reject_mutation() for every role, the owner
-- included; TRUNCATE closed by core.install_truncate_guard. The answer key is
-- answer_story's: the composite (answer_id, answer_version) that serve.answer's
-- primary key is, so a DR-184 version that ran no loop of its own simply has no
-- row rather than borrowing its predecessor's.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: the one function below is this file's
-- own (…_serve_disclosure); nothing another migration defines is replaced.
--
-- Additive and replay-safe. Nothing historical is rewritten.

CREATE TABLE IF NOT EXISTS serve.serve_disclosure (
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  -- A provider ref: 1 to 256 characters (code points, as length() counts them)
  -- with no ASCII white space at either end. ServeDisclosureRepository holds the
  -- same rule, so a row this table accepts is a row the typed read accepts.
  writer_planned_ref text NOT NULL CHECK (
    length(writer_planned_ref) BETWEEN 1 AND 256
    AND writer_planned_ref = btrim(writer_planned_ref, E' \t\n\r\f\x0B')
  ),
  checker_planned_ref text NOT NULL CHECK (
    length(checker_planned_ref) BETWEEN 1 AND 256
    AND checker_planned_ref = btrim(checker_planned_ref, E' \t\n\r\f\x0B')
  ),
  -- NULL when the served result has no checked round (components-only).
  writer_served_ref text CHECK (writer_served_ref IS NULL OR (
    length(writer_served_ref) BETWEEN 1 AND 256
    AND writer_served_ref = btrim(writer_served_ref, E' \t\n\r\f\x0B')
  )),
  checker_served_ref text CHECK (checker_served_ref IS NULL OR (
    length(checker_served_ref) BETWEEN 1 AND 256
    AND checker_served_ref = btrim(checker_served_ref, E' \t\n\r\f\x0B')
  )),
  writer_fallback boolean NOT NULL,
  checker_fallback boolean NOT NULL,
  fallback_reason text CHECK (fallback_reason IS NULL OR fallback_reason IN ('MONEY')),
  checker_same_as_writer boolean NOT NULL,
  -- The stop that ended the arguing early (spec §14.4.1). DAILY is a dead path
  -- mid-run today, and listed anyway: the runner's stop kinds are four, and a
  -- CHECK that refused one of them would lose the whole row.
  body_stop text CHECK (body_stop IS NULL OR body_stop IN ('MONEY', 'ATTEMPTS', 'USAGE', 'DAILY')),
  points_without_review integer CHECK (points_without_review IS NULL OR points_without_review >= 0),
  -- What ended the answer-writing loop early, whether or not a complete round
  -- was kept (spec §14.4.2): a spend stop on an answer-writing call after every
  -- cheaper maker was refused, a dead role transport, or a draft with nothing to
  -- serve. NULL when the loop ran to a satisfied checker or to its bound, or
  -- never started. It is the one durable trace of a transport death after a kept
  -- round (the answer carries no mark for it), and of a serve-leg stop whose
  -- envelope record the stop while arguing already took.
  serve_stop text CHECK (
    serve_stop IS NULL
    OR serve_stop IN ('MONEY', 'ATTEMPTS', 'USAGE', 'DAILY', 'TRANSPORT_DEATH', 'NO_ARTIFACT')
  ),
  digest_rung smallint CHECK (digest_rung IS NULL OR digest_rung >= 0),
  digest_points_omitted integer CHECK (digest_points_omitted IS NULL OR digest_points_omitted >= 0),
  floor_verdict_state text CHECK (
    floor_verdict_state IS NULL OR floor_verdict_state IN ('SUPPORTED', 'CONTESTED', 'UNSUPPORTED')
  ),
  floor_leading_node_id uuid,
  -- Engine codes only: a reason is never model text (at most 96 characters,
  -- inside the repository's 256-character cap).
  floor_reason text CHECK (floor_reason IS NULL OR floor_reason ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (answer_id, answer_version),
  CONSTRAINT serve_disclosure_answer_fk FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version),
  -- A checked round names both its writer and its checker, or neither.
  CONSTRAINT serve_disclosure_served_round_is_whole CHECK (
    (writer_served_ref IS NULL) = (checker_served_ref IS NULL)
  ),
  -- A fallback IS a served maker other than the planned one: the only way the
  -- runner substitutes a sealed role identity is the money fallback (J24 as
  -- amended by §14.4.2), so the flags and the reason can never disagree with
  -- the refs they summarise.
  CONSTRAINT serve_disclosure_writer_fallback_is_coherent CHECK (
    writer_fallback = COALESCE(writer_served_ref <> writer_planned_ref, false)
  ),
  CONSTRAINT serve_disclosure_checker_fallback_is_coherent CHECK (
    checker_fallback = COALESCE(checker_served_ref <> checker_planned_ref, false)
  ),
  CONSTRAINT serve_disclosure_fallback_names_its_reason CHECK (
    (fallback_reason IS NOT NULL) = (writer_fallback OR checker_fallback)
  ),
  CONSTRAINT serve_disclosure_same_maker_is_coherent CHECK (
    checker_same_as_writer = COALESCE(checker_served_ref = writer_served_ref, false)
  ),
  -- A floor (Task M5) holds its label, its leading position and its reason, or none.
  CONSTRAINT serve_disclosure_floor_is_whole CHECK (
    (floor_verdict_state IS NULL AND floor_leading_node_id IS NULL AND floor_reason IS NULL)
    OR (floor_verdict_state IS NOT NULL AND floor_leading_node_id IS NOT NULL AND floor_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS serve_disclosure_run_idx ON serve.serve_disclosure (run_id);

-- The row belongs to exactly one served answer version of exactly this run:
-- 0074's answer_story guard makes the same check (ANSWER_STORY_RUN_MISMATCH).
-- Invoker rights, pinned search_path, in 0074's plaintext-guard pattern.
CREATE OR REPLACE FUNCTION core.enforce_answer_run_serve_disclosure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM serve.answer AS answer
    WHERE answer.answer_id = NEW.answer_id
      AND answer.answer_version = NEW.answer_version
      AND answer.run_id = NEW.run_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'SERVE_DISCLOSURE_RUN_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_answer_run ON serve.serve_disclosure;
CREATE TRIGGER enforce_answer_run
BEFORE INSERT ON serve.serve_disclosure
FOR EACH ROW EXECUTE FUNCTION core.enforce_answer_run_serve_disclosure();

-- APPEND-ONLY, treatment (a) of 0065: UPDATE and DELETE closed for every role,
-- TRUNCATE closed by 0056's guard.
SELECT core.install_truncate_guard('serve.serve_disclosure');

DROP TRIGGER IF EXISTS reject_mutation ON serve.serve_disclosure;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON serve.serve_disclosure
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The runner writes the row; the owner-scoped read (Task M5) runs in the API.
-- Both run as debateai_runtime.
GRANT SELECT, INSERT ON serve.serve_disclosure TO debateai_runtime;

REVOKE ALL ON FUNCTION core.enforce_answer_run_serve_disclosure() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_answer_run_serve_disclosure() TO debateai_runtime;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0066's closing
-- shape): all three guards are installed and enabled, or the migration refuses.
DO $serve_disclosure_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid = 'serve.serve_disclosure'::regclass
      AND trigger.tgfoid = ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'core.reject_mutation()'::regprocedure,
        'core.enforce_answer_run_serve_disclosure()'::regprocedure
      ])
  ) <> 3 THEN
    RAISE EXCEPTION 'SERVE_DISCLOSURE_GUARD_CONTRACT_INVALID';
  END IF;
END
$serve_disclosure_guard_contract$;
