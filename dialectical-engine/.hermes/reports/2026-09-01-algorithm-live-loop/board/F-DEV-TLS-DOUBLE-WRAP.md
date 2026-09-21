# [claude@opus-5] F-DEV-TLS-DOUBLE-WRAP · DevTlsFrontDoorError double-wraps its cause, truncating the DEV_ code chain

```yaml
state:
  ticket: F-DEV-TLS-DOUBLE-WRAP
  risk_tier: low
  status: done # 21:34 2026-09-07 codex r1 APPROVE at a440ec6f; merged into dev 169941c6 (D70)
  owner: { agent: claude, session: diag-tail-worker }
  contract: { allowed: [deploy/dev-auth/tls-front-door.mjs (the throw at :288 only, or the constructor at :33–34 — one of the two, say which), the test that covers the dev TLS front door], readonly: [apps/runner/src/dev-auth-stack.ts (the joiner), tests/unit/dev-auth-stack.test.ts], forbidden: all_others, verification: [RED: the joined chain from a real front-door failure reaches its inner DEV_ code; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-tail, branch: lane/diag-tail, merge_status: merged-into-dev-169941c6 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-class-a-2026-09-07
```

**Filed from the diag-class-a seat's finding 2 (2026-09-07).** `deploy/dev-auth/tls-front-door.mjs:288` calls `new DevTlsFrontDoorError("DEV_TLS_FRONT_DOOR_START_FAILED", { cause: error })` while the constructor at `:33–34` already wraps (`super(code, cause === undefined ? undefined : { cause })`), so `error.cause` becomes a plain object `{ cause: <real error> }` and the cause-chain walk in `developmentAuthStackErrorCode` (apps/runner/src/dev-auth-stack.ts) stops one level short — the inner DEV_ code never joins. **Outcome:** one wrap, the chain intact, pinned by a test. Out of the diag-class-a lane's contract (the file was in neither allowed nor readonly — an orchestrator packet defect, self-charge #45).

**Codex diag-class-a r1 (18:13 2026-09-07):** the same double-wrap exists at `tls-front-door.mjs:263` as well as `:288`; both sites belong to this ticket.
