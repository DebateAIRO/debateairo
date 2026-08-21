# opus2 self-report — PROG-11 peer review (second independent reviewer, Grok substitute per V)

- **Goal:** review `codex/eval-11-devmenu` (FINAL lane, tier 7) as the second independent reviewer
- **Date:** 2026-08-15
- **Round 1** — `91a4c16`, review at
  `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-11-opus2-review-1.md`
  — **PASS**, 10 non-blocking findings, no merge-gate failure
- **Round 2** — `c88dce1` ("fix(evaluator): harden dev menu invariants"), narrow delta, review at
  `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-11-opus2-review-2.md`
  — **PASS**, 4 round-1 findings closed, 1 new non-blocking finding, 6 carried
- **Current verdict: PASS**

## Independence

I read no `PROG-11-*-review-*.md` file and did not open the lane's own self-report
(`codex-PROG-11.md`). Judgement is from `git diff dev...codex/eval-11-devmenu`, Architecture §1.7/§2/§3.7/
§3.8/§6/§7/§8, Requirements §9 + FR-0.x, wayfinder ticket 11, and goal packet PROG-11.

## What I executed first-hand

- `pnpm run typecheck` — exit 0.
- `pnpm run test` (full repository) — **103 files / 729 tests passed**, exit 0, 43.2s.
- Lane's three new test files — 11/11 passed.
- Darkness guard `tests/architecture/evaluator-selector-unbound.test.ts` — passed.
- `audit:architecture` (`violations: []`), `audit:source` (`blocking: []`), `audit:text-bytes` (0),
  `audit:orphans` (no new blocking rows).
- **My own real-Postgres harness** (embedded PG 18): seeded 26 starter + 1 grown domain, profile cells,
  PROWESS and JUDGE rank snapshots, an observation, a shadow decision, a 3-failure parked run, a 2-failure
  control run, an AVAILABLE probe with two catalog models. Every read was then re-run through a LOGIN role
  that is a member of `debateai_evaluator_api` **only**, i.e. the real grant surface, not the superuser the
  lane's own test uses.
- **My own write-path hunt:** INSERT/UPDATE/DELETE attempted on all 14 evaluator tables plus
  `register.register_row`, `scorecard.routing_decision`, `core.run` through that role.
- **My own FK/staleness harness:** hand-rolled `consumer_selection` inserts bypassing the repository;
  stale-probe and unavailable-probe selection attempts; supersession-chain and append-only-trigger checks.
- **My own React render harness** (jsdom + `react-dom/client`) mounting `EvaluatorDevMenu` against the actual
  JSON produced by `readView` on that database; DOM control enumeration; click-through write-call capture;
  forced-`UNAVAILABLE` rerender.
- **My own Fastify matrix:** route-tree dumps for both compositions, ~25 URL/verb/tamper probes.

All harnesses were written from scratch and live outside the repository (scratchpad); they import lane
sources by absolute path. The worktree is clean (`git status --porcelain` empty) and the branch has no
remote. I created no file inside either repo other than the two outputs named in my goal.

## Key results

- **Real data everywhere:** catalog (2 enumerated models), rows harvested (1), domains 27 = 26 STARTER +
  1 GROWN with distinct provenance refs, profile peek with value/n/interval/derivation-version/rank, parked
  run with 3 receipts, dark launch `UNBOUND/ROW_ABSENT`. The 2-failure control run is correctly excluded.
- **Parked-runs predicate is the worker's own exclusion clause inverted** (`< 3` → `>= 3`), so the surface
  shows exactly the set batch selection has stopped picking.
- **Grants refuse everything but the one write:** all other evaluator tables and the register return `42501`
  (insufficient_privilege) for INSERT/UPDATE/DELETE. The dev-menu connection cannot author a binding row.
- **Enumerated-model FK proved at the DB layer:** a hand-rolled insert of a non-catalog model is refused by
  `consumer_selection_vllm_probe_id_model_id_fkey` (23503); the repository additionally refuses stale-catalog
  and unavailable-catalog selections with typed errors.
- **The selection is live wiring:** lane-09's consumer reader selects the same latest-`at_seq` row.
- **No bind control:** the rendered surface contains exactly two `Select` buttons and no other interactive
  element; the parked-runs disclosure has no button/input/form; the binding display is a SELECT typed
  `state: "UNBOUND"`; no `/binding`, `/dispatch-binding`, `/shadow-decision`, `/parked-runs/reset` route exists.
- **Dev gate is compositional:** the normal API composition registers no `dev` route at all (404 for query
  params, trailing slash, double slash, `%2f`, case variants); production env load throws
  `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN`; the UI branch is build-time eliminated in production.

## Non-blocking findings (detail in the review)

1. `readDispatchBinding` duplicates the canonical `readEvaluatorDispatchBinding`.
2. Circuit-breaker threshold/pipeline-version duplicated instead of shared with the worker.
3. Unused `SELECT ON evaluator.shadow_decision` grant in 0029, pinned by a test.
4. Profile peek `LIMIT 24` with no truncation indicator.
5. "Rows harvested" counts all observation rows, including add-on grades and superseded rows.
6. Rank LATERAL does not filter `rank_kind` (latent only; lane-07 metrics cannot collide today — I confirmed
   by forcing a collision).
7. Profile intervals carried in the DTO but never rendered.
8. `NODE_ENV` enum validation added to the shared API env loader could hard-fail non-standard values.
9. Nothing asserts `EVALUATOR_DEV_MENU_DATABASE_URL` is not the admin `DATABASE_URL`.
10. The no-bind-control test is a source regex, not a rendered-control enumeration.

## Round 2 — delta review of `c88dce1` (scope set by the coordinator)

Codex's rework extracts `dispatch-binding.ts` and `harvest-constants.ts`, parameterises the parked-runs SQL
with the shared constants, drops the `shadow_decision` grant from `0029`, and replaces the regex absence test
with a rendered-control enumeration plus a route-tree assertion. No UI component, API handler, env loader, or
`lib/api.ts` line changed.

What I re-ran on `c88dce1`:

- `pnpm run typecheck` exit 0; full suite **104 files / 730 tests, exit 0** (+1 file / +1 test, reconciling
  exactly with one new render file, one new route test, one removed regex test); `audit:architecture`,
  `audit:source`, `audit:text-bytes` all clean; darkness guard green.
- **Grant-level write hunt re-run verbatim** — byte-identical to round 1: `42501` on every evaluator table
  except the granted `consumer_selection` INSERT, `42501` on `register.register_row`,
  `scorecard.routing_decision`, `core.run`. The extraction widened nothing. The dropped grant is real:
  `SELECT` on `evaluator.shadow_decision` as the API role now returns `42501`, and `readView` still succeeds.
- **DOM control enumeration re-run** against a regenerated real view — exact control set unchanged:
  `["BUTTON:Select","BUTTON:Select"]`, one non-GET call (`POST …/consumer-selection`), parked `<details>` with
  no button/input/form, unavailable state with zero buttons.
- **Parked-runs predicate widened from a spot-check into a six-case differential** against the worker's own
  selection SQL read verbatim out of `apps/evaluator-worker/src/index.ts` at runtime: 3-failure → parked;
  2-failure → selectable; 3+SUCCEEDED+1 → neither (harvested, counter reset); 4-failure → parked with 4
  receipts; 3+SKIPPED+3 → parked on the post-SKIPPED window only; terminal-no-events → selectable. Sets are
  disjoint, `run_id` ordering survives the new `Map` grouping, and appending a `SUCCEEDED` un-parks the run.
  `worker.HARVEST_MAX_CONSECUTIVE_FAILURES === evaluator.HARVEST_MAX_CONSECUTIVE_FAILURES` is `true`.
- API route/verb/tamper matrix re-run — identical results to round 1.

**Round-1 findings closed:** 1 (duplicated resolver), 2 (duplicated threshold), 3 (unused grant — verified
refused at the database), 10 (regex test replaced by rendered-control enumeration).

**New round-2 finding (non-blocking):** the deleted regex test carried the only UI-layer assertion that the
surface renders `Collect-only · UNBOUND`; the new render test supplies an `UNBOUND` binding as input but never
asserts it appears in the output, and the marker list has no dark-launch entry. FR-9.2 AC2 is now asserted
only at the repository layer. I confirmed by rendering that the label does display; one `toContain("UNBOUND")`
in the new render test closes the gap.

**Carried unchanged:** round-1 findings 4–9 (profile `LIMIT 24` truncation, "Rows harvested" label breadth,
`rank_kind` not filtered, unrendered intervals, `NODE_ENV` enum tightening, no admin-URL guard).

## Constraints honoured

Read-only outside my three output files (two reviews + this report); no commits, no pushes, no board
mutations, no BOUND state; DR-179 (no key material observed or emitted). All harnesses lived in the
scratchpad; both worktree and repo remain free of any file I authored outside those three.

**REVIEW VERDICT: PASS**
