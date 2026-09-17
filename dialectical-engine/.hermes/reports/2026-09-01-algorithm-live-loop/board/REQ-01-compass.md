# [claude@opus-5] REQ-01 · mission compass + slice SPECs (zero-drift transcription)

```yaml
state:
  ticket: REQ-01
  risk_tier: low
  status: done               # judged PASS 2026-09-01 (J4): zero-drift corroborated; 5 findings routed to F2-F6
  owner: { agent: claude, session: opus-req01-w0 }
  contract:
    allowed:
      - .hermes/reports/2026-09-01-algorithm-live-loop/INSTRUCTIONS.md
      - .hermes/reports/2026-09-01-algorithm-live-loop/slices/** (SPEC.md, PLAN.md, PROGRESS.md, DECISIONS.md per slice-map)
      - .hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/req-01.md
      - .hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/req-01-self.md
    readonly:
      - .hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md (sha256 78238eeb… — verify before quoting)
      - .hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md
      - .hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
      - .hermes/reports/2026-09-01-algorithm-live-loop/board/inputs/slice-map.md
      - dialectical-engine source tree @ dev 1c9578a (spot-verification only, no edits)
    forbidden: all_others
    verification: [orchestrator byte-diff of quoted spans vs goal-prompt.md, codex packet+output review, judge verdict]
    human_review: no
  worktree: { path: none (docs under .hermes only), branch: none, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: packet-req01-2026-09-01
```
