# [claude@opus-5] F-S8-TRANSPORT-AMBIGUOUS-RED · the s8 transport-ambiguous test dies in projection before it tests the ambiguous commit

```yaml
state:
  ticket: F-S8-TRANSPORT-AMBIGUOUS-RED
  risk_tier: low
  status: done # 09:41 2026-09-09 codex r1 APPROVE at 0b2ca886 (first round, 0 blocking); merged into dev e2adf68b (D70)
  owner: { agent: claude, session: known-reds-worker }
  contract: { allowed: [tests/integration/s8-publication-database.test.ts (the test "preserves a committed corpus key when the publish result is transport-ambiguous" at :1678–:1730 only — its fixture, not its assertions)], readonly: [apps/api/src/publications.ts, /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/dev-merge/16-full-suite-dev-169941c6.log, /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/small-trio/r0-05-erasure-s8-publication.log, /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log], forbidden: all_others, verification: [RED first: the present failure "Cannot read properties of undefined (reading 'map')" reproduced from the test alone; after: the publish reaches the proxied repository, the test rejects with SIMULATED_AMBIGUOUS_COMMIT, the snapshot row exists and the corpus key reads back; the assertions at :1712–:1730 unchanged; the file's other 25 tests unchanged and green; product untouched], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-known-reds, branch: lane/known-reds, merge_status: merged-into-dev-e2adf68b }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: small-trio-r1-2026-09-08
```

**Filed from codex small-trio r1, ticket candidate 1 (verdict 2026-09-08; filed by the orchestrator 2026-09-09 after source reads).** `tests/integration/s8-publication-database.test.ts:1678` (`it("preserves a committed corpus key when the publish result is transport-ambiguous")`) builds its `answer` fixture at `:1706–:1711` cast `as never`, and the fixture has no `nodes` and no `edges`. `apps/api/src/publications.ts:246–247` maps `input.answer.nodes` and `input.answer.edges` into the public projection BEFORE it calls the repository's `publish`, so the proxied `publish` at `:1684` (which commits and then throws `SIMULATED_AMBIGUOUS_COMMIT`) is never reached. The assertion at `:1712` expects that message and gets `Cannot read properties of undefined (reading 'map')`. The `as never` cast is what hid the omission from the compiler.

**History:** red on every full-suite run in this mission — final gate `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/dev-merge/16-full-suite-dev-169941c6.log:4623`, the small-trio lane gate `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/small-trio/r0-05-erasure-s8-publication.log` (1 failed / 25 passed), W5 `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log:44442`. Adjudicated at `DECISIONS.md:1133` (D23 ADDENDUM-5, 2026-09-02) as an incoming dev regression that fails identically on a pristine `b5a6b6eb`, and carried as a known red in every attribution since — but no board ticket named it before this one (codex's read-only board search and mine found none).

**Outcome:** the fixture supplies what the current Answer contract requires (at least `nodes` and `edges` in the shapes `redactNodeForPublic`/`redactEdgeForPublic` accept), so the publish reaches the proxied repository and the test fails for its intended reason — `SIMULATED_AMBIGUOUS_COMMIT` — and then runs its corpus-key readback control. The assertions stay as they are; the corpus-key preservation under an ambiguous commit is the thing this test guards. If the seat finds the projection, not the fixture, is what is wrong (the Answer contract makes `nodes`/`edges` optional and the product must tolerate their absence), that is product work outside this contract: say so and stop.

**Why it matters:** the "known red" has been an identity check on every gate since 2026-09-02; once green, the attribution step in every lane gets one row shorter and the s8 corpus-key guarantee is actually exercised again.
