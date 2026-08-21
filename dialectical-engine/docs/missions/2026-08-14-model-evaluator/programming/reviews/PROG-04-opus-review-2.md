# PROG-04 — Opus reviewer A, review 2 (codex/eval-04-tagger @ 670ac9a)

Reviewer: Opus (reviewer A), 2026-08-15. Round 2 over rework commit `670ac9a`
("fix(evaluator): isolate tag attempts from product runs") on top of `c15690f`.
Scope: are review-1 blockers B1/B2 genuinely closed, plus the filed non-blockers.
Re-traced the budget/serve/liveness paths myself; re-ran every check.

## VERDICT: PASS

Both blockers are closed at the mechanism level, not merely at the assertion
level, and the fix is the right one: evaluator tag calls no longer carry a
product `run_id` at all, so they are structurally invisible to every product
per-run reader rather than being special-cased in one of them.

---

## 1. Blocker B1 — product cost envelope / product-run readers: RESOLVED

The single line that mattered (`packages/evaluator/src/index.ts`, provider call):

```
-      runId: input.runId,
-      subjectItemId: `evaluator:tag:${input.runId}`,
+      runId: null,
+      subjectItemId: `evaluator:tag-attempt:${attemptId}`,
```

Re-traced each consumer I named in review 1, against current source:

| Product reader | Filter | Effect on a null-run tag entry |
|---|---|---|
| `apps/runner/src/index.ts:2009` (`createPostgresProviderGateway`) | `if (request.runId !== null) await budget.assertModelAttemptAllowed(...)` | assert skipped — a tag cannot be refused by, and cannot trip, the product envelope |
| `packages/budget/src/index.ts:237` `countRunModelAttempts` | `WHERE run_id = $1 AND action_kind='MODEL_CALL'` | NULL `run_id` never matches; product count unchanged |
| `packages/serve/src/index.ts:1525` execution-ledger digest | `WHERE run_id=$1 ORDER BY sequence` | excluded from the asker-visible digest |
| `packages/liveness/src/index.ts:311` version triggers | `WHERE run_id IS NOT NULL` | evaluator artifacts never enter the `(run_id, provider_ref)` partitions |
| `packages/battery/src/terminal.ts:1038`, `packages/graph/src/index.ts:449`, `packages/ledger/src/index.ts:271/375/458/492` | all `run_id = $1`-scoped | excluded |

`ledger.ledger_entry.run_id` and `ledger.raw_artifact.run_id` are both nullable
(`migrations/0000_s00.sql:158`; gateway type `runId: string | null`), so this is
a supported state, not a constraint dodge.

Proof quality is good — the new integration tests use the **real**
`createPostgresProviderGateway` with a fake `fetch`, not a stub gateway (that
stub was exactly my review-1 objection):

- "tags and leaves an already-served answer readable at the product envelope
  ceiling": run pinned at `maxModelAttempts=1`, one product `MODEL_CALL` already
  inserted, i.e. the run is *at* its ceiling. The tag still returns `TAGGED`,
  `countRunModelAttempts(runId)` stays `1`, and the served answer's digest is
  still readable. That asserts both directions (the tag is neither blocked by,
  nor a consumer of, the envelope). Under `c15690f` this test necessarily fails
  — `assertModelAttemptAllowed` would have thrown `RUN_COST_ENVELOPE_EXHAUSTED`
  inside the gateway and the tagger would have returned `UNTAGGED`; the worker's
  reported RED matches that.
- "does not fire product liveness when evaluator tags span model versions": runs
  two tags at `local/evaluator:v1` and `:v2` on a run that **has a served
  answer** (so the detector would have subjects to fire against), asserts
  `artifact_run_id`/`ledger_run_id` are both NULL, then actually invokes
  `LivenessRepository.detectProviderModelVersionTriggers()` and asserts zero
  `PROVIDER_MODEL_VERSION` triggers. `triggerKind: "PROVIDER_MODEL_VERSION"` is
  the literal the detector inserts (`packages/liveness/src/index.ts:337`), so
  the assertion is not vacuous.
- "keeps the asker-visible execution digest byte-identical with tagging off
  versus on": `JSON.stringify` comparison of `readExecutionLedgerDigest` before
  and after a real tag call.

## 2. Blocker B2 — reconciliation under the real gateway: RESOLVED

`LedgerRepository.countModelAttempts` returns `0` immediately when `runId` is
null (`packages/ledger/src/index.ts:523`), so `remainingProviderAttempts` is the
full `bound.maxAttempts` on every pass and `CALL_BUDGET_EXHAUSTED` is
unreachable for tag calls. The per-attempt `subjectItemId`
(`evaluator:tag-attempt:${attemptId}`) removes the shared retry tuple as a
second line of defence.

The test "reconciles after an ask-time provider failure without exhausting the
evaluator attempt tuple" drives the first pass through
`createPostgresProviderGateway` with a 503 `fetch` — so a real FAILED
`MODEL_CALL` ledger row is written — then reconciles successfully. This is the
scenario my review-1 B2 predicted would fail, exercised through real accounting.

## 3. Filed non-blockers

| Review-1 finding | Status |
|---|---|
| Typed `TIMED_OUT` | **Closed.** `ProviderCallFailedError.lastOutcome === "TIMED_OUT"` → `TAGGER_PROVIDER_TIMED_OUT` result + FAILED receipt with that reason; unit-tested. |
| Invalid content collapsed into execution failure | **Closed.** `parseTaggerDecision` throws typed `EVALUATOR_TAGGER_OUTPUT_INVALID`; that plus `ProviderContentUnacceptedError` map to `TAGGER_CONTENT_REFUSED`. |
| Pre-`try` throws (blank inputs, STARTED receipt, worker run lookup) | **Closed.** Input validation, preflight (`listDomains`/`readQuestionDomain`/STARTED receipt) and the worker's missing-run path all return typed `UNTAGGED` (`TAGGER_INPUT_INVALID` / `TAGGER_PREFLIGHT_FAILED` / `TAGGER_RUN_UNRESOLVED`). Terminal receipts are written through `recordTerminalEvent`, which swallows a receipt outage so a receipt failure cannot escalate. The function no longer throws on any traced path. |
| Re-tag of an already tagged run | **Closed.** `readQuestionDomain` preflight short-circuits to `SKIPPED / TAGGER_ALREADY_TAGGED` before any provider call or admission; unit + integration tested (exactly one admission receipt). |
| Migration 0025 DDL relaxation | **Disclosed and escalated.** The round-2 self-report carries a dedicated "Migration 0025 disclosure — Hermes ratification required" section stating the relaxation, its blast radius (blank permitted only for `decision='REFUSED'`), and that rejection requires a different persisted representation before merge. That is the correct handling for a worker who cannot edit mission docs — **the ratification itself is now Hermes's call, not a lane defect.** |

Bonus beyond what I filed: an unresolved `SELECT_EXISTING` id now leaves a
`REFUSED` receipt instead of throwing, keeping the hallucinated-id path
non-gating and auditable.

## 4. New observations (none blocking)

1. **Product-package edit.** `packages/providers/src/index.ts` gained
   `CLASSIFIER` to `MODEL_ROLES` and `evaluator` to `Lane`. Verified inert:
   nothing outside that file references `MODEL_ROLES` / `TypedRole` / `Lane`
   (`packages/settlement` `routeServedLane` is an unrelated name), `request.role`
   and `request.lane` are never read at runtime by the gateway, no migration
   CHECKs them, and `pnpm run generate:contract` leaves the tree clean (no
   contract drift). Additive and honest labelling — but it is a product-package
   change and should be named in the integration note.
2. **Weakened artifact/run binding, by design.** `assertAdmissionArtifact` now
   expects `run_id IS NULL` when the artifact's `provider_ref` is the evaluator
   family, keeping the source-run check for every other caller. Correct for the
   new scope, but it means an evaluator artifact is no longer pinned to one run
   by that assertion; correlation now rests entirely on evaluator-owned
   `domain_admission` / `question_domain` / `pipeline_event` rows. Worth noting
   for the GROWN-domain provenance story (Architecture §3.2 `source_run_id` +
   `proposal_raw_artifact_ref` now span a null-run artifact) — a doc note for
   Hermes/architect alongside the 0025 ratification, not a code defect.
3. **Cross-invocation tag attempt accounting is now off.** With `runId: null`,
   `countModelAttempts` always returns 0, so nothing caps how many tag attempts a
   run accumulates across reconciliation passes; only `bound.maxAttempts` per
   invocation applies. Local-container-only spend (relative cost 0, DR-179
   clean), so this is not a merge risk — but ticket 06 / orchestrator packaging
   must bound reconciliation retries. Carry-forward.
4. Minor test polish, not required: the liveness test has no positive control
   (it does not also show the detector firing when `run_id` is set), and the
   digest test's "before" snapshot contains no product `MODEL_CALL` rows — the
   at-ceiling test partially covers that gap.
5. Carry-forward restated for lane 05: harvest must exclude the call-site prefix
   `evaluator.` from author/reviewer populations (Architecture line 95). Null
   `run_id` already makes the tagger artifacts unreachable from run-scoped joins,
   which strengthens this, but the prefix rule is still owed.

## 5. Standing axes re-checked at 670ac9a

- Carry-forwards 1–3 from the goal packet remain closed (blank-proposal typed
  REFUSED + receipt; REFUSED and select-existing paths; isolation asserted before
  the observed call with a `gateway.call` non-call assertion).
- Memory no-op holds: no `question_key` / `question_type` / `declared_field`
  reference in `packages/evaluator/src` or `apps/evaluator-worker/src`; the
  before/after full-row equality test still passes.
- FR-0.6 AC5 differential unmodified and green.
- No `BOUND` state; no API-key/authorization/remote-endpoint material; DR-179
  clean.
- Non-gating posture is now stronger than at review 1: no traced path in
  `runEvaluatorQuestionTagger` throws, and the product run cannot be harmed by a
  tag attempt that succeeds, fails, times out, or is refused.

## 6. Verification I ran myself at 670ac9a

| Check | Result |
|---|---|
| `pnpm typecheck` (`tsc --noEmit`) | PASS, clean |
| `pnpm run generate:contract` then `git status --porcelain` | empty — no contract drift from the `MODEL_ROLES`/`Lane` change |
| `npx vitest run tests/integration/evaluator-database.test.ts tests/unit/evaluator-tagger.test.ts` | 27/27 PASS (all 5 new isolation cases + 4 new unit cases green) |
| `npx vitest run` (full) | 85 files / 628 PASS |
| `pnpm lint` (`audit:architecture` + `audit:source`) | PASS — 27 edge rows, `violations: []`, `blocking: []` |

The self-report's round-2 numbers (85 files / 628 tests, audits clean) match my
independent runs exactly, and its RED description is consistent with what the
old code path would have produced.

## 7. For Hermes at integration

1. Ratify or reject migration `0025`'s REFUSED-only DDL relaxation (worker has
   escalated it explicitly; this is the one open decision).
2. Record the architecture note that evaluator tagger calls persist with null
   `run_id` — Architecture §2/§3.2 currently imply run-scoped tagger evidence.
3. Note the additive `packages/providers` role/lane edit in the merge record.
4. Carry forward to ticket 06: bound reconciliation retries; to lane 05: exclude
   the `evaluator.` call-site prefix from harvest populations.
