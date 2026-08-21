# Agent self-report — opus2, PROG-06 peer review (second independent reviewer)

Seat: Opus2, substituting the Grok reviewer seat for PROG-06 per V's ruling
(Grok outage). Date: 2026-08-15.
Target: `codex/eval-06-addon` @ `ebdff73` (`git diff dev...codex/eval-06-addon`).
Review artifact:
`docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-06-opus2-review-1.md`

Round 2 target: `342eefa "fix(evaluator): preserve add-on attempt budget"`
(rework in Codex's same session: reviewer A's four blockers plus my F1/F4/F5/F9).
Round-2 artifact: `…/programming/reviews/PROG-06-opus2-review-2.md`

Round 3 target: `40a7eea "fix(evaluator): avoid add-on pool deadlock"`
(narrow delta closing my round-2 blocker).
Round-3 artifact: `…/programming/reviews/PROG-06-opus2-review-3.md`

## Verdict — round 3 (current): PASS

B1 is closed structurally. The fix combines both remedies I named:
`pg_try_advisory_lock` (nobody blocks, so no invocation parks a connection while
waiting) plus threading the lock-owning `PoolClient` through `loadCandidate`,
`recordPipelineEvent` and `insertObservation`, so the critical section never
asks the pool for a second connection. No nested checkout remains anywhere in
the add-on's own call graph.

My round-2 series re-measured on the same embedded PostgreSQL, same
`pool max = 10`, with a bare `SELECT 1` recovery probe after each case:
same-run 6 → 72 ms / 1 call, 9 → 68 ms / 1 call, **10 → 74 ms / 1 call** (was:
never completes), **10 distinct runs → 73 ms / 10 calls, 10 GRADED** (was: never
completes). Pushed further: 14 same-run → 1 call and 13 `ADDON_PASS_IN_FLIGHT`
receipts; 14 and 20 distinct runs → every run graded exactly once. Pool usable
after every case. Same-run losers now return a typed `ADDON_PASS_IN_FLIGHT`
with its own receipt (exactly N−1 at every width) instead of waiting out the
winner.

Regression tests confirmed to exceed pool max: a dedicated
`new Pool({ max: 10, connectionTimeoutMillis: 250 })` driven at **12**
concurrent invocations in both the same-run and distinct-run shapes, each
asserting recovery with `SELECT 1 AS recovered`. Plus a unit test that the
client is destroyed via `release(error)` when unlock fails — which matters
because advisory locks are re-entrant per session, so a leaked lock riding a
recycled connection would silently defeat the guard.

Round-2 verified surface unbroken: 44/46 of my checks pass, the two non-passes
being the same informational cases as rounds 1 and 2. Blinding envelope (12
negative assertions), all four DB lineage refusals, both code guards, the
3-call poisoned-run stop, null-run scope, hostile-response consistency and
append-only all unchanged. Gates: `tsc --noEmit` exit 0, `pnpm run lint` clean,
`vitest run tests/unit tests/architecture tests/integration` — 85 files / 650
tests pass.

New non-blocking finding **N5**, which belongs to F3 (the wiring ticket): the
lock client is held across the model call, and the real `ProviderGateway` writes
its own ledger evidence, so a gateway constructed over the *same* pool
reintroduces nested checkout. Measured with a pool-writing gateway: 8 distinct
runs complete (185 ms), 14 deadlock on a max-10 pool. Not a defect in the
delivered code — the gateway is injected and there is no production caller — but
a hard constraint on the selector work. Remedies: separate pool for the gateway;
or release the lock client before the model call and re-acquire for the insert;
or cap concurrency below `poolMax − 1`.

Still open and unchanged: F2 (awaiting Hermes ratification of the 0026
architecture amendment), F3, F6, F7, F8, F10, F11, N3, N4.

## Verdict — round 2: REWORK — 1 blocker

**B1 — `withRunLock` self-deadlocks the connection pool.** The new
`PostgresEvaluatorAddonRepository.withRunLock` checks a client out of the pool
and holds it plus a session-level `pg_advisory_lock` for the whole critical
section, while every call inside it (`loadCandidate`, `recordPipelineEvent`,
`insertObservation`) asks the *same* pool for another connection. `createPool`
uses pg's default `max: 10` with no `connectionTimeoutMillis`, and
`pg_advisory_lock` has no timeout, so once ten invocations are in flight every
pooled connection is held by a waiter and the eleventh can never exist.

Measured on real embedded PostgreSQL (`pool max = 10`): 6 concurrent → 1
provider call (my F1 is genuinely fixed); 9 concurrent → completes in 82 ms;
**10 concurrent → never completes, 0 provider calls**; and **10 concurrent over
ten *different* runs, i.e. zero lock contention → also never completes**. The
pool never recovers — after the wedge even a bare `pool.query` used for fixture
seeding never returned — which starves harvest, tagger and metering too. Ten is
pg's default `max`, not an exotic number, and `reconcileEvaluatorTerminalRuns`
defaults to `limit: 100`. The lane's own new concurrency test uses width 6, so
it cannot see this.

Fix with `pg_try_advisory_lock` + a typed in-flight `SKIPPED`, or by threading
the locked client through the repository calls (harvest's precedent takes
`pg_advisory_xact_lock` *inside* `withWriteTransaction`, on the one client that
also does the work). Regression test must exceed `pool max`.

## Verdict — round 1: PASS

## Independence

Judgment formed from scratch. I did not read any `PROG-06-*-review-*.md`, nor
`agent-reports/opus-PROG-06-review.md`, nor the lane's own self-report
`codex-PROG-06.md`. Binding inputs only: Architecture.md §3.4/§4/§5.3/§7/§8,
Requirements.md FR-0.x + §4, goal packet PROG-06, wayfinder issue 06, and the
diff itself. I read the lane's tests to know what was *claimed*, then verified
every merge-gate item with my own mechanisms rather than by re-running them.

## What I did

Repository-level gates, run by me:

- `npx tsc --noEmit` — exit 0.
- `pnpm run lint` (orphan-audit architecture + source) — `violations: []`,
  `blocking: []`.
- `npx vitest run tests/unit tests/architecture` — 74 files / 525 tests pass.
- `npx vitest run tests/integration` — 11 files / 118 tests pass, including the
  FR-0.6 AC5 persisted panel-isolation differential and the full lane-04/05 set.
- `pnpm run audit:text-bytes` — 0 control bytes.

Two adversarial harnesses of my own (scratchpad, never written into the repo or
the worktree), driving `runEvaluatorJudgeAddon`,
`runEvaluatorJudgeGradingAddon` and `PostgresEvaluatorAddonRepository` against a
fresh **real embedded PostgreSQL** with the full migration chain — 51 assertions
total. Highlights:

- **Blinding, on the wire.** Seeded a judged artifact with identity planted in
  `maker`, `provider`, `model_id`, `model_version`, `metadata_json`, and extra
  `author_signature` / `system_fingerprint` keys inside `raw_text`. Captured the
  real `ProviderGateway.call` request object and serialised the whole envelope.
  12 negative assertions pass — no maker/provider/model/artifact-id/run-id/
  node-id/judgement-id of the graded material anywhere, nested or JSON-encoded.
- **Same-maker guard, DB.** Four break attempts: same-maker grader →
  `PRODUCER_GRADING_FORBIDDEN`; run-scoped grader artifact and cross-run graded
  artifact → `ADDON_GRADING_LINEAGE_UNRESOLVED`; grader refs smuggled under a
  non-add-on `source_kind` → CHECK violation. The trigger is BEFORE INSERT, so
  `ON CONFLICT DO NOTHING` cannot route around it.
- **Same-maker guard, code.** A lying gateway (reports the evaluator maker, its
  artifact carries the judge's maker) → `FAILED/ADDON_EXECUTION_FAILED`, 0 rows.
  A gateway reporting the judge's own maker → `SKIPPED`, 0 rows.
- **Bounded pass.** Poisoned run, 6 sequential invocations → exactly 3 provider
  calls then `ADDON_RETRY_LIMIT_REACHED`; per-invocation attempts capped at 2 by
  the policy schema and honoured by the gateway loop; zero HARVEST FAILED strikes
  accrued (goal-packet constraint 3).
- **Adversarial grader output.** Non-JSON, `score: 7`, `NaN`, extra keys, empty
  reasons, a NUL byte, and SQL-injection text — all leave the store consistent
  (0 rows on failure, 1 parameterised row on the injection case).
- **Dark launch.** A register row claiming `collectionState: "DISPATCH"` is
  refused with zero spend; absent policy leaves an explicit
  `ADDON_POLICY_UNAVAILABLE` receipt; un-harvested run refuses to grade.

## Findings I raised (all non-blocking)

F1 medium — no `pg_advisory_xact_lock`: 6 *concurrent* invocations for one run
made 6 provider calls (1 observation, deduped). Must be fixed before any
scheduler drives the pass; not live today, and the merged tagger has the same
posture, and the grader is the unmetered local vLLM.
F2 medium/doc — migration 0026 correctly requires `grader_run IS NULL` where
Architecture §3.4 still says `grader_run = NEW.run_id`; the doc must be amended.
F3 low — no production caller/selector for the add-on.
F4 low — invalid policy / preflight failure leave no pipeline receipt.
F5 low — the STARTED receipt insert sits outside the `try`, so it can throw out
of a function that declares a typed result.
F6 low — grader `reasons` array is uncapped (a 20 000-entry response persisted
1.33 MB of `outcome_json`).
F7/F8 informational — maker equality is exact-string (same as merged 0019), and
the grader's maker is the synthetic `maker:evaluator-local-vllm` constant rather
than the served weights' maker, so "different lineage" is really "different
maker string" (lane-02/architecture-owned; flagged for V).
F9 nit — `ADDON_MAX_PROVIDER_CALLS` exported and unused.
F10/F11 informational — schema-valid identity guesses are stored verbatim in
`outcome_json.reasons`; `ALREADY_GRADED` ignores `derivation_version`.

## Round 2 — what I did

Re-ran every round-1 mechanism against `342eefa` on a fresh embedded
PostgreSQL: **44/46 pass**, the two non-passes being the same informational
cases as round 1 (F7 exact-string maker, and the by-design caller-bug throw).
Blinding envelope (12 negative assertions), all four DB lineage refusals, both
code-level guards, the 3-call poisoned-run stop, hostile-response consistency,
null-run scope and append-only are all unbroken by the preflight reordering.
New probe for the lock at widths 6 / 9 / 10 / 10-distinct-runs produced B1.
Gates: `tsc --noEmit` exit 0; `pnpm run lint` clean; `vitest run tests/unit
tests/architecture` + the three evaluator integration files — 77 files / 563
tests pass.

Spot-check requested by the coordinator: my round-1 **F2 (0026 vs Architecture
§3.4) is now explicitly escalated**, not silent — `codex-PROG-06.md` carries a
dedicated "Architecture amendment request — Hermes stage verdict required"
section asking Hermes to ratify 0026 and amend §3.4/§5.3, and lists it as an
open decision.

Also fixed in this round and verified by me: F4 (preflight receipts now
written, plus a recoverable `ADDON_FAMILY_REGISTER_VERSION_MISMATCH` skip), F5
(STARTED receipt now inside the `try`, returns a typed FAILED), F9 (dead
constant removed). Still open and unchanged: F3, F6, F7, F8, F10, F11. New
non-blocking notes N1–N4 are in the round-2 review.

## Compliance

Read-only outside my two output files. No commits, no pushes, no board
mutations, no changes to the worktree (probes lived in the session scratchpad
and imported repo sources by absolute path). No API-key material introduced or
observed (DR-179 grep over the diff is clean).
