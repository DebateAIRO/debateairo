-- T9 (goal 222-270) / ruling J25 — the synthesis loop's ROUND RECORDS become durable.
--
-- WHY THIS TABLE EXISTS. The goal's definition of done asks for "loop-round
-- records" and for a round-2 synthesizer request that carries the round-1
-- objection VERBATIM. The first filing satisfied both in a RETURNED OBJECT and
-- nowhere else: nothing wrote them, so no reader of a served answer could ever
-- see a round, and the tests asserted on the array the function had just
-- returned. J25 rules that shape out — "an in-memory disclosure is not a
-- disclosure" — so the records cross the persistence boundary here.
--
-- WHAT A ROW IS. One row per loop round, in order, carrying the EXACT recorded
-- requests rather than a summary of them: the synthesizer request (whose RETRY
-- form contains the prior objection verbatim and a reference to the prior
-- candidate), the candidate that round produced, and the evaluator request and
-- verdict that judged it. A reader can therefore replay the convergence — or
-- prove it never converged and the answer was served with the objection still
-- standing.
--
-- candidate_ref is the RECORDED PROVIDER ARTIFACT for that round, not a
-- process-local label. The first filing emitted `candidate:round-N`, a string
-- that resembles an identifier and resolves to nothing; a retry pointing at it
-- referenced no artifact at all.
--
-- APPEND-ONLY, like every other sealed serve relation: rows are inserted inside
-- the answer's own write transaction and never updated. The composite reference
-- to (answer_id, answer_version) is deliberate — DR-184 appends a NEW VERSION of
-- an answer, and a version that ran no loop of its own (review catch-up) simply
-- has no rows here rather than borrowing the previous version's.
--
-- W12b NOTE: the peer's 0056 introduces core.install_truncate_guard; that
-- function does not exist on this mission base, so the guard call for this
-- relation is added at DEV-SYNC per D25, not here.

CREATE TABLE IF NOT EXISTS serve.synthesis_round (
  synthesis_round_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  round integer NOT NULL CHECK (round >= 1),
  synthesizer_stage text NOT NULL CHECK (synthesizer_stage IN ('INITIAL', 'RETRY')),
  synthesizer_request jsonb NOT NULL CHECK (jsonb_typeof(synthesizer_request) = 'object'),
  candidate_ref text NOT NULL CHECK (length(btrim(candidate_ref)) > 0),
  candidate_statement text NOT NULL,
  evaluator_request jsonb NOT NULL CHECK (jsonb_typeof(evaluator_request) = 'object'),
  evaluator_verdict jsonb NOT NULL CHECK (jsonb_typeof(evaluator_verdict) = 'object'),
  -- The objection this round raised, or NULL when the evaluator was satisfied.
  -- A satisfied round is the LAST round by construction, so at most one row per
  -- answer version carries NULL here.
  round_objection text,
  sealed_at_seq bigint NOT NULL UNIQUE CHECK (sealed_at_seq > 0),
  FOREIGN KEY (answer_id, answer_version) REFERENCES serve.answer(answer_id, answer_version),
  UNIQUE (answer_id, answer_version, round)
);

CREATE INDEX IF NOT EXISTS synthesis_round_answer_idx
  ON serve.synthesis_round (answer_id, answer_version, round);

GRANT SELECT, INSERT ON serve.synthesis_round TO debateai_runtime;
