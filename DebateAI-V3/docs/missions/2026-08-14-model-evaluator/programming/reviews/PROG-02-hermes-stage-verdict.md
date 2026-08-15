# PROG-02 Hermes stage verdict — `eval-02-foundation`

Mission: `model-evaluator`  
Lane: `codex/eval-02-foundation`  
Verified head: `11ad2f3` on `f11a307`, `ed9336e`  
Verdict: **APPROVED**

## Evidence reviewed

I read the complete available peer-review chain in this directory: round-1 REWORK from Grok and Opus, followed by round-2 PASS from both reviewers. I also read the lane goal packet and Codex self-report, then verified the lane independently rather than relying on reported results.

The review directory contained four peer-review files before this verdict was written; this verdict is its fifth file.

## Independent verification

All commands below ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-02-foundation/DebateAI-V3` unless noted otherwise.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Unit + integration + architecture tests | `pnpm exec vitest run tests/unit tests/integration tests/architecture` | PASS; 76 files, 565 tests, 0 failures, 30.51s |
| Architecture audit | `pnpm run audit:architecture` | PASS; 27 edge rows checked, no violations |
| Source audit | `pnpm run audit:source` | PASS; no blocking findings |
| Skeleton template checks | `bash tests/render-templates.sh && bash tests/lint-templates.sh` from the worktree root | PASS, exit 0 |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |

## FR-0.6 AC5 differential spot-check

The replacement at `tests/integration/evaluator-database.test.ts:102` is genuine and matches the round-2 reviews:

- It creates two real `register.register_row` versions whose product `configuredProviderSet` rows are identical (`:132-144`, `:207-208`).
- Only the healthy arm adds the `evaluatorProviderFamily` register row and an `AVAILABLE` `evaluator.vllm_probe` (`:209-226`).
- It plants a healthy evaluator row in `core.provider_probe` as a hostile fixture alongside the two product probes (`:227-233`), so accidental evaluator enrollment is observable rather than vacuous.
- It reads the real register composition through `readDeploymentMakerCapability`, then resolves latest probes with the same configured-provider filtering used by `apps/api/src/main.ts:33-57` (`evaluator-database.test.ts:146-180`).
- It admits both arms through `PostgresAskApplication.submit` and reads `discovered_panel` bytes plus DB-persisted `agent_count` from `core.run` (`:181-201`).
- It asserts byte-identical persisted membership, equal persisted `agent_count`, and absence of the evaluator provider/maker (`:235-242`). If the evaluator ref enters the healthy arm's configured set, the already-present healthy hostile probe produces a third member and all three guards fail.

The round-1 constant-fixture unit differential is gone. The complementary worker test also proves `runEvaluatorCatalogProbe` performs collision refusal before network collection or persistence (`apps/evaluator-worker/src/index.ts:18-32`; `tests/unit/evaluator-foundation.test.ts:138-153`).

## Lane-state and scope checks

- **No BOUND state:** exact-word `BOUND` scan over every lane-changed file returned zero hits. The delivered binding surface remains `UNBOUND`-only.
- **No push:** the branch has no configured upstream, and `git ls-remote --heads origin refs/heads/codex/eval-02-foundation` returned no remote ref.
- **Clean lane worktree:** final pre-verdict `git status --short --branch` showed only `## codex/eval-02-foundation`.
- **Scoped commits:** `dev...HEAD` changes exactly ten paths: evaluator package/worker, migration 0023, additive DB schema mapping, evaluator unit/integration tests, and workspace lockfile. No product API, runner, panel, settlement, or UI implementation path changed.
- **Commit shape:** `f11a307` is contract tests, `ed9336e` is the evaluator foundation, and `11ad2f3` is the bounded review rework across the evaluator worker, migration, and evaluator tests.

## Decision

The round-1 blocker is resolved, both round-2 reviewers passed the lane, and independent typecheck, test, architecture, state, remote, cleanliness, and scope checks pass. Under the work-done law, `eval-02-foundation` is done when this verifier approves it; merging remains the orchestrator's separate routing act. `eval-03-domains` and `eval-08-metering` may be unblocked.

HERMES STAGE VERDICT: LANE eval-02 APPROVED
