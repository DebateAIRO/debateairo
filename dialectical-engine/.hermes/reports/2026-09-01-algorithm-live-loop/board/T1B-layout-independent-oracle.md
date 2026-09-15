# [claude@opus-5] T1B · a layout-independent depth-ceiling oracle (V-T1-r3-1)

```yaml
state:
  ticket: T1B
  risk_tier: medium          # the oracle guards the single-source depth ceiling; T1's product is converged
  status: done # LANDED with W3's merge at fd3bf47a. tests/unit/s1-1-depth-contract.test.ts (739 lines) is in integration, unmodified from lane/t1, and green there
  owner: { agent: claude, session: opus-t01-w1b }
  contract:
    allowed:
      - the lane worktree /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1 (branch lane/t1; local commits, never push)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t01-depth.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t01-depth-self.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t01/**
    readonly:
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T1-codex-r3.md (B1 verbatim, line 35)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md (D51, D53, D56)
    forbidden: all_others (T1's converged product semantics are frozen; this ticket changes the ORACLE, not the ceiling)
    verification: [codex static review, judge verdict + D15 batch suite]
    human_review: no
  worktree: { path: .worktrees/lane-t1, branch: lane/t1, merge_status: merged@fd3bf47a }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-codex-r3-2026-09-02
```

## Charge

The single-source DoD oracle is LINE-SCOPED: it requires the `depth` token and the literal
ceiling on the same line. The reviewer reproduced three evasions that are ordinary formatting,
not contrivances — a multiline Zod chain putting `depth` on the declaration line and `.lte(5)`
on a later one; a refinement splitting `d.depth >` from `5`; and a multiline `[1, 2, 3, 4, 5]`
enumeration.

Replace the line scan with an oracle that does not depend on layout: parse the construct (or
otherwise analyse the declaration as a unit) so a ceiling expressed across lines is found. The
three evasions above become RED-first tests: each must FAIL against the current oracle and pass
after.

**This ticket changes the ORACLE, not the ceiling.** T1's product converged and its semantics
are frozen; do not re-open them.

## Note on scale

`lane/t1` is 102 commits behind integration — the largest catch-up of any remaining lane. The
merge-in is expected to be the bulk of the work and is NOT charged as rework.
