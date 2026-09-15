# [claude@opus-5] F-DIAG-OPERATIONAL-REGEX · two operational-error formatters forward caught messages through the uppercase-shape regex codex rejected

```yaml
state:
  ticket: F-DIAG-OPERATIONAL-REGEX
  risk_tier: medium
  status: done # 17:24 2026-09-07 codex r1c APPROVE at d797d805 (two rework rounds); merged into dev 1fc2dece (D70)
  owner: { agent: claude, session: diag-bounded-worker }
  contract: { allowed: [apps/api/src/index.ts (apiOperationalErrorDiagnostic at :80 and its call at :480), apps/runner/src/index.ts (runnerTerminalFailureReason at :4416), one unit test per formatter], readonly: [apps/api/src/risk-signal-identity.ts (the landed pattern: explicit map + fixed fallback), agent-reports/risk-signal-diagnostics.md (the class sweep), logs/risk-signal-diagnostics/02-sweep.log], forbidden: all_others, verification: [RED: synthetic sensitive content in name/code/message never reaches the formatted line; known constants still map by name; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-bounded, branch: lane/diag-bounded, merge_status: merged-into-dev-1fc2dece }
  authority_epoch: 1
  rework_round: 2
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: risk-signal-diagnostics-2026-09-07
```

**Filed from the risk-signal-diagnostics seat's class sweep (2026-09-07), Class A, members 2 and 3.** `apps/api/src/index.ts:80` `apiOperationalErrorDiagnostic` returns `record.message` when it matches `/^[A-Z][A-Z0-9_]{2,63}$/u` and forwards `DEPENDENCY_${record.code}`; its output is logged at `index.ts:480` on every 5xx. `apps/runner/src/index.ts:4416` `runnerTerminalFailureReason` is the identical regex pair. This is exactly the shape codex's sessions-argon2 r1 F2 rejected as weaker than an explicit map (a constant-shaped message is not a known constant). **Outcome:** the pattern landed in `apps/api/src/risk-signal-identity.ts` — an explicit map from known reason constants and recognized categories/codes to bounded text, a fixed fallback — applied to both formatters, each pinned by a test that feeds sensitive content into every field. STRENGTH: entailed for the shapes (read from source by the seat); undetermined for any disclosure today.

**Correction (16:09 2026-09-07):** the api call site is `:485`, not `:480` (the seat read it; the packet had it right).
