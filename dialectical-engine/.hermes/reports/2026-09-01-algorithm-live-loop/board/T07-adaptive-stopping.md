# [claude@opus-5] T7 · adaptive stopping (S3-2, S5-1)

```yaml
state:
  ticket: T7
  risk_tier: high            # the stopping rule IS scoring semantics (floor); J3 leverage ruling governs
  status: waiting_product_proof # MERGED into integration 44836ecf (2026-09-02 15:2x EEST) after codex merge review (1 evidence finding, repaired with a log that destroys the ignored artifacts and shows them absent before regenerating); product proof = the next D15 batch · b13 14:11 2026-09-05 on 1485b9e2: 22 red = 21 T0 stable-red + 1 NEW (F-T17T9-3, V's decision); 0 load failures; FAIR-02 VANISHED from red. Not green by the closed-list rule; closes on b14 after V's F-T17T9-3 call
  owner: { agent: claude, session: opus-t07-w5b }
  contract:
    allowed:
      - the lane worktree /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t7 (branch lane/t7 off integration 7433be7; local commits, never push)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t07-stopping.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t07-stopping-self.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t07/**
    readonly:
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S05-stopping/SPEC.md (frozen; T7 = goal lines 169-186)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F2-t7-leverage-definition.md (J3 ruling: leverage is ROOT-SCOPED, reading (b))
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md (J3 + J2 refit duty + fleet laws)
    forbidden: all_others (δ/ε VALUES come from T16's sealed rows, never code constants; T6's outcome surface is not yours; no serve/selection work)
    verification: [codex static review, judge verdict + D15 batch suite]
    human_review: no
  worktree: { path: .worktrees/lane-t7, branch: lane/t7, merge_status: merged }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t7b-codex-2026-09-02
```
