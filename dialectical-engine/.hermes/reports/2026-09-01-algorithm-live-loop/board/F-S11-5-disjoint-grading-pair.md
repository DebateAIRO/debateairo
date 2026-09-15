# [claude@opus-5] F-S11-5 · a valid role comparison needs arms and panel DISJOINT — register work

```yaml
state:
  ticket: F-S11-5
  risk_tier: medium
  status: done # CLOSED by V-S11-GRADER 2026-09-03 — DISSOLVED, not deferred. V ruled ONE fixed grader for every arm, so grader identity is constant and cannot correlate with the arm. Reserving a disjoint pool solved a problem this architecture does not have
  owner: { agent: unassigned, session: n/a }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [V decision first]
    human_review: yes
  worktree: { path: n/a, branch: n/a, merge_status: n/a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: 2026-09-03
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: s11-r3-2026-09-03
```

Codex r2 B2 established that a warning does not restore comparability: complement grading made
grader identity a deterministic function of the arm, so the arm means were confounded. The S11
seat fixed the REPORTING half — when panels differ the table now renders no pooled mean and no
ranking, only per-grader observation counts, under a statement that no role choice can be
inferred, with a test feeding scores of 5 and 1 and asserting neither appears as a statistic.

The seat then found what the ESTIMATOR half actually requires, by fixing its own broken fixture:
**the arms and the grading panel must be DISJOINT.** As long as every sealed identity is eligible
to be both a candidate role and a grader, some arm will always be graded by a panel that differs
from another arm's, and no amount of seating logic removes it.

That is not something a lane can implement. It asks the DEPLOYMENT to seal a reserved grading
pair — identities held out of the candidate matrix entirely — which is register and configuration
work.

**Question for V:** seal a reserved grading pair so the comparison becomes valid, or accept that
T15b reports per-arm observations without a cross-arm ranking? The harness is correct either way;
only the second question the table can answer changes.
