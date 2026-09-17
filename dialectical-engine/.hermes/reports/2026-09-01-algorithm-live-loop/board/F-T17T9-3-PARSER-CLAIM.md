# [claude@opus-5] F-T17T9-3-PARSER-CLAIM · the budget parser's 'independent check' is described as more than it checks

```yaml
state:
  ticket: F-T17T9-3-PARSER-CLAIM
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [packages/budget/src/index.ts (comments), tests/unit/t17-envelope.test.ts:461 (comment/assertion text)], readonly: [packages/register/src/index.ts], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-3-codex-r1-2026-09-05
```

Filed by codex (t17t9-3 r1, F4). A receipt with `call_sites.serve` and `serve_leg.synthesis_loop_sites` both set to the same odd positive number passes the parser's positive-integer and equality checks, although the constructor can only mint an even total (equal per-role round bounds). Static, not executed. **Fix:** describe the parser as checking shape, chain identity and disclosed-count consistency — not as proving every accepted receipt could have been minted. If constructor-equivalence is wanted as a runtime contract, derive it through the shared rule; do not remove the runner-derived tests. Offered to lane/t17t9-3 round 3 as comment-only; if the seat does not take it, this ticket stands.

**Codex t17t9-3 r2 F4 (19:56):** PARTIALLY addressed in round 3 — the narrowed additions are accurate, but the original blanket assurance sentence remains in place. This ticket stays open for that sentence.
