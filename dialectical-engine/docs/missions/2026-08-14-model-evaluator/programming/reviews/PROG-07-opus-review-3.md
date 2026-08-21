# PROG-07 — Opus reviewer A, round 3 (final delta)

- Lane: `codex/eval-07-profiles`
- Commit reviewed: `975ab60` (`test(evaluator): restore judge rank movement coverage`)
- Delta reviewed: `6a05f47...975ab60` — **1 file, +58/-0**, all inside `DebateAI-V3/tests/`
- Prior rounds: `PROG-07-opus-review-1.md` (REWORK, 5 blockers), `PROG-07-opus-review-2.md` (REWORK, 1 blocker: BF-6)
- Verdict: **PASS**

## Scope

Round 3 is a single-blocker delta. Round 2 cleared all five original blockers on
the derivation mathematics; the only thing outstanding was BF-6 — the rework had
deleted the lane's judge-rank-change coverage and the `bias-rank:` receipt
assertion, leaving FR-5.1 AC2 and the merge gate's named "rank-change tests"
unasserted, with the one surviving JUDGE-rank assertion degenerate (a tiebreak
between three judges all scoring 1). I verified only that item here, plus that
nothing else moved.

## Test-only confirmation

```
git diff 6a05f47...975ab60 --name-only | grep -v "^DebateAI-V3/tests/"
→ (empty)
```

The delta touches exactly one path,
`DebateAI-V3/tests/integration/evaluator-profiles-rework.test.ts`, adding 58 lines
and removing none. No change under `packages/`, `apps/`, `migrations/`, or
`schema.ts`. `grep -inE "\bBOUND\b|sk-|api[_-]?key|secret"` over the delta returns
nothing. `git status --porcelain` is clean; no push, no board mutation. So the
round-2 production verdict carries forward untouched — **no production drift**.

## BF-6 — CLEARED

### The rank genuinely moves, and it is not a tiebreak

The new test `"moves a judge down the persisted bias rank and receipts that
ordinal in prowess"` builds both phases through the real write paths: three
judges via `addJudgedNode` (which inserts `core.node` plus a single
`ledger.reduced_judgement` sharing one artifact — the production runner shape),
then the actual `EvaluatorHarvestRepository.harvestTerminalRun`, then
`deriveAndPersist`. No `evaluator.observation` row is hand-inserted anywhere in
this test; every observation the derivation reads was produced by harvest.

I re-derived both phases independently before looking at the expected values:

| Phase | Identity | Leniency samples | Cell value | Penalty | Score |
|---|---|---|---|---|---|
| baseline (all τ = 0.5) | a / b / c | `[0]` | 0 | 0 | **1** each |
| injected (a = 0.95, b = c = 0.1) | a | `[0, +0.85]` | +0.425 | 0.425 | **0.575** |
| | b | `[0, −0.425]` | −0.2125 | 0.2125 | **0.7875** |
| | c | `[0, −0.425]` | −0.2125 | 0.2125 | **0.7875** |

Persisted order therefore goes `a, b, c` (ordinals 1/2/3, all score 1) at the
baseline `as_of`, and `b, c, a` (ordinals 1/2/3, scores 0.7875 / 0.7875 / 0.575)
at the injected `as_of`. **`rankmove:a` falls from ordinal 1 to ordinal 3**, and
the assertion is an exact `toEqual` over all six persisted rows including the
`score` column — so it pins the movement, the ordinals, and the numeric formula
at once, and any reordering or formula drift breaks it.

Crucially the scores at the injected `as_of` are **distinct** (0.7875 vs 0.575),
so this is a bias-driven reordering, not the degenerate identity tiebreak I
flagged in round 2. The baseline row set still records the tie honestly
(all three at score 1), which makes the contrast explicit within one assertion.
The only tiebreak still in play is `b` before `c` at equal score — correct, since
they are genuinely equally biased.

Both derivations use the same `derivation_version` (20), so the movement is
attributable to injected data rather than to a formula change — which is exactly
what FR-5.1 AC2 asks ("rank order of judges changes when synthetic/high-leniency
or high-contradiction data is injected in tests — without changing panel
weight-multiplier configuration"). There is no weight-multiplier configuration to
change; consequence remains rank-and-select per ruling 5.

### The `bias-rank:` receipt is asserted again, and coupled to the movement

```
expect(receipt.rows[0]!.derivation_input).toEqual(expect.arrayContaining([
  "bias-rank:openai-compatible-http/rankmove:a/v1@3"
]));
```

read off the persisted `prowess.judging-tau.v1` cell for `rankmove:a` at the
injected `as_of`. This is a better assertion than the one round 2 lost: it cites
`@3`, the **post-injection** ordinal. A receipt written before the bias phase, or
from a stale ordinal, or not written at all, would yield `@1` or nothing and fail.
So handoff 3's "prowess derivations … can see the bias ranking" is now proven
against persisted state on live Postgres rather than against an in-memory literal,
and it is proven at the precise point where the ranking changed.

## Verification I ran

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `npx vitest run` (full repository) | **694 passed / 694, 96 files, exit 0** (693 → 694, the one added test) |
| the new test specifically | `✓ … > moves a judge down the persisted bias rank and receipts that ordinal in prowess 56ms` |
| independent recomputation of all six persisted rank rows | matches the assertion exactly |
| `git diff 6a05f47...975ab60 --name-only` outside `tests/` | empty — test-only |
| `grep -rn "selectJudgesByBiasRank" --include="*.ts"` outside tests | 1 hit: the definition. **0 production call sites** |
| `BOUND` / key material in the delta | none (DR-179 clean) |
| `git status --porcelain` | clean |

## Carried-forward non-blocking items

None of these gate the merge; they are recorded so the stage review and the
bind-readiness pack inherit them rather than losing them.

- **N-1** Judge score averages a variable-length penalty vector, so a judge with
  no add-on grade outranks an identically-biased judge that has one, and
  `bias.addon_grade_quality.v1` is still the only bias cell suppressed entirely
  when empty (FR-4.2 AC wants the absence explicit). A judge with no bias evidence
  at all still scores 0 and ranks last.
- **N-2** `biasContext` is still attached only for `JUDGING`/`REVIEWING` cells and
  still cites the profiled model's own ordinal; `AUTHORING` prowess, built from
  judge-produced node strengths, carries no bias linkage. The selector guard walks
  `apps/` but not `packages/` (substance is fine — my repo-wide grep is clean).
- **N-3** No `readEvaluatorProfileStrategy` register reader, so the `strategy_*`
  receipt on every cell remains caller-supplied; no `AGGREGATE` `pipeline_event`
  and no `shadow_decision` row for selector runs.
- **N-4** Residual vacuous assertions in `evaluator-profiles-database.test.ts`:
  `expect.any(Number)` on the insert counts, the `phaseOrder` literal-vs-itself
  comparison, and `toHaveLength(9)`. The substantive coverage they once carried
  now lives in the rework file, so these are cosmetic leftovers.
- **N-5** That same file's `judge:at-boundary` / `judge:below-boundary` fixture
  names now describe contradiction coverage that lives elsewhere; both cells are
  legitimately `null` under the identity gate. Rename to avoid misleading a reader.
- **N-6** The rank-conflict `SELECT` uses `(ordinal=… OR identity=…)` with
  `LIMIT 1` and no `ORDER BY`; a false pass needs a `source_hash` collision, so
  this is message clarity rather than correctness.
- **N-7** `itemKey` and `subjectMaker` are still selected in SQL and carried on
  `EvaluatorProfileObservation` but read by no derivation after the rework.
- **N-8 (new)** The added test is order-dependent: it asserts an exact six-row set
  over `derivation_version=20` at `as_of` 09:45 / 10:45, and the other tests in
  the file harvest observations at 09:30–10:30 that would fall inside that window.
  It is declared first and vitest preserves declaration order within a file, so it
  is stable today; scoping the query by `model_id` (as the sibling tests do) would
  make it robust to reordering.
- **N-9** Leniency is now a run-level rather than item-level comparison, a
  disclosed deviation from FR-5.1's literal "on the same items" forced by the
  one-reduced-judgement-per-node runner shape. The formula string is persisted on
  every cell; worth one line in the bind-readiness notes so a future consumer does
  not read it as item-matched.

## Final axis summary

| Axis | Result |
|---|---|
| 1. Deliverables — bias/prowess cells, counts, intervals, ranks, versioned, deterministic, no LLM | **PASS** |
| 2. REPLACE-not-pool with mixed consensus+settlement fixtures | **PASS** |
| 3. Bias-first ordering | **PASS** — now proven against persisted state via the `@3` receipt |
| 4. Selector provably UNBOUND, zero production call sites | **PASS** |
| 5. Mathematical honesty — leniency, intervals, contradiction denominator | **PASS** — all four round-1 findings corrected and independently re-derived |
| 6. FR-0.6 AC5 + lane-04/05/06 differentials, no BOUND, DR-179, tests + typecheck, vacuous assertions, clocks | **PASS** — 694/694, typecheck and lint clean, clocks pinned |

## Recommendation

**PASS.** BF-6 is cleared by a test that moves a judge from ordinal 1 to ordinal 3
on injected bias, through harvest, on live Postgres, with distinct scores and an
exact row-set assertion — and that re-asserts the `bias-rank:` receipt at the
moved ordinal. The commit is test-only, so the round-2 production verdict stands
unchanged. All six review axes are clean. The nine carried-forward items are
sharpening and hygiene notes for the stage review and the bind-readiness pack,
not merge conditions.
