<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S05 SPEC — Adaptive stopping

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S05-stopping` |
| goal tasks | T7 |
| goal line range | 169–186 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S3-2, S5-1 |
| wave | W5 (see `../../PROGRESS.md`) |

## T7 — VERBATIM, goal lines 169–186

```
### T7 · Adaptive stopping (S3-2, S5-1)
After each round, propagate (pure code; assert zero model calls via ledger). Global stop:
no root moved > δ vs the previous round. Branch freeze: leverage < ε → no expansion
beneath + mark `BRANCH-FROZEN-LOW-LEVERAGE`. Depth = ceiling; round-1 floor.
Leverage DEFINED: the recorded `sensitivityRecords[].leverage` of the branch's subtree
root node — max absolute change in any root's strength when that node is removed
(propagation/src/index.ts:605-626); a subtree's whole influence flows through its root
node, so node-removal leverage IS branch leverage. Freeze iff leverage < ε strictly;
UNKNOWN edges contribute nothing and cannot unfreeze a branch. `resolveLeverage`
(:637-644) is a stub returning LEVERAGE_UNRESOLVED — implement it over sensitivityRecords
or delete it in this task. Cost note: sensitivity is one full re-evaluation per node per
round (O(N²) pure-code); bounded by the freeze/stop rules keeping N small.
DoD: synthetic-graph tests with EXACT numeric examples for (a) global δ stop before
ceiling, (b) one branch frozen while a sibling continues, (c) round-1 floor, (d) equality
at ε continues (not frozen); marks recorded; zero model calls asserted; δ/ε RE-FITTED
from the first M≥2 acceptance run and the fitted values recorded in the new mission's
DECISIONS.md (statically chosen defaults are uncalibratable — no run has ever produced a
non-τ strength).
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

