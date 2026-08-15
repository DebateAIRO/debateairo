# PROG-07 Codex agent report — evaluator profiles

- Worker: Codex GPT-5.6 Sol
- Assignment: rework round 2
- Branch: `codex/eval-07-profiles`
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-07-profiles/DebateAI-V3`
- Commit: `975ab60b50e4771bb4947c6ce11d22a8edeaccbb`
- Comments read through: both peer-review artifacts, read fully 2026-08-15
  - `PROG-07-opus-review-1.md`
  - `PROG-07-opus2-review-1.md`
- Board mutations: none, as required

## Rework delivered

- B1: replaced the impossible same-node panel-median leniency fixture/formula with one independent sample per run: identity run mean minus the mean of the other identities' run means. One-identity runs remain `NONE`, `n=0`. Regression data enters only through the real terminal-harvest repository and uses the runner's one-artifact/one-reduced-judgement-per-node shape.
- B2: lineage favoritism now reads real `NODE_REVIEW` evidence, joins the reviewer artifact separately from `ledger.node_review.author_raw_artifact_ref`, and measures author-lineage outcome residue only when at least two genuine author lineages exist. Real harvest fixtures prove the reviewer and authors differ.
- B3: settlement contradiction now contributes exactly one sample per accepted settlement event, linked by run plus exact provider/model/version identity to the identity's run-mean judgement. Multiple settlements are retained; no judgement-count multiplication or latest-row truncation remains. The documented boundary is `tau > 0.5` positive, `tau < 0.5` negative, and exact `tau = 0.5` neutral/excluded.
- B4: added `metric` to the rank model, persistence surface, Drizzle schema, and replay-safe `0027_evaluator_rank_metric.sql` migration. Rank uniqueness and grouping are now `(rank_kind, domain, step, metric, ...)`.
- B5: removed rank-level metric priority. Every active, unsuperseded consensus cell ranks at full weight in its own metric ladder; settlement replacement remains observation-specific through the existing supersession choke point.
- B6: equal-hash reruns remain idempotent, while changed same-key cell/rank derivations now raise typed `EVALUATOR_PROFILE_DERIVATION_CONFLICT` / `EVALUATOR_RANK_DERIVATION_CONFLICT` errors. A late, in-window harvest fixture proves changed input can no longer return `0/0` as false success.
- B7: bounded Hoeffding intervals now multiply by the metric's true range and clamp to its declared domain. The real-path `[-1,1]` leniency fixture pins the corrected radius.
- Widened the selector dark-launch architecture check from four entry files to every production source beneath `apps/`.

## Mandatory handoffs preserved

1. **REPLACE, never pool.** Eligible successors remove only their named consensus observation from every active aggregate while retaining the superseded row as audit history.
2. **Never mix superseded-row semantics.** Consensus strength and settlement outcome remain separate prowess metrics and separate rank ladders.
3. **Bias first.** Persistence order remains `BIAS -> JUDGE_RANK -> PROWESS -> PROWESS_RANK`; judge-dependent prowess inputs still cite their bias-rank receipt.

Also preserved: derivation-version history, selector isolation/unbound state, and degenerate-panel `NONE/n=0` behavior.

## Reproduce-first evidence

- RED: `pnpm exec vitest run tests/integration/evaluator-profiles-rework.test.ts`
  - Production-shaped leniency remained `0`; lineage emitted no reviewer cell; contradictions were judgement-count inflated and boundary-biased; `rank_snapshot.metric` did not exist; a changed same-version derivation resolved `0/0`; signed intervals used half the required range.
- GREEN: focused rework/profile/selector suite passes: 4 files, 11 tests.
- The blocker fixtures create ledger nodes, reduced judgements, reviews, strengths, and settlements, then write evaluator observations only through `EvaluatorHarvestRepository.harvestTerminalRun`.

## Verification

- `pnpm exec vitest run --maxWorkers=1 tests/unit/evaluator*.test.ts tests/integration/evaluator*.test.ts tests/architecture/evaluator-selector-unbound.test.ts`
  - PASS: 12 files, 88 tests, including FR-0.6 AC5 and lane-04/05/06 differentials.
- `pnpm exec vitest run tests/integration/evaluator-profiles-rework.test.ts tests/integration/evaluator-profiles-database.test.ts tests/unit/evaluator-profiles.test.ts tests/architecture/evaluator-selector-unbound.test.ts --reporter=dot`
  - PASS: 4 files, 11 tests.
- `pnpm generate:contract && pnpm typecheck`
  - PASS.
- `pnpm lint`
  - PASS: architecture audit 27 edge rows, zero violations; source audit zero blockers.
- `pnpm test -- --maxWorkers=1`
  - PASS on the committed tree: 96 files, 693 tests.
- `git diff --check`
  - PASS.
- Recursive production selector scan
  - PASS: zero `selectJudgesByBiasRank(` call sites beneath `apps/`.

### Continuation receipt — 2026-08-15 17:03 EEST

- Recovered the original session after the known idle CLI termination; committed work was intact at `6a05f47ae0cba411d9da2c11c73e8b47048a6952` and the worktree was clean.
- Re-ran the focused suite: PASS, 4 files / 11 tests.
- Re-ran the evaluator differential sweep: PASS, 12 files / 88 tests.
- Re-ran repository typecheck: PASS, `tsc --noEmit` exit 0.
- No additional source changes or commit were required.

### Rework round 2 receipt — 2026-08-15 17:21 EEST

- Read both round-2 reviews fully: reviewer A requested the single rank-change coverage repair; reviewer B passed the lane.
- Added a live-PostgreSQL regression through the real terminal-run, ledger-node, reduced-judgement, harvest, derive, and persistence paths. The baseline places judge `rankmove:a` at ordinal 1; a subsequent leniency injection changes its composite bias score and moves it to ordinal 3, so the assertion is not an identity-tiebreak-only check.
- Reasserted the downstream provenance receipt exactly as `bias-rank:openai-compatible-http/rankmove:a/v1@3` on the persisted judging-prowess cell.
- No production code changed.
- Focused suite PASS: 4 files / 12 tests.
- Repository typecheck PASS: `tsc --noEmit` exit 0.
- `git diff --check` PASS.
- Test-only commit: `975ab60b50e4771bb4947c6ce11d22a8edeaccbb` (`test(evaluator): restore judge rank movement coverage`).

## Files changed

- `migrations/0027_evaluator_rank_metric.sql`
- `packages/db/src/schema.ts`
- `packages/evaluator/src/index.ts`
- `tests/architecture/evaluator-selector-unbound.test.ts`
- `tests/integration/evaluator-profiles-database.test.ts`
- `tests/integration/evaluator-profiles-rework.test.ts`
- `tests/unit/evaluator-profiles.test.ts`

## Risks / open questions

- None blocking peer review.
- Formula changes still require a new `derivation_version`; same-version materially different re-derivations now fail typed instead of corrupting or silently retaining history.
- Live selector binding remains intentionally absent and requires a future V-authorized change.

READY FOR PEER REVIEW: codex/eval-07-profiles
