<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S02 SPEC — Contract/legacy/schema hygiene

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S02-hygiene` |
| goal tasks | T1, T2, T4, T8 |
| goal line range | 97–128 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S1-1 (as refined by the Stop-1 correction: enforce in the CONTRACT SCHEMA); S1-2 (as refined by the Stop-1 correction: placebo lives in legacy web/ only); S2-3; S5-2 |
| wave | W2 (see `../../PROGRESS.md`) |

## T1 — VERBATIM, goal lines 97–106

```
### T1 · Depth enforced at the contract door (S1-1)
The 1–5 integer bound is defined ONCE in `packages/contract` (exported constant +
`depth_params` schema requiring integer `depth` 1–5); `resolveExpansionDepth`
(apps/runner/src/index.ts:987-996) IMPORTS that constant and keeps throwing
`RUN_DEPTH_PARAMS_INVALID` as defence in depth. No second literal 5 (DoD greps for it).
DoD: RED first — a test expecting HTTP 400 with the `parseRequest` validation envelope
(exact machine code asserted in the test) for depth 9 FAILS on baseline; then GREEN for
inputs 0, 6, missing, fractional, string, unknown-key; 1 and 5 accepted through both
clients; runner guard intact; single-source grep test.

```

## T2 — VERBATIM, goal lines 107–111

```
### T2 · Steering placebo removed from legacy form (S1-2)
Remove the two steering textareas from `web/app/new/NewQuestionForm.tsx:50-51`; submit
empty arrays; contract fields unchanged.
DoD: legacy form renders no steering inputs; submission still validates; no other web/ change.

```

## T4 — VERBATIM, goal lines 112–118

```
### T4 · Way-of-knowing simplification + disclosure (S2-3)
Remove `RAN` from the judge output schema (packages/judgement/src/index.ts:26-29,130);
normalization (locator-less LOOKED_UP → REASONING) records condition mark
`WAY-OF-KNOWING-DOWNGRADED` naming node + claimed value.
DoD: RED first — test expecting the schema to reject RAN fails on baseline; mark emitted
on normalization (test); Q51 semantics unchanged.

```

## T8 — VERBATIM, goal lines 119–128

```
### T8 · Remove strict-and — full surface (S5-2)
Deletion surface: propagation withholding branch, published-arithmetic `product`,
operator vocabulary, dev-policy acceptance, AND the rival-operator pathway —
`rivalOperator` (packages/propagation/src/index.ts:156-162), the rival evaluation at
:372-374/:538, and the `rivalOperator`/`rivalStrength` receipt fields (:576-577) the
runner persists (apps/runner/src/index.ts:2025-2039) — with receipt schema/migration.
`accumulate` pinned as THE operator.
DoD: no strict-and or rival-operator reference in shipped code (grep test); receipt
schema migrated; suites green.

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

