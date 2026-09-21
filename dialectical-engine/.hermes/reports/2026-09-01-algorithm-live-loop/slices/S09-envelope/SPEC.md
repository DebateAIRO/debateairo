<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S09 SPEC — Cost envelope for the live topology

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S09-envelope` |
| goal tasks | T17 |
| goal line range | 284–295 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S2-2, S4-1, S6-4 consequence; r1 B1/B7 |
| wave | W9 (see `../../PROGRESS.md`) |

## T17 — VERBATIM, goal lines 285–295

```
### T17 · Cost envelope for the live topology (S2-2, S4-1, S6-4 consequence; r1 B1/B7)
`computeStructuralCeilingBasis` (packages/register/src/index.ts:158-200, DR-184-v2)
counts two model sites per node and no synthesis loop. Extend `StructuralCeilingInput`
for: (M−1) panel calls per materialized node, 1 reviewer call, up to 3 synthesizer + 3
evaluator rounds, conformance/repair/final-retry terms; bump `formula_version`; update
admission + receipts.
DoD: maximum-path ledger-count test proves the recomputed ceiling covers the observed
attempt count of the flagship M≥2 run — panel attempts included, asserted HERE from the
same ledger (envelope WITHIN at terminal — also in Global DoD); over-bound input still
refuses loudly at admission (test).

```

## Global obligations that also bind this slice (cited, not re-quoted)

- Scope law — goal 22–26, quoted in `../S12-closure/SPEC.md`.
- Global definition of done — goal 28–41, quoted in `../S12-closure/SPEC.md`.
  The RED-before-GREEN clause binds every task in this slice that says `RED first`.
- Non-goals — goal 321–331, quoted in `../S12-closure/SPEC.md`.
- Standing laws: `../../../../.claude/skills/heartbeat-protocol/SKILL.md` §2.

## Open findings against this slice

Filed in `../../agent-reports/req-01.md`. A finding is a finding (router §2.2):
each one carries a ticket and a fix; non-blocking changes WHEN, never WHETHER.

