# [claude@opus-5] F-T9-ISSUER-COMMENT · the T9 issuer keeps the withdrawn independence claim in a comment

```yaml
state:
  ticket: F-T9-ISSUER-COMMENT
  risk_tier: low
  status: done # 09:41 2026-09-09 codex r1 APPROVE at 0b2ca886 (first round, 0 blocking); merged into dev e2adf68b (D70)
  owner: { agent: claude, session: known-reds-worker }
  contract: { allowed: [tests/integration/registration-database.test.ts (the two comment lines at :7146–7147 at dev ed804f3c (:7129–7130 at bf4df3a3) only), tests/unit/f-t9-unattended-promises.test.ts (the header comment at :20–25 only)], readonly: [/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/flakes/codex-r1c-verdict.final-snapshot.md], forbidden: all_others, verification: [the comment describes the values as intra-slot delay diagnostics measured on the shared event loop; no code change; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-known-reds, branch: lane/known-reds, merge_status: merged-into-dev-e2adf68b }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: flakes-r1c-2026-09-08
```

**Filed from codex flakes r1c C1 (2026-09-08, non-blocking).** `tests/integration/registration-database.test.ts:7146–7147` (at dev ed804f3c; :7129–7130 when filed at bf4df3a3) still says the cadence values are "recorded before any response is scored, so no arm difference can manufacture or hide it" — the ordering/independence argument the landed policy (`:6775`, "WHY THERE IS NO WAIVER") withdrew: response mappers can assign `score` during issuance and request work shares the issuer's event loop. **Outcome:** the two claims deleted; the values described as intra-slot delay diagnostics on the shared event loop.

**Second item (orchestrator 08:40 2026-09-09, from codex small-trio r1 finding 3, nonblocking):** `tests/unit/f-t9-unattended-promises.test.ts:23–24` says "an unattended rejection ends the child with ERR_UNHANDLED_REJECTION, which no in-process assertion can catch", but the recorded child prints `TypeError: T9_PROBE_INJECTED_REJECTION` without ERR_UNHANDLED_REJECTION (the RED capture under `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/small-trio/red/`), and the landed control asserts the reason, a nonzero status and the absence of JOIN_REPORTED and SURVIVED. Correct the comment to what the child actually shows. `allowed` extended above to that header comment; nothing else in the file.
