# [claude@opus-5] F-S11-4 · the CANDIDATE-CONFIG refusal was NOT extended by V's ruling — V's call

```yaml
state:
  ticket: F-S11-4
  risk_tier: medium
  status: done # CLOSED. Fixed in S11 r3: the refusal is gone, a one-identity deployment yields one arm with the reduction marked and the projection revised, end-to-end path filed with 0 provider calls
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
  comments_read_through: v-s11-rulings-2026-09-03
```

V ruled on the BLIND-GRADER pool: degrade and disclose rather than refuse. The S11 seat applied
that exactly and then stopped, which was right. A second refusal in the same harness,
`EVAL_CANDIDATE_CONFIGS_INSUFFICIENT`, still hard-refuses when fewer than three provider
identities are sealed — so on a one- or two-identity deployment T15 still cannot run at all,
which is the same situation V's ruling addressed for graders.

The seat notes that goal lines 91-93 already permit identical synthesizer/evaluator refs (J7
warns rather than refuses), so the degrade-and-disclose policy is straightforwardly available
here too. It filed the question rather than deciding it, because V ruled the grader pool and
said nothing about candidate configs, and a seat extending a ruling by analogy is how scope
creeps.

Its full class sweep of all SEVEN refusals in the harness, each with its disposition, is in
`agent-reports/s11-eval-harness.md` §7.

**Question for V:** extend the same degrade-and-disclose treatment to the candidate-config
refusal, or leave it refusing below three identities?
