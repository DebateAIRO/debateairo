# [claude@opus-5] W2 · emit the mark when synthesizer and evaluator share an identity (F-VS11-1)

```yaml
state:
  ticket: W2
  risk_tier: high
  status: queued
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

When a deployment seals the synthesizer and evaluator as the same provider identity the debate
proceeds correctly, but the reader is never told — the warning goes to a server log and appears
nowhere in the served answer. The condition mark that would say it already exists in the vocabulary
and is already rendered in the UI as 'Model diversity degraded'. **Nothing in the codebase emits it.**

**Charge:** emit that mark on the served answer whenever the synthesizer and evaluator resolve to the
same provider identity, carrying which roles collapsed onto which identity. The mark, its UI label
and the detection all exist; only the emission is missing.

V ruled this is required: after V-S11-1 and V-S11-GRADER, same-identity operation is LEGITIMATE, and
disclosure is what keeps it honest. A vocabulary member with a label and no producer is a promise the
system does not keep.
