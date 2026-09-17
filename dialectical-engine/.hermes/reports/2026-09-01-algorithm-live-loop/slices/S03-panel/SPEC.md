<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S03 SPEC — Judge panel wired (author != judge)

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S03-panel` |
| goal tasks | T3 |
| goal line range | 129–143 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S2-2 + confirm-item 5 |
| wave | W3 (see `../../PROGRESS.md`) |

## T3 — VERBATIM, goal lines 129–143

```
### T3 · Wire the judge panel — author ≠ judge (S2-2)
Every authored node is assessed by every other healthy maker via `runJudgePanel`; the
author's self-assessment is one member. Wire `measureDispersion`,
`applyCorrelatedErrorDiscount`, `applyDeclaredDisagreement` (s04.ts:224-336) into
reduce/select (runner index.ts:1497-1556, 1641-1716) with T16's sealed inputs (family
map, dispersion scale, multiplier, bands). Mono-maker keeps the skeleton path + literal.
Failure policy per confirm-item 5: partial panel → proceed + mark; all-others-failed →
`PANEL-DEGRADED-SINGLE-VOICE` mark + one band step down. Timeout, parse-failure, and
all-failed paths each tested.
DoD: RED first — a test expecting one reduced judgement per node whose
`panelContractHashes` lists ≥2 members with non-null dispersion on an M≥2 path FAILS on
baseline (the skeleton literal is present today); then GREEN, plus an ACCEPTANCE-path
receipt proving dispersion + family discount live (not only unit calls); degraded-path
marks tested; skeleton literal reachable only at M=1.

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

