# BASELINE — mission `debate-tiers` (the authority for every "is it green?" claim; assert the DELTA, never the absolute)

Measured 2026-09-09 by the lane setup (`.hermes/reports/debate-tiers/logs/setup-worktrees.sh`) on both lanes at `dev` @ `7f89f7b7`, fresh clones with node_modules APFS-cloned from the main tree and `generate:contract` run. Re-measure before you lean on a row; a seat whose run overlaps a re-measure re-reads this file before handoff.

## Lane `tiers-s01` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine`, branch `slice/tiers-s01`)

- HEAD `7f89f7b7` on `slice/tiers-s01`
- node_modules: 31 trees cloned; node_modules is a real dir
- `pnpm run generate:contract` rc=0; `packages/contract/generated/client.ts` PRESENT
- `pnpm typecheck` rc=1; diagnostics by file (count · file):
  - 1 apps/api/src/main.ts
  - 1 apps/api/src/support/answer.ts
  - 1 apps/runner/src/support-status-cli.ts
  - 1 tests/acceptance/obs-agent-03-fixture.ts
  - 2 tests/acceptance/obs-agent-04-fixture.ts
  - 1 tests/acceptance/obs-agent-06-fixture.ts
  - 1 tests/architecture/obs-agent-06-copy.test.ts
  - 15 tests/architecture/register-support-publication.test.ts
  - 9 tests/architecture/sup-04-mounts.test.ts
  - 2 tests/integration/obs-agent-01-delivery.test.ts
  - 1 tests/integration/obs-agent-03-fixture.test.ts
  - 1 tests/integration/obs-agent-04-gap-drill.test.ts
  - 4 tests/integration/obs-agent-04-not-wired.test.ts
  - 1 tests/integration/obs-agent-05-connection-drill.test.ts
  - 1 tests/integration/obs-agent-05-docker.test.ts
  - 3 tests/integration/obs-agent-06-status.test.ts
  - 1 tests/integration/obs-agent-06-views.test.ts
  - 8 tests/unit/obs-agent-01-discovery.test.ts
  - 1 tests/unit/obs-agent-01-status-projections.test.ts
  - 5 tests/unit/obs-agent-05-lifecycle.test.ts
  - 2 tests/unit/obs-agent-05-postgres.test.ts
  - 8 tests/unit/s14-ui.test.ts
- `tests/render/ux01-new-debate-form.test.tsx` → rc=1 · Tests  7 failed | 1 passed (8)
- `tests/unit/v2ui-pages.test.ts` → rc=1 · Tests  5 failed | 36 passed (41)
- `tests/architecture/s14-contract.test.ts` → rc=1 · Tests  3 failed | 2 passed (5)
- `tests/render/sup-04-widget.test.tsx` → rc=0 · Tests  8 passed (8) — measured 21:00 (REQ-REV-p1 N3; `logs/baseline-n3-<lane>.log`)
- `tests/architecture/sup-04-mounts.test.ts` → rc=1 · Tests  2 failed (2) = 0 passed / 2 — RED at base, inherited: "admits exactly the four product-route importers" and "keeps the root layout and every zone route structurally support-free" (the same file carries 9 typecheck diagnostics above) — measured 21:00 (N3)
- `tests/unit/evaluator-dev-menu-ui.test.ts` → rc=0 · Tests  2 passed (2) — measured 21:00 (N3)
- `tests/unit/v2ui-data-layer.test.ts` → rc=0 · Tests  57 passed (57) — measured 21:02 (REQ-REV-p1 B2; `logs/baseline-b2-<lane>.log`); line numbers cited by any SPEC are the LANE copy — the main tree's copy carries +41 lines of another mission
- `tests/unit/pol01-policy.test.ts` → rc=0 · Tests  8 passed (8) — measured 21:02 (B2)
- `git status --porcelain | wc -l` after setup / after baseline: 0 / 0

## Lane `tiers-s02` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine`, branch `slice/tiers-s02`)

- HEAD `7f89f7b7` on `slice/tiers-s02`
- node_modules: 31 trees cloned; node_modules is a real dir
- `pnpm run generate:contract` rc=0; `packages/contract/generated/client.ts` PRESENT
- `pnpm typecheck` rc=1; diagnostics by file (count · file):
  - 1 apps/api/src/main.ts
  - 1 apps/api/src/support/answer.ts
  - 1 apps/runner/src/support-status-cli.ts
  - 1 tests/acceptance/obs-agent-03-fixture.ts
  - 2 tests/acceptance/obs-agent-04-fixture.ts
  - 1 tests/acceptance/obs-agent-06-fixture.ts
  - 1 tests/architecture/obs-agent-06-copy.test.ts
  - 15 tests/architecture/register-support-publication.test.ts
  - 9 tests/architecture/sup-04-mounts.test.ts
  - 2 tests/integration/obs-agent-01-delivery.test.ts
  - 1 tests/integration/obs-agent-03-fixture.test.ts
  - 1 tests/integration/obs-agent-04-gap-drill.test.ts
  - 4 tests/integration/obs-agent-04-not-wired.test.ts
  - 1 tests/integration/obs-agent-05-connection-drill.test.ts
  - 1 tests/integration/obs-agent-05-docker.test.ts
  - 3 tests/integration/obs-agent-06-status.test.ts
  - 1 tests/integration/obs-agent-06-views.test.ts
  - 8 tests/unit/obs-agent-01-discovery.test.ts
  - 1 tests/unit/obs-agent-01-status-projections.test.ts
  - 5 tests/unit/obs-agent-05-lifecycle.test.ts
  - 2 tests/unit/obs-agent-05-postgres.test.ts
  - 8 tests/unit/s14-ui.test.ts
- `tests/render/ux01-new-debate-form.test.tsx` → rc=1 · Tests  7 failed | 1 passed (8)
- `tests/unit/v2ui-pages.test.ts` → rc=1 · Tests  5 failed | 36 passed (41)
- `tests/architecture/s14-contract.test.ts` → rc=1 · Tests  3 failed | 2 passed (5)
- `tests/render/sup-04-widget.test.tsx` → rc=0 · Tests  8 passed (8) — measured 21:00 (REQ-REV-p1 N3; `logs/baseline-n3-<lane>.log`)
- `tests/architecture/sup-04-mounts.test.ts` → rc=1 · Tests  2 failed (2) = 0 passed / 2 — RED at base, inherited: "admits exactly the four product-route importers" and "keeps the root layout and every zone route structurally support-free" (the same file carries 9 typecheck diagnostics above) — measured 21:00 (N3)
- `tests/unit/evaluator-dev-menu-ui.test.ts` → rc=0 · Tests  2 passed (2) — measured 21:00 (N3)
- `tests/unit/v2ui-data-layer.test.ts` → rc=0 · Tests  57 passed (57) — measured 21:02 (REQ-REV-p1 B2; `logs/baseline-b2-<lane>.log`); line numbers cited by any SPEC are the LANE copy — the main tree's copy carries +41 lines of another mission
- `tests/unit/pol01-policy.test.ts` → rc=0 · Tests  8 passed (8) — measured 21:02 (B2)
- `git status --porcelain | wc -l` after setup / after baseline: 0 / 0

## Rules

- `tests/architecture/s14-contract.test.ts` is RED at base (3 failed / 2 passed) on BOTH lanes — inherited, never claimed; a seat whose work touches the contract states the delta on that suite explicitly (which cases, which direction).
- `pnpm typecheck` is RED at base; every gate asserts no NEW diagnostic outside the pinned files above.
- The MAIN tree is not a baseline surface: it carries 97 uncommitted entries from other missions.
- Both lanes are byte-identical to the commit; 0 dirty entries after setup and after the baseline run.
- `tests/architecture/sup-04-mounts.test.ts` is RED at base (0 passed / 2) on BOTH lanes — inherited from the support-publication work, never claimed; a gate reports it as `0/2 pre-existing` and asserts no NEW failure.
- Every suite a SPEC names has a row above (both lanes); a suite without a row is a finding against the orchestrator, measured before the first RED test of the cluster that touches it.
- The five rows added 2026-09-09 21:00–21:02 (N3 + B2) were measured by `logs/baseline-n3.sh` and `logs/baseline-b2.sh` with 0 dirty entries before and after in each lane.
- From 21:40 on this file grows ONLY at its end (`## Rows added after intake`); nothing above that heading moves again. Cite the pinned typecheck lists by lane heading and date, never by bare line number (the 21:00 mid-file inserts shifted every S02 citation by five lines — REQ-FIX-p2 finding (b)).

## Rows added after intake (both lanes at `7f89f7b7`; measured by `logs/baseline-x.sh`, 0 dirty entries before and after)

### Lane `tiers-s01`
- `tests/unit/t9-mode-tokens.test.ts` → rc=1 · Tests  2 failed | 7 passed (9) — RED at base, inherited from the UI-overhaul T9 work: "renders one accessible toggle that reads the document mode, flips it, and persists it" and "leaves no mode-inert colour literal in the four Wave-0 product files"; a gate reports `7/9 pre-existing` and asserts no NEW failure — measured 21:40 (REQ-FIX-p2 (a); `logs/baseline-x-<lane>.log`)
- `tests/render/prov01-honesty-drawer.test.tsx` → rc=0 · Tests  1 passed (1) — asserts the honesty phrase verbatim at `:41`; row V-14 decides whether the phrase moves — measured 21:40 (REQ-FIX-p2 (c))

### Lane `tiers-s02`
- `tests/unit/t9-mode-tokens.test.ts` → rc=1 · Tests  2 failed | 7 passed (9) — RED at base, inherited from the UI-overhaul T9 work: "renders one accessible toggle that reads the document mode, flips it, and persists it" and "leaves no mode-inert colour literal in the four Wave-0 product files"; a gate reports `7/9 pre-existing` and asserts no NEW failure — measured 21:40 (REQ-FIX-p2 (a); `logs/baseline-x-<lane>.log`)
- `tests/render/prov01-honesty-drawer.test.tsx` → rc=0 · Tests  1 passed (1) — asserts the honesty phrase verbatim at `:41`; row V-14 decides whether the phrase moves — measured 21:40 (REQ-FIX-p2 (c))

### Rows added 22:06 (REQ-REV-p2 N2 — the suites the requirements themselves will turn RED; measured by `logs/baseline-n2.sh`, both lanes at `7f89f7b7`)

#### Lane `tiers-s01` (lane=tiers-s01 HEAD=7f89f7b7 dirty=0; dirty after: 0)
- `tests/integration/evaluator-database.test.ts` → rc=0 · Tests  21 passed (21)
- `tests/unit/api.test.ts` → rc=0 · Tests  24 passed (24)
- `tests/unit/contract.test.ts` → rc=0 · Tests  7 passed (7)
- `tests/unit/load01-live-proof.test.ts` → rc=0 · Tests  1 passed (1)
- `tests/unit/s7-authorization.test.ts` → rc=0 · Tests  31 passed (31)

#### Lane `tiers-s02` (lane=tiers-s02 HEAD=7f89f7b7 dirty=0; dirty after: 0)
- `tests/integration/evaluator-database.test.ts` → rc=0 · Tests  21 passed (21)
- `tests/unit/api.test.ts` → rc=0 · Tests  24 passed (24)
- `tests/unit/contract.test.ts` → rc=0 · Tests  7 passed (7)
- `tests/unit/load01-live-proof.test.ts` → rc=0 · Tests  1 passed (1)
- `tests/unit/s7-authorization.test.ts` → rc=0 · Tests  31 passed (31)

### Rows added 22:32 (ARCH(S02) F-4 — inside SPEC R13's `resolveDiscoveredPanel` grep class; measured by the orchestrator, both lanes at `7f89f7b7`, 0 dirty before and after)
- lane `tiers-s01`: `tests/integration/register-version-boundaries.test.ts` → rc=0 · Tests  6 passed (6) (`logs/baseline-f4-tiers-s01.log`)
- lane `tiers-s02`: `tests/integration/register-version-boundaries.test.ts` → rc=0 · Tests  6 passed (6) (`logs/baseline-f4-tiers-s02.log`)

### Rule added (ARCH(S01) F4) — a slice's baseline covers every suite that READS a file the slice writes, not only the suites a requirement names; the rows below are the S01 read-surface sweep

