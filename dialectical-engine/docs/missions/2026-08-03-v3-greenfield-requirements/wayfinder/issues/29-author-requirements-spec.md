# 29 — Author destination artifact 1: the V3 requirements spec

Type: task
Status: resolved
Blocked by: 07, 09, 10, 11, 12, 13, 14, 19, 20, 21, 22, 23, 24, 25, 26, 28

## Answer

Authored, thrice-reviewed, reworked, ACCEPTED (DR-067). 71/71 rows, zero
open, lint-clean. Final form in the mission's spec-pack/ and DebateAI-V3's
docs/founding/.

## Question

Draft the V3 requirements spec from the resolved decision set. Output path:
`../../spec-pack/requirements-spec.md`.

## Definition of Done

- Every Q1–Q62 and R1–R9 row appears EXACTLY ONCE in the row-closure table:
  row → final V disposition (DR ID in
  [../decisions-ledger.md](../decisions-ledger.md)) → substantive requirement
  text in this spec (not a bare section name). Conditional rows carry their
  explicit blocked-on condition (activation table's runnability column).
- Every V-owned parameter (the 19-knob register, ticket 12) appears with its
  V value or an explicit V-approved deferral naming behavior-while-unresolved.
- Composition chapter reflects ticket 28's rulings; activation semantics
  reflect `research/18-activation-table.md`.
- Traceability: requirements cite DR IDs; contested provenance annotations
  preserved per DR-004.
- Review gate: three lenses (Codex/Grok/Hermes), orchestrator merges (DR-006),
  then V accepts.

## Comments
