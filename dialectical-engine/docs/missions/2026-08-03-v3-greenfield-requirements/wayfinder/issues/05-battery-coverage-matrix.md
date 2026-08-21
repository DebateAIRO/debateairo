# 05 — Battery→spec coverage matrix

Type: research
Status: resolved
Blocked by: none

## Question

For every one of the 62 battery questions and 9 rules: what is its current
disposition (unanimous MACHINE/HYBRID/LLM — adoptable; or CONTESTED — which
decision theme settles it), and which spec-pack section must cover it?

## Why

V's coverage law: ALL 62+9 get concrete dispositions — the spec must PROVE
coverage, row by row. This matrix is the enforcement instrument; grilling
tickets [07](07-ratify-unanimous-batch.md) and
[08](08-contested-cluster-rulings.md) consume it, and the race-criteria ticket
[15](15-race-victory-criteria.md) draws its measures inventory from it.

## Scope

- Row-by-row matrix: Q1–Q62 + R1–R9 → merged disposition | CONTESTED(theme).
- Every `Unresolved` human parameter the LLM report declares, listed with its
  owning ticket.
- The measurement dimensions the reports name for end-to-end evaluation
  (tokens, retrieval bytes, activated rows, failures, latency, retained
  substance) — inventoried for ticket 15.

## Inputs (read-only)

- `docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md`
- `docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-humans.md`

## Deliverable

`../../research/05-battery-coverage-matrix.md`, marker
`RESEARCH HANDOFF COMPLETE` at top.

## Answer

Resolved by Opus research seat — matrix at
[../../research/05-battery-coverage-matrix.md](../../research/05-battery-coverage-matrix.md),
mechanically self-verified against the LLM report's contract tables (zero
mismatches, 71 rows).

Gist: split confirmed — 10 MACHINE / 27 HYBRID / 1 LLM / 24 CONTESTED; rules 5
HYBRID / 4 CONTESTED. The 28 contested rows group into 7 dispute clusters
(agenda skeleton for tickets 06/08). The V-owned parameter register is 18
fields, not 17 — SIX were orphaned (no owning ticket): 3 V-policy
(`splitIterationLimit`, `citationEnforcement`, `coverageUpgrade`) + 3 per-run
inputs (Q1 decision/action owner, caller scope/`as_of`, Q59 external resolver)
→ now assigned to ticket 12 by orchestrator amendment. Nine discrepancies; the
two that bite: D-2 — V's whole-graph stranger ruling superseded R9/Q26/Q27/Q28
text that was never rewritten, and all four sit in the UNANIMOUS batch (ticket
07 now names them as mandatory exceptions); D-8 — no ticket owned the one
authoritative activation table (43 `·A·` markers vs type-cost table
unreconciled) → new ticket 18. D-9: some unanimous-MACHINE rows (Q6, Q56) are
un-runnable until ticket 10 prices abstention — coverage proof carries a
blocked-on column. Measurement dimensions inventoried for ticket 15 in six
groups, including three additions the reports lack (the V2 arm, the four
indicted defects as repair metrics, the promotion bar).

## Comments

- Orchestrator cross-check (2026-08-03, after ticket 06 landed): the artifact's
  D-2 consequence line says "R9, Q26, Q27 and Q28 all sit in the unanimous
  batch", but the artifact's own matrix row 87 has Q26 CONTESTED (ticket 08 →
  now theme ticket 21). Q26 is settled in the contested sitting; ticket 07's
  exception list is R9/Q27/Q28. The clusterings of 05 and 06 otherwise align
  (7 themes, identical row unions spot-checked).
- Integrity flag inherited from ticket 06: Research-Hermes' summary line
  (18 LLM / 31 HYBRID / 13 MACHINE) contradicts its own per-row table
  (13/34/15); the merge and this matrix correctly used the table.
