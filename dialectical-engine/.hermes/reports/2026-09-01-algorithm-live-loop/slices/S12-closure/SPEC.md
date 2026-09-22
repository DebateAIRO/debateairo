<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S12 SPEC — Closure: global DoD, confirm-items, delta/epsilon refit

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S12-closure` |
| goal tasks | GLOBAL |
| goal line range | 28–66 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | every ruling I-1..I-5, S1-1..S7-3 lands here at acceptance |
| wave | W12 (see `../../PROGRESS.md`) |

## Scope law — VERBATIM, goal lines 22–26

```
## Scope law
Algorithm only. NO UI redesign (T11's banner mapping is a vocabulary wiring, not a
redesign), no retrieval/tool-use, no steering design, no engine provider model choices
(S2-1), no changes to published arithmetic σ/agg/clustering. Legacy `web/` is touched
ONLY by T2. Every degradation or skip emits a visible condition mark.
```

## Global definition of done — VERBATIM, goal lines 28–41

```
## Global definition of done
- RED before GREEN means: the FIRST test asserts the DESIRED behavior and fails on the
  baseline. Never write a test that passes today and flip its assertion later. Read-only
  probes documenting old behavior are allowed but are not the RED evidence.
- Suites reported passed/total; pre-existing failures named, never absorbed.
- Full multi-maker acceptance run (M≥2, depth≥2) completes with: panel-reduced τ
  (non-self-graded), measured edges, at least one root's final strength ≠ τ, an adaptive
  stop or ceiling recorded, a synthesizer verdict statement acknowledging the strongest
  surviving objection, an evaluator loop record (≤3 rounds), a code-derived three-state
  label, a band counted over cited nodes, AND envelope state WITHIN at terminal.
- Mono-maker acceptance run still completes (skeleton path + marks intact).
- Every new policy value lives in sealed register rows via T16's mechanism; missing rows
  fail loudly.

```

## Confirm-items for V at acceptance — VERBATIM, goal lines 42–66

```
## Confirm-items for V at acceptance of this /goal
1. S7-1 split: label from code, statement from synthesizer, agreement enforced. (rec: yes)
2. S6-4 honesty: a round-3 standing evaluator objection serves WITH a visible condition
   mark. (rec: yes)
3. Does a standing round-3 objection ALSO force the label to CONTESTED? Default in this
   draft: NO — the label derives from numbers only, before synthesis (keeps the
   derivation acyclic; the objection remains a mark). Saying YES buys stronger honesty at
   the cost of a bounded post-loop re-derivation step. (rec: NO for this mission)
4. Live-UI verdict vocabulary mapping (T11): SUPPORTED→endorsed,
   CONTESTED→endorsed_with_caveat, UNSUPPORTED→suppressed_no_evidence. The last pairing
   stretches the existing string's meaning; renaming the vocabulary is UI-owned work for
   another lane. (rec: accept mapping now, rename later)
5. Panel-member failure policy (T3): when some non-author judges fail, proceed with the
   voices that parsed + visible mark; when ALL fail, degrade to single-voice with mark
   `PANEL-DEGRADED-SINGLE-VOICE` + one band step down — never a silent self-grade, never
   a components-only. (rec: yes)
6. Mono-maker / degraded-panel label: when margin or dispersion is ABSENT, the label is
   CONTESTED + `LABEL-BASIS-INCOMPLETE` — a solo voice can never print SUPPORTED, no
   matter how confident. (rec: yes — both lenses independently demanded the arm)
7. Run-level claim frame: every child node is claim-typed from the ORIGINAL question's
   text, not its own statement (apps/runner/src/index.ts:1633; verified by both lenses).
   Inert today; load-bearing once τ drives margins and labels. This draft PARKS it in
   Non-goals as a deliberate one-debate-one-frame design, to revisit with live
   calibration data — say the word and it becomes a small task instead. (rec: park)

```

Disposition already recorded: mission `DECISIONS.md` R7-3 makes the seven
in-goal recommendations the operative defaults (1 yes · 2 yes · 3 NO ·
4 accept-mapping-now · 5 yes · 6 yes · 7 park), re-presented to V at acceptance.

## Non-goals — VERBATIM, goal lines 321–331

```
## Non-goals (recorded V rulings)
Retrieval/execution receipts (S2-3) · steering design (S1-2) · dead askContract storage
(deferred to the steering mission — recorded, not forgotten) · engine provider model
choices (S2-1) · UI redesign / web-retirement decision · standing eval suite beyond T15 ·
any change to σ/agg/clustering arithmetic · per-node claim-type classification (the
run-level frame is deliberate this mission — confirm-item 7).

## Recommended follow-ups OUTSIDE this /goal (from seat self-reports; V may spawn later)
Orphan-audit as CI gate · enum-reachability lint (`@unreachable(reason)`) ·
stored-never-read column check · deterministic composer fact/reference validator beyond
T9's citation tracing.
```

The `## Recommended follow-ups OUTSIDE this /goal` block (goal lines 328–331) is
the tail of the quote above. It is recorded here so closure cannot adopt those
four items by drift: they are explicitly OUTSIDE this /goal and V may spawn them
later. The slice-map cites this section as 321–332; line 332 is the terminal
empty line after the file's final newline and carries no content.

## δ/ε refit — owned here, DEFINED in T7

The refit clause is part of T7's DoD (goal lines 183–186), quoted in
`../S05-stopping/SPEC.md`. S12 owns EXECUTING it: fitting δ and ε from the first
M≥2 acceptance run and recording the fitted values in the mission `DECISIONS.md`.
Cited here, never re-quoted (slice-map: quoted once, cited everywhere else).

## Global obligations that also bind this slice (cited, not re-quoted)

- Scope law — goal 22–26, quoted in `../S12-closure/SPEC.md`.
- Global definition of done — goal 28–41, quoted in `../S12-closure/SPEC.md`.
  The RED-before-GREEN clause binds every task in this slice that says `RED first`.
- Non-goals — goal 321–331, quoted in `../S12-closure/SPEC.md`.
- Standing laws: `../../../../.claude/skills/heartbeat-protocol/SKILL.md` §2.

## Open findings against this slice

Filed in `../../agent-reports/req-01.md`. A finding is a finding (router §2.2):
each one carries a ticket and a fix; non-blocking changes WHEN, never WHETHER.

