# [claude@opus-5] F-SEALEDROWS-F · two mission tools are coupled by a human sentence

```yaml
state:
  ticket: F-SEALEDROWS-F
  risk_tier: low             # fail-closed: the failure direction is INVALID, never false credit
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-codex-r4-2026-09-04
```

Volunteered by the seat as a standing counter to its own fix, then confirmed by codex r4 as N1.

`mutant-index.py:104-124` recognises a valid pre-gate collision by matching `mutate.sh`'s refusal
SENTENCE — `NEW token already present`. Reword that sentence and the same stamped, positive-pre,
never-applied refusal is reported INVALID.

**Fail-closed**, so no mutant ever receives false credit, which is why codex classified it
FOLLOW-UP rather than blocking. It is still an unenforced interface between two mission tools that
every lane uses.

**Fix:** emit and parse a machine-readable code such as `ABORT_CODE=NEW_TOKEN_PRESENT`, keep the
sentence for humans, and add one producer/consumer fixture so a wording change cannot alter
classification.
