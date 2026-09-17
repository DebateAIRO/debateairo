# [claude@opus-5] F-ORACLE-CORPUS-COUNT · the depth oracle pins the shipped-file count at 232; a landed shipped file makes it 233 and turns a dev row red

```yaml
state:
  ticket: F-ORACLE-CORPUS-COUNT
  risk_tier: medium
  status: done # 20:43 2026-09-07 codex r1b APPROVE at 4e5f9327 (one rework round); merged into dev 7ab208f2 (D70)
  owner: { agent: claude, session: dev-health-worker }
  contract: { allowed: [tests/unit/s1-1-depth-contract.test.ts (the corpus-count assertion at :377 and its expected value only)], readonly: [logs/diag-class-a/codex-r1-verdict.final-snapshot.md], forbidden: all_others, verification: [the assertion derives the expected count from a committed manifest of shipped files (or from the census instrument) so that adding a shipped file is a deliberate manifest change, not a silent red; the row green on dev; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-dev-health, branch: lane/dev-health, merge_status: merged-into-dev-7ab208f2 }
  authority_epoch: 1
  rework_round: 1
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-class-a-r1-2026-09-07
```

**Filed from codex diag-class-a r1's wider-suite attribution (2026-09-07).** `tests/unit/s1-1-depth-contract.test.ts:377` ("parses every shipped file with no syntactic diagnostic") expects 232 scanned files; dev has 233 since d5b4f7f5 landed `apps/api/src/risk-signal-identity.ts` (a new shipped file). Independent enumeration: 232 at 70647e7e, 233 at 1fc2dece. This row is RED on dev now and is NOT in the last dev gate (taken at 70647e7e) — it will appear in the final gate. **Outcome:** the pin becomes a committed manifest (or the census instrument's own count) so that a new shipped file is an explicit change; the row green. STRENGTH: entailed (codex's tree enumeration).
