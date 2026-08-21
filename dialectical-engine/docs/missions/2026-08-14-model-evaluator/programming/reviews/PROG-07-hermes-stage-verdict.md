# PROG-07 Hermes stage verdict — `eval-07-profiles`

Mission: `model-evaluator`  
Lane: `codex/eval-07-profiles`  
Verified head: `975ab60` on `6a05f47` / `a2b1f4e` over `dev`  
Verdict: **APPROVED**

## Review chain

I read all five pre-existing `PROG-07-*.md` review artifacts. Round 1 returned dual REWORK with seven distinct blockers across the two seats, including the production-shape fabricated-zero leniency metric, structurally empty lineage monitoring, rank-level mixing of incompatible prowess metrics, ruling-4 consensus evidence being discarded, stale same-version derivations, understated signed intervals, and the wrong settlement-contradiction denominator. Commit `6a05f47` corrected the derivation and persistence semantics. Round 2 then split: seat B passed, while seat A ordered one narrow rework because the judge-rank movement and `bias-rank:` receipt tests had been deleted. Commit `975ab60` restored that end-to-end coverage, and the same seat returned PASS in round 3.

## Independent verification

All code commands ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-07-profiles/DebateAI-V3`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Full repository suite | `pnpm test` | PASS; **96 files / 694 tests**, exit 0 |
| Ruling-4 + replacement focus | `pnpm exec vitest run tests/unit/evaluator-profiles.test.ts tests/integration/evaluator-profiles-rework.test.ts -t 'replaces superseded consensus evidence|keeps unsuperseded consensus at full weight'` | PASS; 2 selected tests, including live embedded PostgreSQL |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |
| Lane state | `git status --short --branch` | Clean `codex/eval-07-profiles` at `975ab60`; all three declared commits are ancestors |
| Selector call-site scan | recursive scan of `apps/**` and `packages/**` production source extensions | only `packages/evaluator/src/index.ts`, the selector definition; **zero production callers** |

## Required spot-checks

### Migration 0027 — PASS

`0027_evaluator_rank_metric.sql` follows the repository's hand-written PostgreSQL migration style: uppercase DDL, replay-safe `IF EXISTS`/`IF NOT EXISTS`, catalog-driven `DO $$` logic, identifier-safe `format(... %I)`, explicit named CHECK/UNIQUE constraints, and no separate registry entry. The migration runner lexically discovers numbered SQL files, sorts them, and applies them inside one advisory-locked transaction. The full embedded-PostgreSQL suite applied 0027 successfully.

The schema change is the correct rank-level repair: it adds non-null `metric`, honestly backfills any legacy mixed row as `legacy.mixed.v0`, removes the temporary default, drops only `rank_kind` unique constraints while preserving `at_seq` uniqueness, and recreates both rank uniqueness surfaces with `metric` included. This permits one comparable ladder per `(domain, step, metric)` and prevents a persisted ordinal from hiding mixed semantics.

### Ruling 4 — consensus evidence at full weight — PASS

The former metric-priority selector is gone. Prowess cells are grouped and ranked by exact `(domainId, step, metric)`, so an identity with settlement evidence remains present in its independent consensus-strength ladder. Counts come directly from active rows; no multiplier or consensus discount exists. The focused harvest-driven PostgreSQL regression passed with `model:a` leading `prowess.consensus-strength.v1` while also holding a separate settlement-outcome cell.

### REPLACE, never pool — PASS

`activeProfileObservations` is the common pre-aggregation choke point. At the pinned `as_of`, it collects every eligible successor's `supersedesObservationId` and removes the named predecessor before bias groups, prowess groups, counts, ranks, and derivation receipts are built. The unit regression passed with the replaced consensus id absent from every `derivationInput`; the database coverage keeps both observation rows as audit history while persisting only the settlement-outcome prowess cell for the replaced run.

### Selector remains dark — PASS

A recursive production-source scan across both `apps/**` and `packages/**` found `selectJudgesByBiasRank(` only in `packages/evaluator/src/index.ts`, where it is defined. There are zero production call sites. The full suite also passed the architecture guard. No evaluator-derived rank currently steers a run.

## Carry-forwards and custody

The nine non-blocking notes from `PROG-07-opus-review-3.md` are now recorded in ticket 10's bind-readiness pack: variable-length/missing-evidence judge penalties; partial bias-context linkage and the packages guard gap; caller-supplied strategy/no aggregate or shadow receipts; cosmetic assertions; stale boundary fixture names; nondeterministic conflict-row reporting; dead carried fields; order-dependent rank test query; and disclosed run-level rather than item-matched leniency.

Seat B's additional disclosure is recorded as a dedicated documentation line: settlement contradiction requires an exact identity-linked settlement, so panel peers are often `NONE` and the metric may be sparse in composite judge ranks. V must see that limitation before bind.

Board custody is complete:

- `eval-07-profiles` (`t_fd6d411d`) is done at verified head `975ab60`;
- `eval-09-consumer` (`t_fab7c167`) is ready as tier 6A;
- `eval-10-seatshare` (`t_ad2ce05d`) is ready as tier 6B, in parallel with lane 09;
- ticket 10 retains its existing selector-wiring constraints from PROG-06 seat-B N5 and PROG-04 F3;
- matching wayfinder issues record lane 07 done, lanes 09/10 ready, the nine-note bind-readiness pack, and the contradiction-sparsity disclosure.

## Decision

The final review chain is PASS, independent typecheck and all 694 repository tests pass, migration 0027 matches the hand-written SQL and migration-runner conventions, consensus evidence ranks at full weight in its own metric ladder, superseded consensus is replaced rather than pooled, and the selector has no production caller. No stage blocker remains.

HERMES STAGE VERDICT: LANE eval-07 APPROVED
