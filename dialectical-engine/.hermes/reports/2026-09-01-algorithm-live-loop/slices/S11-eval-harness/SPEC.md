<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S11 SPEC — Synthesizer/evaluator eval harness + role decision

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S11-eval-harness` |
| goal tasks | T15 |
| goal line range | 309–320 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S6-4, S6-1 |
| wave | W11 (see `../../PROGRESS.md`) |

## T15 — VERBATIM, goal lines 309–320

```
### T15 · Synthesizer/evaluator eval harness + role decision (S6-4, S6-1) — after T9
Exact matrix, spend-bounded: 5 recorded debates (reused fixtures from acceptance runs —
no new debate generation) × 3 candidate role configs × ≤2 evaluator rounds; graded blind
by 2 graders that are never the candidate; per-call max attempts + token ceiling stated
in the harness config; projected call count printed BEFORE any provider call and the run
proceeds only on explicit V approval (important-operation gate).
T15b — CLOSE THE DECISION: the comparison table routes to V; V's choice (or V's recorded
delegation rule) is written into the register role seeds. Until then the roles run on
T16's dev-provisional defaults. No arbitrary shipping of role refs (S6-1).
DoD: one-command harness; table produced; V decision recorded and seeded; spend gate
demonstrated (projected-count output test).

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

