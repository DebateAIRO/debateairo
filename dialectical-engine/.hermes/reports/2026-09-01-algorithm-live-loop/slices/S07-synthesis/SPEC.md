<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S07 SPEC — Synthesis serve chain

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S07-synthesis` |
| goal tasks | T9 |
| goal line range | 222–270 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S6-1, S6-2, S6-3, S6-4 + confirm-items 1, 2 |
| wave | W7 (see `../../PROGRESS.md`) |

## T9 — VERBATIM, goal lines 222–270

```
### T9 · Synthesis serve chain (S6-1, S6-2, S6-3, S6-4) — after T10/T11
DIGEST (lossless membership, B3/B5): a deterministic all-node schema — one entry per
materialized node (statement summary, final strength, polarity relations, way of
knowing, marks) with provenance-preserving compression; the byte budget governs SUMMARY
LENGTH per node, never membership. Top-2 surviving objections + runner-up positions are
EMPHASIS fields over that total membership (S6-2). If max compression still exceeds the
budget, the outcome is LOUD: condition mark + the enumerated crash class — never a
silent subset. Test: a decisive node outside roots/top-2 provably reaches the recorded
synthesizer request.
ROLES: SYNTHESIZER and EVALUATOR are named provider roles (T16), fresh-context calls
with zero debate ties (a debater's MODEL may hold a role; the CALL is fresh). Per-role
recorded request schemas, initial and retry DISTINGUISHED (the loop converges by
feedback, never by accident):
- synthesizer (initial) = instructions + digest + code label/numbers
- synthesizer (retry) = the same + the prior evaluator objection VERBATIM + a reference
  to the prior candidate
- evaluator = instructions + digest + code label/numbers + the current candidate statement
The fresh-context assertion = each recorded request contains NO debate transcript or
provider history beyond those named artifacts — never the absence of artifacts a role
needs; a recorded-request test asserts the round-2 synthesizer request contains the
exact round-1 objection. Evaluator checks fairness to losers, statement–label agreement
(label from T11), overstatement.
LOOP: ≤3 rounds or evaluator satisfied; after round 3 SERVE regardless; standing
objection → visible condition mark (confirm-items 2–3).
LEGACY GATE DISPOSITION (each former COMPONENTS_ONLY quality gate re-routed; test per
gate proves its new terminal):
- R9 restatement (serve:452-455) → evaluator-objection criterion. The envelope
  terminal's protectedCoreVerified guard (runner:2255,2260,2387,2392; serve:380-382)
  keyed on R9's gate-hood and is KNOWINGLY RETIRED with it: the envelope terminal fires
  on HARD_STOP whenever no served statement exists yet, independent of restatement status
- residual-objections-empty (:458-461) → DELETED (obsolete: objections now required)
- composition byte budget (:474-477) → code precondition: tighten summaries and retry,
  then serve with mark; crash class only if the digest cannot exist
- conformance ≤2 (:521-524) → evaluator-objection criterion (citation tracing: every
  load-bearing claim traces to a digest node)
- Q51 locator block (:529-532) → DELETED (unreachable by construction; documented)
- post-compose R9 (:554-557) → evaluator-objection criterion
COMPONENTS_ONLY survives ONLY for the enumerated set: transport death, no-artifact,
digest-cannot-exist, and envelope exhaustion after protected-core verification
(ENVELOPE_EXHAUSTED — a resource death with no prose, not a quality judgement; T17 owns
keeping the ceiling big enough, T9 owns what happens if it is still hit).
DoD: one test per former gate path AND one per enumerated crash class — envelope
exhaustion included, asserting terminal, mark, and the retired-guard behavior (an
exhausted envelope with no served statement takes the envelope terminal even when
restatement failed — never serves over budget); no non-crash path returns
COMPONENTS_ONLY; terminal + mark named per path; evaluator-unsatisfied-3-rounds serves
WITH the objection mark (test); fresh-context + round-2-objection recorded-request
assertions; loop-round records.

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

