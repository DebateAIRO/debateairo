# [claude@opus-5] F-DIAG-SHARED-MODULE · the operational-diagnostic policy is duplicated in api and runner; move it to one neutral module

```yaml
state:
  ticket: F-DIAG-SHARED-MODULE
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [packages/diagnostics/ (new package: src/operational-error.ts, package.json, tsconfig, index), apps/api/package.json, apps/runner/package.json, pnpm-lock.yaml (tool-generated), apps/api/src/index.ts (replace the twin block with the import), apps/runner/src/index.ts (same; the RUNNER_EXECUTION_FAILED prefix stays in its wrapper), tests/unit/api-operational-error.test.ts, tests/unit/dev-runner-reconciliation.test.ts, a unit test for the shared module], readonly: [apps/api/src/risk-signal-identity.ts], forbidden: all_others, verification: [the twin-copy test replaced by one module test; outputs byte-identical to the duplicated version for the whole alphabet (a golden comparison); typecheck identical; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-bounded-r1-2026-09-07
```

**Filed from codex diag-bounded r1's twin-copy ruling (2026-09-07, non-blocking).** The closed diagnostic alphabet (allow-lists + helper) is duplicated byte-for-byte in `apps/api/src/index.ts` and `apps/runner/src/index.ts`, guarded by a byte-identity test, because the lane's packet forbade a shared module (an orchestrator packet defect: codex's charge 2). **Outcome:** one neutral module, e.g. `packages/diagnostics/src/operational-error.ts`, with its package/export wiring and both app dependencies granted together; the runner keeps its prefix in its wrapper; the duplicated blocks and the twin-copy test removed; outputs proven identical by a golden comparison over the whole alphabet.

**Codex diag-bounded r1c qualification (17:24 2026-09-07):** the committed expected lists (398 domain codes, 215 message constants) are independently STORED, not independently DERIVED — one extractor feeds the citations, the list and the map. When the module is extracted: describe the lists as drift snapshots, and refresh them only with a SEPARATE producer audit (a second derivation, e.g. a syntax-tree walk distinct from the regex sweep).
