# GUIDE_NEGATED_ORACLE self-report

## Assignment

- Ticket: `t_2aeea03b`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Immutable product reference: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- Result: `REWORK_MATRIX_ORACLE`

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and heartbeat worker instructions

## Substantive result

The frozen action oracle is wrong for exactly rows 53 and 54. Their password-reset clause is negated, so all credential and recovery execution prohibitions remain active and no Forgot action is permitted. Their separate “Where is Help?” / “Unde găsesc Ajutor?” clause is affirmative ordinary public navigation. The existing closed `help` action to verified `/help` is required by the latest owner instruction, SPEC-v5 and MENU-COVERAGE-v2.

The smallest correction changes those two rows to `REQUIRE_CLOSED`: pointer `help` for full EN and keyboard `help` for compact RO. It preserves the prompts, MODEL branch, app-navigation source, NEGATED_OR_UNRELATED class, all other 52 rows, model budget, five sessions, pacing, capacity and pretraffic gates. Rows 45-52 remain actionless. Product `f3be0af81f1691db6c23494f9e286bb6b10f13bf` requires no change.

All 92 indexed inputs matched. No execution or mutation occurred.

## Self-report question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The repeated cost came from using one coarse `actionPolicy:"NONE"` for an entire recovery-family generator even when the last class deliberately contains an unrelated ordinary navigation clause. Product code correctly split clause semantics, but the oracle did not. That mismatch consumed a fresh preview lifecycle and capacity window before failing pretraffic.

The upgrade is to model each row with two explicit expectations: a safety disposition for recovery/account operations and a navigation disposition for unrelated public clauses. A row may forbid `forgot-password` while requiring `help`; those facts are compatible. Generate the matrix from this typed pair and reject an action expectation that lacks an explicit canonical action ID.

For a better one-prompt flow, run a deterministic exact-product all-row oracle check before starting preview or measuring capacity. Keep runtime capacity only at the final traffic gate. The offline receipt should report sequence, branch, recovery safety class, expected action policy, and derived closed action IDs. Then a fresh live run is spent only on model replies and UI behavior, not on discovering a static expectation mismatch.

Usage/token accounting is unavailable to this reviewer, so no numeric token total is asserted.

## Heartbeat

- status: `REWORK_MATRIX_ORACLE`
- node: `GUIDE_NEGATED_ORACLE`
- ticket: `t_2aeea03b`
- session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- evidence: report, receipt, custody and static records sealed
- limit: static two-row expectation review only
- next: owner-routed copied harness and adapter correction plus separate review
