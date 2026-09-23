# [claude@opus-5] F-H-1 · the lifecycle test still expects the binary label T11 deleted

```yaml
state:
  ticket: F-H-1
  risk_tier: low             # test-only; the product is correct and the frozen goal names this exact retirement
  status: done # MERGED at 3d137d64 with F-H-2. The lifecycle test, red since T0, is 87/87 whole file — green for the right reasons, both causes closed in one lane
  owner: { agent: claude, session: lane-h-diag }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review — must ALSO verify the h-diag diagnosis it rests on], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag, branch: lane/h-diag, merge_status: merged@3d137d64, base: d08ee928, tip: a81ada2a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: 2026-09-05
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: h-diag-r1-2026-09-05
```

From the lane/h-diag diagnosis (`agent-reports/h-diag.md`), verdict **STALE TEST**, orchestrator-
verified on three claims. The deciding measurement, from the failing run's own persisted receipt:

```
margin:       { kind: ABSENT, reason: SINGLE_SERVABLE_ROOT }     candidateCount: 1
disagreement: { kind: ABSENT, reason: FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS }
verdictLabel: { rung: 0, label: CONTESTED, trigger: BASIS_INCOMPLETE, basisAbsence: [MARGIN, DISAGREEMENT] }
```

**Both** limbs absent. `SUPPORTED` lives at rung 3, reachable only after rung 0 declines, which
needs both limbs MEASURED. The fixture is `agentCount=1, depth=1`: one maker → one root → no
runner-up; one judge → dispersion NULL. **`SUPPORTED` is unreachable by construction** — no
register value changes that. The same test block asserts `SINGLE-LINEAGE` and
`CRITIQUE-UNAVAILABLE`, which pass: it contradicts itself.

The expectation predates T11 (`7e5ac0d7`, 2026-09-01) and T11 never revisited it. Before T11,
`deriveHonestVerdict` was binary — `SUPPORTED` meant only "an answer was served" — and the frozen
goal names that function as the thing to delete, placing "the mono-maker skeleton" in rung 0 by
name. The retired assertion's real content is carried today by `verdict_unavailable: null`, which
still passes.

**Fix:** replace `verdict_state: 'SUPPORTED'` with the ladder's actual output for this fixture —
`CONTESTED` plus the `LABEL-BASIS-INCOMPLETE` mark — and say in the assertion WHY (single maker,
single judge, rung 0 by design). Do not touch the fixture to manufacture a runner-up; a
single-root run is a legitimate shape and the test should pin what it serves.
