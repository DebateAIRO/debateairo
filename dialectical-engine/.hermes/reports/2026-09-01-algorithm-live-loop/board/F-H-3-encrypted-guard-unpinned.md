# [claude@opus-5] F-H-3 · the encrypted half of the new liveness guard is caught by no test

```yaml
state:
  ticket: F-H-3
  risk_tier: medium          # a correct guard resting on an untested property: delete its left operand and an erased owner's encrypted run re-enters the candidate set with a green suite
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
  comments_read_through: h-fix-r1-2026-09-05
```

Found by the lane/h-diag seat closing F-H-2, from §2.4's neighbouring mutant. The new guard at
`packages/liveness/src/index.ts:144` is

```sql
AND (run.content_encryption_version IS DISTINCT FROM 1 OR core.run_private_content_is_live(run.run_id))
```

Mutate `IS DISTINCT FROM 1` to `FROM 2` and **nothing fails** — correctly not the lane's own tests
(they are encryption-off), but **also not the 48-test `s6-content-encryption-database` suite.**
So the encrypted half of the guard is unpinned: delete its left operand and an erased or
deactivated owner's encrypted run re-enters `recordQuery`'s candidate set with a green suite.

The seat's change is correct. The property it rests on is untested, and pinning it needs the s6
identity harness, which was outside the lane's contract.

**The seat's rule, adopted:** the neighbouring-mutant check should be two-sided — confirm your own
test does not catch it, *then find the test that should*, and if there is none, that absence is
the finding.

**Fix:** an s6-harness test that archives an encrypted run under an erased or deactivated owner,
re-asks its question, and asserts it does NOT revive; the `FROM 2` mutant must then die there.
`packages/db/src/index.ts:485` (`assertPrivateContentLive`, unguarded, zero callers) is the same
neighbourhood and the same class — name it in that lane.
