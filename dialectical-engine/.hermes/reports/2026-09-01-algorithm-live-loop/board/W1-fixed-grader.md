# [claude@opus-5] W1 · one FIXED grader for every arm (V-S11-GRADER)

```yaml
state:
  ticket: W1
  risk_tier: high
  status: done
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, judge verdict]
    human_review: no
  worktree: { path: n/a, branch: n/a, merge_status: n/a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: v-rulings-2026-09-03
```

V ruled that the grader must be the SAME model across every arm, and that a grader sharing an
identity with the candidate is NOT contamination — impartiality comes from each step being a fresh
instance that receives a task and a stage-specific prompt and does not know who produced what it is
reading.

The merged harness seats graders by COMPLEMENTING the candidate: it excludes candidate identities,
exhausts independent ones, and repeats one before seating a candidate ref. That logic solves a
problem this architecture does not have, and it is what makes the arms non-commensurable.

**Charge:** take ONE configured grader and use it for every arm. Remove the exclusion and the
repeat-before-candidate ranking. KEEP the disclosure: which identity graded, and whether it shares a
model or family with the candidate — V's 'recorded, never hidden' law is unchanged. Disclose the
fixed grader AS fixed, since a reader comparing arms should know the constant. Retain the
non-commensurability mark for the case where a deployment genuinely cannot supply one grader for all
arms, and make it fire ONLY then.

Closes F-S11-5 by dissolving it. No provider call is authorized.

## 2026-09-16 continuation
Moved `queued` → `done` by RECORDS(CONT-T19). Landed by **Task 14**, range `a87dc60b..0e289c0d`
(`39b2b46d` the product change). `resolveFixedGrader` takes no candidate — one identity, deterministic,
disclosed AS fixed in the preflight (`GRADER FIXED …`) and in the comparison table; the exclusion and
repeat-before-candidate ranking are gone; `assessComparability` reads the seats; `anyDegraded` now means
exactly *"one grader did not grade every arm"*. `gradersPerCell` 2 → 1, projection 90/180 → 75/150. No
provider call was made. Orchestrator's review: **ACCEPTED, first round** — RED 4/48 at base → GREEN 50/50
×3, mutants 3/1/8/5 red, neighbour green, typecheck 0 on BOTH the root and the acceptance projects at base
and tip (SDD ledger :125–:127). STRENGTH: entailed.
**Three rulings travelled with it, each a V row** (`V-DECISIONS-PACKET.md`, 2026-09-16 section A):
`BLIND-GRADING-DEGRADED` and `GRADER-REPEATS-IDENTITY` retired as harness-local; `gradersPerCell` = 1
supersedes the goal's "2 graders" clause; and **F-W1-1 — no register row nominates the grader**, so the
choice is sorted-first until V seals one.
