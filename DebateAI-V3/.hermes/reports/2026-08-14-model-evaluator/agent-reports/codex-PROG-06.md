# Codex PROG-06 — eval-06-addon

## Result

Implemented the tier-4 blind judge-grading add-on on branch
`codex/eval-06-addon` in
`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`.
The dedicated post-harvest pass grades one deterministically selected reduced
judgement with the isolated evaluator model, writes a versioned evaluator-owned
JUDGING observation, and remains collect-only.

Local lane commits: `ebdff73` (`feat(evaluator): grade judge outputs blindly`)
and rework commit `342eefa` (`fix(evaluator): preserve add-on attempt budget`).
No push was performed.

## Mandatory constraints closed

1. Retry ownership is evaluator-local. One invocation makes exactly one
   `ProviderGateway.call`; its configured `maxAttempts` is schema-capped at two.
   ADDON pipeline receipts independently cap cross-invocation attempts at three
   per run. The product run attempt counter is never consulted.
2. The gateway request uses `runId: null`, an
   `evaluator:addon-attempt:<uuid>` subject, call site
   `evaluator.grade-judge-output.v1`, and lane `evaluator`. Existing lane-04
   budget/liveness/digest differentials remain green.
3. `runEvaluatorJudgeGradingAddon` validates the run id and optional clock
   before its first repository query. A unit test proves invalid caller input
   cannot enter the repository/failure boundary.
4. `assertEvaluatorProviderIsolation` runs as a deployment preflight before an
   ADDON attempt is recorded. Collision tests prove no call and no counted
   `STARTED` receipt occurs.

## Delivered behavior

- Register row `evaluatorJudgeAddonPolicy` is strict and collect-only. It
  configures every-Nth-run sampling, provider retry/token/deadline bounds, and
  derivation version. `N=1` is the every-run development policy; an absent row
  produces an explicit `ADDON_POLICY_UNAVAILABLE` skip.
- The repository requires a successful HARVEST receipt, refuses already-graded
  and retry-exhausted runs, and selects at most one reduced judgement in stable
  append order.
- Prompt construction uses the foundation allowlist DTO only: opaque sample id,
  question excerpt, task excerpt, grade, and selected reasons. Maker, provider,
  model, raw-artifact, provenance, and other joinable identity fields are not
  serialized.
- Same-maker grading is refused in code before the model call and again before
  observation insertion. Migration 0026 repairs the existing DB trigger for the
  required null-run grader artifact while requiring the graded artifact to
  belong to the product run and retaining `PRODUCER_GRADING_FORBIDDEN`.
- Successful results land as `judging.blind-grade.v1`, step `JUDGING`, truth
  basis `BLIND_ADDON`, source kind `BLIND_JUDGE_GRADE`. The observation profile
  identity is the graded judge's exact provider/model/version; both graded and
  grader raw-artifact references remain durable evidence for ticket 07.
- The second delivery of a successful run short-circuits without another model
  call. Failures and skips are explicit ADDON pipeline receipts and do not alter
  harvest, aggregation, dispatch, routing, liveness, settlement, or serving.

## Files changed

- `DebateAI-V3/packages/evaluator/src/index.ts`
- `DebateAI-V3/apps/evaluator-worker/src/index.ts`
- `DebateAI-V3/packages/evaluator/README.md`
- `DebateAI-V3/migrations/0026_evaluator_judge_addon.sql`
- `DebateAI-V3/tests/unit/evaluator-addon.test.ts`
- `DebateAI-V3/tests/integration/evaluator-addon-database.test.ts`

## RED → GREEN evidence

RED:

- After locked dependencies were restored with `pnpm install --frozen-lockfile`,
  `pnpm vitest run tests/unit/evaluator-addon.test.ts` failed 6/6 because
  `shouldSampleEvaluatorAddon` and `runEvaluatorJudgeAddon` did not exist.
- The first database gate run then failed 2/2 at the fixture's existing
  `run_panel_count_identity` constraint. The fixture was corrected to use the
  repository's canonical one-member discovered panel; no product constraint was
  weakened.

GREEN:

- Focused add-on unit + embedded-PostgreSQL suite: 2 files / 11 tests passed.
- Mandatory foundation/tagger/harvest/FR-0.6 regression set: 4 files / 44 tests
  passed.
- Full repository suite: 92 files / 675 tests passed.

## Exact verification

- `pnpm run generate:contract && pnpm typecheck` — PASS.
- `pnpm vitest run tests/unit/evaluator-addon.test.ts tests/integration/evaluator-addon-database.test.ts`
  — PASS, 2 files / 11 tests.
- `pnpm vitest run tests/unit/evaluator-foundation.test.ts tests/unit/evaluator-tagger.test.ts tests/unit/evaluator-harvest.test.ts tests/integration/evaluator-database.test.ts`
  — PASS, 4 files / 44 tests, including lane-04 product envelope/liveness/digest
  isolation and FR-0.6 AC5 panel/agent-count differential.
- `pnpm lint` — PASS; architecture audit checked 27 edge rows with zero
  violations, source audit reported zero blockers.
- `pnpm test` — PASS, 92 files / 675 tests.
- `bash tests/render-templates.sh && bash tests/lint-templates.sh` from the outer
  harness — PASS.
- `git diff --check` — PASS.
- Branch/worktree — `codex/eval-06-addon` /
  `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`.
- DR-179 scoped scan — no key, token, bearer secret, remote endpoint, or new
  dispatch-binding state introduced.

## Scope and residual risk

No product behavior or evaluator dispatch binding changed. Migration 0026 does
require a binding Architecture §3.4 amendment; that request is recorded below
for the Hermes stage verdict. No external provider
call was made during verification; provider behavior is exercised through
deterministic gateways plus real embedded PostgreSQL persistence. The add-on is
an explicit worker entry point and remains downstream of a successful HARVEST
receipt. The deployment scheduler/orchestrator still owns invoking that task and
supplying the registered isolated family/gateway.

No board mutation, push, merge, deletion, fake runtime data, API key, or `BOUND`
state was introduced. Mission comments cursor: goal packet (not ticketed; board
access and mutation prohibited by the packet).

READY FOR PEER REVIEW:
- worker: Codex GPT-5.6 Sol
- worker CLI session id: `01a00518-248a-77c3-8489-5ca9c05f6901`
- ticket: PROG-06 / eval-06-addon
- branch/worktree: `codex/eval-06-addon` / `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`
- commit SHAs: `ebdff73`, `342eefa`
- files changed: six paths listed above
- RED/GREEN evidence: exact evidence listed above
- risks/open questions: deployment scheduler owns invocation; Hermes must ratify
  the Architecture §3.4 null-run grader amendment described below
- comments read through: goal packet plus both rework-round-1 peer reviews

## Rework round 1

Read both reviewer reports in full:

- `PROG-06-opus-review-1.md` — REWORK, four blockers.
- `PROG-06-opus2-review-1.md` — PASS, independently confirming the
  architecture divergence and identifying the concurrency race.

Rework commit: `342eefa` (`fix(evaluator): preserve add-on attempt budget`).
No push was performed.

### Blockers closed

1. Replaced the literal-only cross-invocation assertion with a live PostgreSQL
   regression. Three real failed worker passes persist three distinct `STARTED`
   attempts; the fourth pass returns `ADDON_RETRY_LIMIT_REACHED`, the gateway
   remains at three calls, and a direct
   `PostgresEvaluatorAddonRepository.loadCandidate` check returns
   `RETRY_LIMIT_REACHED`.
2. Moved deployment isolation validation before candidate loading and before
   `STARTED`. Isolation faults now consistently persist and return
   `SKIPPED / ADDON_PROVIDER_ISOLATION_FAILED`; three faulted sweeps consume
   zero attempts, and a corrected deployment can still grade the run.
3. Worker policy and family/register preflights now construct the repository
   and persist typed `SKIPPED` receipts. Family/register mismatch returns
   `ADDON_FAMILY_REGISTER_VERSION_MISMATCH` and is recoverable by retrying with
   the matching registered family. An unresolved run is rejected as invalid
   caller input instead of claiming an impossible receipt-backed terminal
   outcome for a nonexistent foreign-key target.
4. A session advisory lock now serializes the entire per-run candidate/provider
   pass without holding a write transaction across the provider call. Six
   concurrent invocations share one provider call: one grades and five observe
   `ADDON_ALREADY_GRADED`.

### Rework RED → GREEN evidence

RED against `ebdff73`:

- The live PostgreSQL ceiling test passed immediately, honestly confirming that
  blocker 1 was a coverage defect rather than a fourth-attempt implementation
  defect.
- Deployment-fault regression failed with three `STARTED` plus three `FAILED`
  receipts instead of three non-counted skips.
- Invalid-policy preflight regression found no receipt.
- Six concurrent passes made six provider calls and collided on the unique
  successful ADDON receipt.
- Unit isolation regression found `STARTED` + `FAILED` while the API returned
  `SKIPPED`.

GREEN on `342eefa`:

- Focused add-on unit + embedded-PostgreSQL suite: 2 files / 16 tests passed.
- Evaluator add-on/foundation/tagger/harvest/database regression set: 6 files /
  60 tests passed.
- `pnpm run generate:contract && pnpm typecheck` — PASS.
- `pnpm lint` — PASS; 27 architecture edges, zero violations, zero source
  blockers.
- `pnpm test` — PASS (exit 0).
- Outer `bash tests/render-templates.sh` and `bash tests/lint-templates.sh` —
  PASS.
- `git diff --check` — PASS before commit; worktree clean after commit.

### Architecture amendment request — Hermes stage verdict required

Migration 0026 intentionally changes the Architecture §3.4 same-maker trigger
precondition from `grader_run = NEW.run_id` to `grader_run IS NULL`. This is a
correct implementation of the mission's mandatory gateway law: evaluator calls
must use `runId: null`, so the grader artifact is evaluator-scoped and cannot
belong to the product run. The migration retains the other two protections:
the graded artifact must belong to `NEW.run_id`, and graded/grader makers must
differ.

This is an explicit architecture-amendment request, not a silent deviation.
Hermes is requested to ratify migration 0026 at the stage verdict and amend the
binding Architecture §3.4 trigger description (and the corresponding §5.3
grader-artifact wording) to require a product-run graded artifact plus a
null-run evaluator grader artifact. Until Hermes ratifies it, architecture
alignment remains the lane's sole open decision; the correct migration stays
in place.

READY FOR PEER REVIEW:
- worker: Codex GPT-5.6 Sol
- worker CLI session id: `01a00518-248a-77c3-8489-5ca9c05f6901`
- ticket: PROG-06 / eval-06-addon, rework round 1
- branch/worktree: `codex/eval-06-addon` / `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`
- commit SHA: `342eefa`
- comments read through: goal packet, `PROG-06-opus-review-1.md`, and
  `PROG-06-opus2-review-1.md`
- open decision: Hermes ratification of the Architecture §3.4/§5.3 null-run
  grader amendment

## Same-session continuation after client termination

The prior client termination was the known post-handoff CLI hang; durable work
was already safe in `342eefa`. The resumed session verified the assigned branch
at that exact commit with no uncommitted work, then reran the requested gates:

- `pnpm vitest run tests/unit/evaluator-addon.test.ts tests/integration/evaluator-addon-database.test.ts`
  — PASS, 2 files / 16 tests.
- `pnpm run generate:contract && pnpm typecheck` — PASS; contract generation
  completed and `tsc --noEmit` exited 0.

No source or test file changed during this continuation, so no additional local
commit was necessary. Rework commit `342eefa` remains the peer-review head.

## Rework round 2

Read both round-2 reviews in full:

- `PROG-06-opus-review-2.md` — REWORK on the advisory-lock pool deadlock.
- `PROG-06-opus2-review-2.md` — REWORK independently proving the same deadlock
  at pool width and across distinct runs.

Round-2 commit: `40a7eea` (`fix(evaluator): avoid add-on pool deadlock`). No push
was performed.

### RED → GREEN

RED against `342eefa` used an explicit PostgreSQL pool with `max: 10` and drove
12 invocations through the real worker/repository:

- twelve same-run invocations failed at the nested checkout with
  `timeout exceeded when trying to connect`;
- twelve distinct-run invocations failed identically despite zero advisory-key
  contention; and
- the focused file reported 2 failed / 6 passed, reproducing the shared-pool
  starvation boundary above the old width-six test.

GREEN on `40a7eea` selects the reviewers' non-blocking-lock remedy:

- `withRunLock` uses `pg_try_advisory_lock` and returns a typed non-acquired
  result instead of parking waiters;
- every candidate, receipt, and observation query in the winning pass uses the
  one lock-owning `PoolClient`, so no nested pool checkout occurs;
- same-run losers persist and return `SKIPPED / ADDON_PASS_IN_FLIGHT` without a
  provider call;
- 12 same-run invocations above pool max produce exactly 1 grade/provider call
  plus 11 typed in-flight receipts, then a bare query proves the pool usable;
- 12 distinct-run invocations above pool max all grade, make 12 provider calls,
  and leave the same pool usable; and
- if advisory unlock throws or reports failure, `client.release(error)` destroys
  the client instead of recycling a session that might retain the lock. A unit
  regression asserts the error-bearing release path.

### Round-2 verification

- `pnpm vitest run tests/unit/evaluator-addon.test.ts tests/integration/evaluator-addon-database.test.ts`
  — PASS, 2 files / 18 tests.
- `pnpm run generate:contract && pnpm typecheck` — PASS; `tsc --noEmit` exit 0.
- `pnpm lint` — PASS; 27 architecture edges, zero violations, zero source
  blockers.
- Outer `bash tests/render-templates.sh` and `bash tests/lint-templates.sh` —
  PASS.
- `git diff --check` — PASS before commit.
- Branch/worktree — `codex/eval-06-addon` /
  `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`.
- Worktree clean at `40a7eea` after commit.

The prior migration-0026 Architecture §3.4/§5.3 amendment request remains open
for the Hermes stage verdict and was not changed by this narrowly scoped rework.

READY FOR PEER REVIEW:
- worker: Codex GPT-5.6 Sol
- worker CLI session id: `01a00518-248a-77c3-8489-5ca9c05f6901`
- ticket: PROG-06 / eval-06-addon, rework round 2
- branch/worktree: `codex/eval-06-addon` / `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`
- commit SHA: `40a7eea`
- comments read through: goal packet, both round-1 reviews, and
  `PROG-06-opus-review-2.md` plus `PROG-06-opus2-review-2.md`
- open decision: Hermes ratification of the Architecture §3.4/§5.3 null-run
  grader amendment
