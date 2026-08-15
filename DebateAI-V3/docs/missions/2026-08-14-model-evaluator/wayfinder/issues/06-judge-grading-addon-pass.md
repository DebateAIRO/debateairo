# 06 — Targeted add-on pass: grading the judges' gradings

Type: task
Status: done
Blocked by: 05

## Programming-stage handoff

- Reconciliation retries must be bounded independently. Evaluator provider calls are
  null-run-scoped, so cross-invocation evaluator attempt accounting is off by design
  (PROG-04 Hermes ruling); lane `eval-06-addon` must not rely on the product run's
  attempt counter as its retry bound.
- Hermes ratified migration 0026's null-run trigger amendment: the graded artifact
  must belong to the product run, while the evaluator grader artifact must have
  `run_id IS NULL`. Architecture §3.4 and §5.3 now record this correction.

## Question

The one hole harvesting leaves (charting ruling 9): nobody grades the JUDGES' work.
Design and build the small blind pass where judges' gradings themselves get graded —
different-lineage grader, authorship stripped, one bounded pass per run (not a full
re-benchmark). Decide: sampling (every run vs. every Nth) to control subscription
spend, the grade schema it writes (as answer_outcome rows with step JUDGING or a
dedicated metric), and how it composes with the existing DB-level different-maker
trigger. Output feeds ticket 07's bias metrics.
