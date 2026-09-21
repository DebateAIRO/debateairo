# [unassigned] F-W2-PRODUCER-SWEEP · sweep `CONDITION_MARKS` for members with no producer

```yaml
state:
  ticket: F-W2-PRODUCER-SWEEP
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T13)'s F1 (SDD ledger :121; the draft is
`task-13-report.md` §"F1 (round 0) — draft ticket"). **`risk_tier: high` because this is the class that
produced F-VS11-1, and the class has never been examined.**

`DEGRADED-DIVERSITY` sat in the kernel vocabulary (`packages/kernel/src/index.ts:114`–`:208`, 37 members)
with a rendered UI label — *"Model diversity degraded"* — and **no emitter, for the whole mission**.
Every instrument we run is blind to that state: an unreached `case` arm typechecks; no fixture can carry
a mark nothing mints; and the count pin at `tests/unit/s14-live-projections.test.ts:41` proves
MEMBERSHIP, which is not production. **It was found by a human sweep following a V instruction, not by a
gate.** 36 members have never been checked.

**Charge:** one test, ~30 lines. For each member of `CONDITION_MARKS`, require at least one PUSH site in
`packages/` or `apps/` — a hit that is neither the declaration, nor a label `case`, nor under `tests/`.
Members that are legitimately read-only (a historical mark preserved for answers sealed under an older
rule) go in a NAMED allow-list, each with the ruling that retired it.

**Why it generalises, and why it should be built as an instrument rather than a test:** the same blind
spot exists for every reader-facing vocabulary the product renders — gate traces, served root rules,
badges, `ABSTENTION_KINDS`.

**It is one half of a pair.** The other half is the WHO-READS-THIS-STRING blind spot this same round
exposed: **a NEW EMISSION has readers** — every exact pin of the collection it joins — and the law's
literal grep cannot see them. A third limb was found later, by the final gate: a **count** pin
(`toHaveLength(47)`) names no symbol at all. One instrument should answer all three questions about a
symbol: who reads its value, who pins the collection it joins, who pins that collection's size.
STRENGTH: entailed.
