# REVCOV-01 Codex handoff — complete review coverage

Worker session: `01a0043c-bdca-7372-9589-c3d6c54b5bbc` / Hermes run 93  
Ticket: `t_f5bd09a5` · authority epoch 2 · rework round 1  
Workdir: approved repository main tree at `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`  
Comments read through: `2026-08-15 11:46` Codex REWORK ACKNOWLEDGED, following the `2026-08-15 11:45` ADVERSARIAL LENS rev1 comment and the complete 477-line `reviews/revcov01-opus-rev1.md` verdict (a final re-scan is recorded in the ticket transition comment).

## Outcome

REVCOV-01 is implemented and locally verified. Reviews now receive their ruled final attempt without an in-run wait; exhaustion records typed halt events. The runner interleaves review work and projects judged standing before propagation. Class H remains an intact excluded subtree; class D retains its own tau and carries a positive `judged_basis_count`. Catch-up is a real acceptance entry point over the pinned panel and pinned run ceiling, uses invocation-scoped review accounting, records reviews durably, creates a same-id answer version only when work changed, references v1's composition/conformance, and refuses disclosure drift, terminal downgrade, or number movement.

The standing-run catch-up itself is deliberately not run here: the packet assigns it to the orchestrator's post-close ceremony and forbids this worker from controlling the standing stack.

## Inventory

- `apps/runner/src/index.ts` — zero-wait review resilience, per-scope typed halts, interleaving, `projectJudgedStanding`, catch-up core, and PostgreSQL dependency factory.
- `packages/register/src/index.ts` — corrected per-site final-attempt ceiling and `DR-184-v2` basis.
- `packages/kernel/src/index.ts`, `packages/contract/src/index.ts`, `packages/judgement/src/index.ts`, `packages/serve/src/index.ts` — closed mark member, wire validation, review/lineage reads, typed record persistence, same-id answer versioning, latest/pinned reads, and v1 reference carriage.
- `migrations/0025_dr184_derived_standing.sql` — replay-safe constraint replacement and positive-iff-class-D `judged_basis_count` law.
- `acceptance/review-catch-up.ts`, `package.json`, `tools/orphan-audit/src/index.ts` — production CLI, script, and reachability registration.
- `apps/v2-ui/**`, `web/lib/v3Presentation.ts` — class-D presentation, node-local veil state, and a disjoint four-term sticky census whose three category counts sum to claims.
- `packages/db/src/index.ts` — lifecycle event state now carries the full five-member runner vocabulary; the four false `as "EXPANSION_HALTED"` boundary casts are gone. This narrow advisory fix was explicitly requested in the rework prompt.
- `tests/unit/dr184-review-resilience.test.ts`, `tests/unit/dr184-judged-standing.test.ts`, `tests/unit/dr184-catch-up.test.ts`, `tests/integration/database.test.ts`, plus declared consequence updates in existing support/render/integration fixtures.

No dependency was added. No evaluator-mission file or worktree, API key, Grok CLI, git history, or standing-stack process was touched. Unrelated evaluator-mission dirt visible in the shared main tree remains untouched.

## TDD evidence

Focused RED, before implementation:

```text
Test Files  2 failed (2)
Tests       11 failed (11)
```

The failures covered the missing standing projection, the final-attempt/cap coupling, review holds, typed halt events, the 29→28 panel-1 ceiling consequence, and the source sentinel. Focused GREEN after implementation:

```text
Test Files  2 passed (2)
Tests       11 passed (11)
```

Catch-up then went RED on the absent API (`3` missing-function failures) and GREEN after the invocation-scoped accounting, probe gate, refusal, resume, and persistence seams landed. The real PostgreSQL versioning fixture was added before its persistence implementation and then passed with v1 identity and both-direction DDL checks.

### Rework round 1 — adversarial lens B1/B2/B3

- B1 RED: `reviewCatchUpCallSiteKey` was deliberately restored to `JUDGE:review:<nodeId>`. The new HTTP-double + embedded-PostgreSQL test persisted three failed `MODEL_CALL` rows at that literal in-run key, proved a repeat call returned `CALL_BUDGET_EXHAUSTED` with provider calls still `3`, then failed because the defective catch-up call also hit that exhausted key instead of resolving. Output: `1 failed | 58 skipped`; cause `CALL_BUDGET_EXHAUSTED`. GREEN: restored the invocation-scoped literal; the catch-up reached provider call `4`, ledger counts were in-run `3` / catch-up `1`, and run-total was `4`. A separate two-attempt run proved `RUN_COST_ENVELOPE_EXHAUSTED` with zero extra relay calls.
- B2 RED: the current census logic was extracted without behavior change and fed the real RESIL-01 tau-0.30 `readAnswerProjection` result. Output was `expected 16 to be 8`. GREEN: the chosen partition is now explicit and disjoint — reviewed low-score nodes remain `judged` because DR-176 dimming is presentation-only; class D alone is `derivedStanding`; class H (`HIDDEN-UNJUDGEABLE`) alone is `setAside`. The real projection is exactly `{ claims: 8, judged: 8, derivedStanding: 0, setAside: 0 }`; every node must belong to exactly one category or the UI fails typed-loud with `CENSUS_PARTITION_INVALID`.
- B3 RED: after installing the recursive `apps` + `packages` + `acceptance` walk, a temporary shipped file at `packages/propagation/src/revcov01-scratch-measured-writer.ts` emitted `magnitudeStatus: "MEASURED"`; the sentinel failed and reported that exact path and line. GREEN: the scratch file was deleted. The only exclusion is the exact readonly union declaration pattern `readonly magnitudeStatus: "MEASURED" | "UNKNOWN";`, not a file or directory.

## C-1 through C-11 disposition

- C-1: ceiling uses `(authored + reviews) × (judge + finalRetry) + fixedSites × organ`, `fixedSites = 2 × 4 = 8`, version `DR-184-v2`; the independent panel-1 test now expects 28. Full table, depths 1..5 by row: panel 1 = `28, 28, 28, 28, 28`; panel 2 = `88, 152, 280, 536, 1048`; panel 3 = `144, 240, 432, 816, 1584`; panel 4 = `216, 344, 600, 1112, 2136`.
- C-2: catch-up uses `JUDGE:review:catch-up:<invocationId>:<nodeId>`, retains the original run work-item as `subjectItemId`, and uses the ruled JUDGE `bound.maxAttempts`. The counters are distinct: three real ledger rows exhaust `ledger.countModelAttempts(runId, workItemId, contractHash, inRunCallSiteKey)` and block the old key before HTTP; the invocation-scoped catch-up key has cumulative count zero and reaches the real HTTP double. Separately, `BudgetRepository.countRunModelAttempts(runId)` counts all four calls and the pinned ceiling refuses a fresh-key call once the run-total is exhausted.
- C-3: computed `answerVersion` is threaded through fact bundle, answer, condition marks, and served number in one transaction. Real PostgreSQL proves same `answer_id`, v2 at the computed version, v1 byte identity, and latest/pinned reads.
- C-4: the fixed-point basis includes descendants and incoming arrow sources, including EDGE target resolution. A reviewed cross-root attacker confers standing on its target; the subtree theorem only gains bases.
- C-5: a class-D root is now a served root whose un-cross-reviewed statement can be the answer prose. The answer receives `DERIVED-STANDING-UNREVIEWED`; this declaredly replaces the old `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW` death when judged arguments exist.
- C-6: veil state is node-local. Removing `inheritedHiddenReason` intentionally un-veils low-score descendants; class-H subtree population is an explicit projection behavior.
- C-7: the acceptance CLI is registered in `productionEntryPointFiles` and in the report entry-point list.
- C-8: before code, read-only standing evidence recorded run `091b7663-2f45-46f0-a745-1af53b4cd3ea`, `COOLDOWN_HOLD = 2`, and `70` unreviewed nodes; the complete minute histogram is preserved in the progress/session evidence. No standing process was controlled.
- C-9: a recursive source sentinel scans every TypeScript/TSX file under shipped `apps`, `packages`, and `acceptance` for `magnitudeStatus: "MEASURED"`, excluding only the exact known readonly type annotation; catch-up independently refuses `CATCH_UP_NUMBER_WOULD_MOVE` before writing a candidate version.
- C-10: healthy-path invariance is authored set + review coverage only. Interleaving may deterministically change reviewer assignment because rotation depends on the latest reviewer; that consequence is explicitly accepted.
- C-11: all V-rows are carried below with the same-house disclosure and both dissents.

## P1 mutation ledger — T1 through T30

| Test | Status and mutation killed |
|---|---|
| T1 | GREEN through existing healthy runner coverage; authored set and review coverage are retained, while reviewer identity is expressly excluded per C-10. Kills healthy-path extra work/holds. |
| T2 | GREEN; review exhaustion yields attempt 4 at the same in-run key and zero wait even when the authoring hold cap is already spent. Kills loss of the review final attempt and accidental review waiting; it does **not** kill authoring cap coupling. |
| T3 | GREEN; reviews consult neither author hold count nor wait and emit no hold. Kills a shared author/review hold pool. |
| T4 | GREEN for maker, expansion, and review. Its maker/expansion cases also kill the authoring cap-coupling mutation by requiring the final attempt before a typed halt; all cases kill silent branch darkness. |
| T5 | GREEN for all 20 panel/depth cells and formula version. Kills flat hold retry terms and stale versions. |
| T6 | GREEN through integration runner coverage at the declared root/round boundaries. Kills missed/double review and literal-based ordering. |
| T7 | GREEN through deterministic round ordering/rotation fixtures. Kills order-dependent replay drift. |
| T8 | GREEN for grandchild transitivity and cross-root incoming attacker. Kills one-level or descendant-only basis. |
| T9 | GREEN with complete class-H subtree fixture. Kills filter-imposed/non-closed H sets. |
| T10 | GREEN; D remains in the projected snapshot with own tau and positive basis record. Kills exclusion or recordless D. |
| T11 | GREEN; H leaves the evaluation snapshot but the original graph remains intact. Kills destructive deletion. |
| T12 | GREEN; excluded child retains its original H parent. Kills re-parented structure. |
| T13 | GREEN via recursive shipped-source sentinel plus unchanged-own-tau projection. A temporary new propagation writer makes it RED. Kills future measured-edge writer drift/fabricated magnitude, not only changes to today's known files. |
| T14 | GREEN at `0.6` from the node's own recorded tau. Kills zero or constant anchors. |
| T15 | GREEN in source and render behavior. Kills inherited veil state. |
| T16 | GREEN on real PostgreSQL; same answer id, version 2. Kills new-answer orphaning and duplicate version keys. |
| T17 | GREEN on real PostgreSQL; v1 serialized rows unchanged, latest=v2, pinned v1 remains readable. Kills mutation/history loss. |
| T18 | GREEN today via byte-equal numbers and source sentinel, repaired by runtime number-move refusal. Kills silent future numerical drift. |
| T19 | GREEN; v2 references v1 composed/conformance ids and makes no composer/conformance call. Kills copy/recomposition drift. |
| T20 | GREEN; terminal downgrade returns `CATCH_UP_WOULD_DOWNGRADE` and does not persist. Kills comment-only downgrade law. |
| T21 | GREEN; no-work rerun records/mints nothing. Kills unconditional v3 creation. |
| T22 | GREEN by immediate per-review persistence and ground-truth re-read on every invocation. Kills in-memory-only progress. |
| T23 | GREEN through pinned run-attempt checks before/after review calls. Kills a fresh/unbounded catch-up ceiling. |
| T24 | GREEN; mark/work disagreement refuses before model spend. Kills silent disclosure reconcile. |
| T25 | GREEN through pinned-panel probe construction and the existing different-maker DDL guard. Kills current-panel drift and self-review. |
| T26 | GREEN; mark count is 28 and both presentation tables carry a unique nonblank label. Kills missing/duplicate presentation. |
| T27 | GREEN through contract/serve required-record validation and real DDL both directions. Kills mark-record asymmetry. |
| T28 | GREEN from a real PostgreSQL answer projection with low-score nodes: `8 = 8 judged + 0 derived-standing + 0 set-aside`. Low-score dimming stays presentation-only; class H alone is set-aside. Kills visible-subset counting and judged/set-aside double counting. |
| T29 | GREEN architecture audit; no dependency edge added, runner does not import contract, CLI remains under acceptance. Kills wrong-layer routing. |
| T30 | GREEN source audit; production entry point is reachable and no new orphan is reported. Kills unreachable job shipment. |

## Exact verification output

```text
$ pnpm run generate:contract
$ tsx packages/contract/src/generate.ts

$ pnpm run typecheck
$ tsc --noEmit

$ pnpm run lint
$ tsx tools/orphan-audit/src/cli.ts architecture
{ "edgeRowsChecked": 27, "violations": [] }
$ tsx tools/orphan-audit/src/cli.ts source
{ "blocking": [] }
```

```text
$ pnpm run build
$ tsx packages/contract/src/generate.ts
$ tsc --noEmit
$ next build
✓ Compiled successfully
✓ Generating static pages (8/8)
exit 0
```

```text
$ pnpm exec vitest run --reporter=dot
Test Files  87 passed (87)
Tests       629 passed (629)
Duration    32.20s
```

The full run exercised real embedded PostgreSQL. The focused database suite also reported:

```text
Test Files  1 passed (1)
Tests       59 passed (59)
```

Collection proof:

```text
$ pnpm exec vitest list | wc -l
629
$ pnpm exec vitest list | rg 'DR-184 C-2|tau-0\.30|T13/C-9'
tests/integration/database.test.ts > ... > DR-184 C-2 crosses the real provider boundary after the in-run review key is exhausted
tests/integration/database.test.ts > ... > RESIL-01 rev2 R2 keeps a healthy tau-0.30 graph servable and makes class L presentation-only
tests/unit/dr184-judged-standing.test.ts > ... > T13/C-9 fails when any shipped writer emits a measured edge
```

`git diff --check` exits 0. Contract generation produced no generated-file drift.

The root `AGENTS.md` requests `bash tests/render-templates.sh` and `bash tests/lint-templates.sh`, but neither path exists in this checkout (`rg --files` finds neither). The attempted gate stopped with `bash: tests/render-templates.sh: No such file or directory`; this is reported as unavailable, not green. Relevant UI render tests are included in the 629-test green suite.

## Migration and shared-tree disclosure

The approved architecture named `0024_dr184_derived_standing.sql`, but epoch 2 overrode the earlier migration-free contract and required the next number in the main tree. This tree already contains the parallel evaluator mission's `0024_evaluator_domain_seed.sql`, so this change is `0025_dr184_derived_standing.sql`. V must preserve/order both during merge reconciliation. The migration is replay-safe by dropping named constraints if present before replacing them, and real PostgreSQL asserts valid/invalid D records in both directions.

## V-row carriage and same-house disclosure

These positions originate in the same Claude architecture/review house and should be discounted accordingly; Codex implemented only the ratified DR-186 outcomes.

- VROW-1: in-run review hold budget is exactly 0; catch-up hold budget remains unstated. Review gets retry + final attempt but never waits.
- VROW-2: T-KEEP; class D retains its own judged tau.
- VROW-3: `DERIVED-STANDING-UNREVIEWED`, with a required positive basis record.
- VROW-4: reviewer source is the pinned panel; unavailable different-maker coverage remains honestly unreviewed.
- VROW-5: v2 references v1's composed-text and conformance rows; it does not copy/recompose them.
- VROW-6: catch-up spends against the pinned run-total ceiling while its invocation-scoped site avoids historical call-site exhaustion.
- VROW-7 (dissent): retain the fourth census term so totals close arithmetically.
- VROW-8 (mechanism dissent): enforce the pre-registered question at runtime with `CATCH_UP_NUMBER_WOULD_MOVE`, backed by the shipped-writer sentinel.

## Rev1 advisory disposition

- A1 fixed: `RunLifecycleEventValue.state` now has the same five members as `HoldProgressEvent.state`; all four false `as "EXPANSION_HALTED"` casts are deleted.
- A4/A5 fixed in this handoff and proof: T4, not T2, owns author cap-coupling; per-call-site cumulative attempts and run-total ceiling attempts are named and asserted separately.
- A2 remains advisory: runner-to-database lifecycle persistence is exercised, but there is no new API projection assertion specifically for `REVIEW_HALTED`.
- A3 fixed: the real-PG v1/v2 fixture directly asserts equal `composed_text_id` and `conformance_record_id`, in addition to proving no composer/conformance call.
- A6/A7 remain advisory: class-D served-root prose identity and the explicit `classD ⊆ hiddenReviewRecords` invariant are not newly asserted.
- A8 remains outside this ticket: the two template scripts named by root `AGENTS.md` do not exist and are disclosed above.

## Post-close ceremony / questions for V

After peer approval, the orchestrator should run the acceptance CLI against the still-standing run using explicit pinned provider relay mappings, capture the probe-first and catch-up report, verify v1/v2 and the four-term census in the live API/UI, then rerun to prove no-op idempotence. It should also exercise the dead-relay/depth-1 ceremony from the architecture plan. This worker did not perform those forbidden live-stack operations.

The Grok seat is unfunded and was not called. The required peer lens is the single Opus adversarial review plus orchestrator gates.
