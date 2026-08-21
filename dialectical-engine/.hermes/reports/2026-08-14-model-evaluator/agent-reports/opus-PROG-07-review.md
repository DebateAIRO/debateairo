# Opus reviewer A — PROG-07 peer review self-report

- Seat: Opus reviewer A (peer review, PROGRAMMING loop)
- Lane reviewed: `codex/eval-07-profiles`
- Rounds completed: 3
- **Final verdict: PASS** (round 3, commit `975ab60`)
- Board mutations: none. No commits, no branch or worktree mutation. Wrote only
  my three review files and this self-report; one scratch probe script under the
  session scratchpad (outside the repo).
- Other reviewers' files: not read, per goal packet.

| Round | Commit | Verdict | Artifact |
|---|---|---|---|
| 1 | `a2b1f4e` | REWORK — 5 blockers, 8 non-blocking | `programming/reviews/PROG-07-opus-review-1.md` |
| 2 | `6a05f47` (+ migration 0027) | REWORK — 1 blocker (BF-6, deleted test), 7 non-blocking | `programming/reviews/PROG-07-opus-review-2.md` |
| 3 | `975ab60` (test-only) | **PASS** — 0 blockers, 9 carried-forward notes | `programming/reviews/PROG-07-opus-review-3.md` |

## Round 3 outcome — BF-6 cleared

**Test-only confirmed.** `git diff 6a05f47...975ab60 --name-only` filtered against
`^DebateAI-V3/tests/` returns empty: one file, +58/-0, nothing under `packages/`,
`apps/`, `migrations/`, or `schema.ts`. No `BOUND`, no key material, clean tree.
The round-2 production verdict therefore carries forward unchanged — no drift.

**The rank genuinely moves, through real write paths.** The new live-Postgres test
builds both phases via `addJudgedNode` (`core.node` + one `ledger.reduced_judgement`
sharing an artifact — the production runner shape) and the real
`harvestTerminalRun`; no `evaluator.observation` row is hand-inserted. I re-derived
both phases before reading the expected values and they match exactly:

- baseline (all τ = 0.5): every leniency sample 0 → all three score **1**,
  ordinals a/b/c by identity tiebreak;
- injected (a = 0.95, b = c = 0.1): a's samples `[0, +0.85]` → 0.425 → score
  **0.575**; b and c `[0, −0.425]` → −0.2125 → score **0.7875**;
- persisted order flips to b, c, **a** — `rankmove:a` falls from **ordinal 1 to
  ordinal 3**.

Scores at the injected `as_of` are distinct, so this is a bias-driven reordering,
not the degenerate tiebreak I flagged in round 2. Both derivations use the same
`derivation_version` (20), so the movement is attributable to injected data, not a
formula change — exactly FR-5.1 AC2. The assertion is an exact `toEqual` over all
six rows including `score`, so it pins movement, ordinals and formula together.

**The `bias-rank:` receipt is asserted again and better coupled than before:** the
persisted `prowess.judging-tau.v1` cell for `rankmove:a` must contain
`bias-rank:openai-compatible-http/rankmove:a/v1@3` — the **post-injection**
ordinal. A receipt written before the bias phase, from a stale ordinal, or not at
all would read `@1` or be absent and fail. Handoff 3 is now proven against
persisted state at the point where the ranking changed.

## Verification I ran in round 3

- `pnpm run typecheck` — clean.
- `npx vitest run` — **694 passed / 694, 96 files, exit 0** (693 → 694).
- New test confirmed passing by name in the run log.
- Independent recomputation of all six persisted rank rows — exact match.
- Repo-wide grep — **0 production call sites** for `selectJudgesByBiasRank`.
- Delta grep for `BOUND` / key material — none. `git status --porcelain` — clean.

## Cumulative record of what was fixed across the three rounds

All five original blockers, each re-verified with my own hand-computed fixtures
and (round 2) a direct `tsx` probe of `deriveEvaluatorProfiles`:

1. **Leniency fabricated zero** → redesigned to one sample per run with no sample
   when a run holds a single identity. Sole identity yields `null / n=0 / NONE` at
   1 run and at 5 runs; divergent judges yield ±0.8; identical judges yield a
   genuine measured 0 — three structurally distinct states.
2. **Lineage residue structurally empty** → now derived from `NODE_REVIEW` grouped
   by reviewed-author maker via the real `author_raw_artifact_ref` join, which
   harvest-driven fixtures exercise for the first time (1.0, n=2 — hand-verified).
3. **Mixed-metric prowess ladder** → `metric` in the rank group key, on the rank
   type, in `schema.ts`, and in both uniqueness constraints via replay-safe
   `migrations/0027`; judge ranks labelled `bias.composite-rank.v1`.
4. **Interval understated 2×** → range multiplier added; my recomputation at n=10
   (lower −0.2589388, asserted to 10 dp) fails against the old code.
5. **Contradiction denominator** → one sample per settlement event on run + exact
   identity, no latest-only drop, τ = 0.5 neutral-excluded, rule persisted in the
   receipt (0.5/n=2, 1/n=1, null/n=0 — all hand-verified).

Plus round-1 S-3 (selector test now walks the `apps/` tree), an unrequested
hash-aware upsert with typed `EVALUATOR_PROFILE_DERIVATION_CONFLICT` /
`EVALUATOR_RANK_DERIVATION_CONFLICT` refusals that materially strengthens FR-5.2,
and now the restored rank-movement and receipt coverage.

## Carried forward to stage review / bind-readiness (non-blocking)

N-1 variable-length penalty vector rewards missing add-on evidence and suppresses
the empty add-on cell entirely (FR-4.2 AC); N-2 `AUTHORING` prowess carries no
bias linkage and the selector guard skips `packages/`; N-3 no
`readEvaluatorProfileStrategy` register reader, no `AGGREGATE` pipeline receipt,
no `shadow_decision` for selector runs; N-4 residual vacuous assertions in
`evaluator-profiles-database.test.ts`; N-5 stale `at-boundary` fixture naming
there; N-6 nondeterministic `LIMIT 1` in the rank-conflict lookup; N-7 dead
`itemKey` / `subjectMaker` fields; N-8 the new test is declaration-order dependent
(stable today, would be robust if scoped by `model_id`); N-9 leniency is a
disclosed run-level rather than item-level comparison — worth one line in the
bind-readiness notes.

## Note for the coordinator

Clean PASS from this seat. Nothing outstanding blocks merge; the nine notes above
are sharpening and hygiene items that should be inherited by the stage review and
the bind-readiness pack rather than dropped.
