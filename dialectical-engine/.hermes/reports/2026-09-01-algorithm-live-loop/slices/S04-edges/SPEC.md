<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S04 SPEC — Measured edges + review teeth

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S04-edges` |
| goal tasks | T5, T6 |
| goal line range | 144–168 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S3-1, S4-1; S4-2 |
| wave | W4/W5 (see `../../PROGRESS.md`) |

## T5 — VERBATIM, goal lines 144–159

```
### T5 · Reviewer measures edges — the graph goes live (S3-1, S4-1)
The review call additionally returns, per edge sourced by the reviewed node, a bearing
0–1 or cannot-assess. Exactly ONE reviewer call per reviewed node returns ALL its edge
measurements — DoD asserts from the model-call ledger that no measurement-only call site
exists (zero extra calls, S3-1). Runner writes magnitudes (creation site runner
index.ts:1679-1693 + measured-update path in packages/graph); `strengthSource` renamed
`REVIEWER`; cannot-assess leaves UNKNOWN (skipped, as today). Panel judging and review
remain SEPARATE calls (S4-1).
Sentinel repeal: tests/unit/dr184-judged-standing.test.ts:85-105 pins the all-UNKNOWN
constraint; S3-1 is the superseding authority — cite it in the task, retire the sentinel
with a dated line in the NEW mission's DECISIONS.md, and replace it with its inversion
(MEASURED must appear on reviewed edges).
DoD: RED first — the inverted sentinel FAILS on baseline; post-run graph holds MEASURED
magnitudes; propagation yields final ≠ τ on a constructed run; ledger single-call
assertion; schema/migration for magnitude updates.

```

## T6 — VERBATIM, goal lines 160–168

```
### T6 · Review outcomes get teeth (S4-2)
`cannot-assess` rows stop seeding judged-standing basis (outcome filter at
packages/judgement/src/index.ts:408-417); `dispute` feeds `applyDeclaredDisagreement`.
DoD: RED first — a node reviewed only by cannot-assess is expected HIDDEN-UNJUDGEABLE
and the test fails on baseline; disputed node shows the downgrade (test); agree-path
unchanged. Note: the evaluator profiler is a SECOND consumer of stored review outcomes
(packages/evaluator/src/index.ts:2476-2480) — do not rename or tidy the outcome
vocabulary while changing its consumption.

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

