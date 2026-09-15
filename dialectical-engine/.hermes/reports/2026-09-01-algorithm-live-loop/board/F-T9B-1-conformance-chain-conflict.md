# [claude@opus-5] F-T9B-1 · T9's chain and S08's cited-set are INCOMPATIBLE — a design conflict for V

```yaml
state:
  ticket: F-T9B-1
  risk_tier: high            # T9 must merge for the closing run; merging it as-is silently voids an S08 safety property
  status: done # V RULED option (a) 2026-09-03 — T9 carries the safety property forward; exactly one landed assertion retired on the record
  owner: { agent: unassigned, session: n/a }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [V decision first]
    human_review: yes
  worktree: { path: n/a, branch: n/a, merge_status: blocked }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: 2026-09-03
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t9b-r1-2026-09-03
```

## The conflict, measured in both trees

**Integration (S08 landed)** mints THREE conformance states — `JUDGED` for load-bearing segments,
`SAMPLED_PASSED` for sampled ones, `NOT_SAMPLED` for the rest (`packages/serve/src/index.ts:528-532`)
— and carries THREE `conformance.every(j => j.conforms)` guards, one of which returns
`componentsOnly` before any banding happens.

**lane/s07 (T9)** mints ONE state. Every segment is `JUDGED`, with `conforms` set from a single
`finalCriteria.citationTracing` boolean, and there are ZERO `conformance.every` guards. T9's own
comment states the intent plainly: *"The evaluator traces every load-bearing claim, so the
coverage is exhaustive by construction — there is no sample any more."* Sampling is retired:
`selectSample`/`strangerSampleRate` appear 4 times in integration and 0 times in lane/s07.

## Two consequences, and the second is the dangerous one

1. **S08's assertion pins a state T9 makes impossible.** `it("excludes the citations of a segment
   conformance never verified")` requires a segment that is not verified. Under T9 no such segment
   can exist, so S08's `state !== "NOT_SAMPLED"` filter excludes nothing and the test cannot pass.
2. **A safety property disappears silently.** In integration, a non-conforming set returns
   `componentsOnly` BEFORE banding. Under T9 there is no such guard, so a run whose
   `citationTracing` criterion is FALSE still has its citations counted into the confidence band.
   Nothing fails; the band is simply computed on evidence the evaluator rejected.

**I cleared that predicate myself in the S08 judge verdict**, and I was right about integration
and wrong to stop there. I checked that `state !== "NOT_SAMPLED"` was safe *because of* the guard
thirty lines above it, wrote "whoever moves either piece must move both" into the record, and did
not ask whether an unmerged lane already moved both. T9 moves both.

## This is not a bug in either lane

S08 is correct in a world where segments are sampled. T9 is correct in a world where the evaluator
is exhaustive. Both were reviewed and both are internally sound. The incompatibility is the design
choice, and the standing law forbids resolving it by weakening a landed assertion.

## Options for V

- **(a) T9 carries the safety property into its own vocabulary** — a guard returning
  `componentsOnly` when `citationTracing` is false, preserving exactly what S08's guard protected —
  and S08's "never verified" assertion is RETIRED ON THE RECORD as pinning a state the shipped
  design no longer produces. Recommended: T9's exhaustive-coverage design is sound and newer, and
  this keeps the protection while dropping only the assumption of sampling.
- **(b) T9 restores a sampling path** so `NOT_SAMPLED` remains reachable. This contradicts T9's own
  design rationale and would mean fabricating a state the evaluator no longer produces.
- **(c) S08's cited set drops the conformance restriction** and relies on the guard alone. Smallest
  edit, but it widens the cited set on every deployment, including those that do sample.

## Also from this seat

**F-T9B-2 (evidence).** `tools/mutant-index.py` finds ALL THIRTY s07 mutant transcripts
D42-malformed, not merely the four already known. `mut-M1.run.log` is bare vitest output. The seat
did not overturn the fifteen previously accepted (D42 postdates them) and did not invent a
replacement number: the file set holds 30 transcripts, 24 mutants and 6 neighbours, so the
report's "nineteen" is not derivable from it at all. It left the sentence unedited rather than
write a figure it could not derive, which is correct under D34.
