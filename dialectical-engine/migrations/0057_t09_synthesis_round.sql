-- T9 (goal 222-270) · rulings J29 + J29 ADDENDUM, from codex r2 B1/B2 and r3
-- B1/B2 — the synthesis loop's round records are durable STRUCTURE and
-- PRODUCER-BOUND REFERENCES. No debate content lives here at all.
--
-- TWO THINGS THIS TABLE DELIBERATELY DOES NOT DO.
--
-- 1. It stores NO REQUEST BODY, and is therefore not a content carrier. The
--    first draft stored the whole transcript in plaintext outside the
--    encryption boundary; the second kept just the synthesizer request as an
--    encrypted carrier, arguing the definition of done needed it. The review
--    established that it does not: the frozen SPEC asks for recorded-request
--    ASSERTIONS and loop-round RECORDS, never for the request to be persisted.
--    And the carrier could not have proved what it was kept for — the SAME
--    in-memory request object fed both the provider packet and the row, so the
--    row was evidence the object existed, never that it was the request AS
--    SENT. The verbatim-objection assertion belongs on the RECORDED REQUEST at
--    the provider seam, which is where the SPEC puts it.
--
-- 2. It stores no reference that only proves "same run". Each of the two
--    artifact keys is resolved before the answer commits through the LEDGER
--    ENTRY that recorded it — this run, this work item, a successful
--    MODEL_CALL, at the call site named beside it — because run identity alone
--    let an unrelated JUDGE artifact from the same run stand in as both the
--    candidate and the verdict. The call-site key is stored next to each
--    reference so a reader can re-run that same join.
--
-- APPEND-ONLY, inserted inside the answer's own write transaction. The
-- composite reference to (answer_id, answer_version) is deliberate: DR-184
-- appends a NEW VERSION that ran no loop of its own, and it simply has no rows
-- here rather than borrowing the previous version's.
--
-- W12b NOTE: the peer's 0056 introduces core.install_truncate_guard; that
-- function does not exist on this mission base, so the guard call for this
-- relation is added at DEV-SYNC per D25, not here.

CREATE TABLE IF NOT EXISTS serve.synthesis_round (
  synthesis_round_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  round integer NOT NULL CHECK (round >= 1),
  synthesizer_stage text NOT NULL CHECK (synthesizer_stage IN ('INITIAL', 'RETRY')),
  candidate_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  candidate_call_site_key text NOT NULL CHECK (length(btrim(candidate_call_site_key)) > 0),
  evaluator_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  evaluator_call_site_key text NOT NULL CHECK (length(btrim(evaluator_call_site_key)) > 0),
  evaluator_satisfied boolean NOT NULL,
  sealed_at_seq bigint NOT NULL UNIQUE CHECK (sealed_at_seq > 0),
  FOREIGN KEY (answer_id, answer_version) REFERENCES serve.answer(answer_id, answer_version),
  UNIQUE (answer_id, answer_version, round)
);

CREATE INDEX IF NOT EXISTS synthesis_round_answer_idx
  ON serve.synthesis_round (answer_id, answer_version, round);

GRANT SELECT, INSERT ON serve.synthesis_round TO debateai_runtime;
