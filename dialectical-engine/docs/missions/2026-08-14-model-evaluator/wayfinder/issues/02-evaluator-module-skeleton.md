# 02 — Evaluator module skeleton and boundary contract

Type: task
Status: open

## Question

Stand up the separate module (charting ruling 2): decide its home
(packages/evaluator), its seams to runner/serve/settlement/db, and its read/write
surfaces under the append-only law — the evaluator READS run artifacts
(ledger.node_review, ledger.reduced_judgement, ledger.node_strength_record,
scorecard.answer_outcome, settlement outcomes) and WRITES only its own rows.
Reuses, never replaces, the scorecard machinery. Deliverable: module scaffold,
boundary contract doc (which schemas/tables it may touch, which triggers/grants
apply), and the dark-launch switch shape (everything behind an off-by-default
binding, per ruling 11).
