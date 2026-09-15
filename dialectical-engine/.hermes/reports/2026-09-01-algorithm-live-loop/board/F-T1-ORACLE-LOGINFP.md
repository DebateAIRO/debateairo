# [claude@opus-5] F-T1-ORACLE-LOGINFP · T1's depth oracle false-positives on dev's LoginFlow six-slot array

```yaml
state:
  ticket: F-T1-ORACLE-LOGINFP
  risk_tier: medium
  status: done # 14:06 2026-09-07 SUPERSEDED by F-T1-ORACLE-EVALUATOR (V's ruling D68: the real evaluator, not the filename exemption); the parked lane lane/t1-oracle-loginfp does not land; its worktree is removed at closure
  owner: { agent: claude, session: agent-adbd0d2febcc0e928 }
  contract: { allowed: [tests/unit/s1-1-depth-contract.test.ts], readonly: [apps/ui (dev's LoginFlow.tsx:252)], forbidden: all_others, verification: [RED on the reconciled tree (the oracle names LoginFlow.tsx:252) → GREEN with the real depth sites still caught; a planted six-literal that IS a depth bound still dies; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp, branch: lane/t1-oracle-loginfp, merge_status: none, base: 2af816f1, tip: 60641339 }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: w5-r3-2026-09-05
```

Filed by lane/devsync round 3 (cross-lane, deliberately not fixed there — the file is outside W5's contract and the fix is a sensitivity change to T1's detector). On the dev-reconciled tree the oracle in `tests/unit/s1-1-depth-contract.test.ts` reads dev's six-slot login array at `LoginFlow.tsx:252` as an exclusive-six depth bound; neither parent is red on it because the array exists only on dev and the oracle only on the mission branch. Two of W5's three appeared names follow from it. **Owner: T1/W3's lexer.** Must land on BOTH trees (the mission branch via a lane → integration; the reconciled line via transfer). Wait for codex W5 r2 Q3 to confirm it is a defect and not a legitimate catch before dispatch.
