# READY FOR PEER REVIEW — PROG-09 consumer reader

WORKER CLAIM:
- agent: Codex GPT-5.6 Sol
- ticket: PROG-09 / 09-consumer-reader
- worker CLI session id: goal `01a005d5-c684-7d10-b28e-6a732921004a`
- branch/worktree: `codex/eval-09-consumer` / `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer`
- assignment type: first_pass
- comments read through: not ticketed; goal packet and issue read 2026-08-15
- board mutation: prohibited and not performed

## Outcome

- Added the one local-vLLM consumer interpreter over lane-07 profile cells and
  rank snapshots. Deterministic numeric values are read-only inputs; the strict
  output contract admits only a plain-language bias-pattern name, a per-domain
  capability summary, and allowlisted adjacent-domain flags.
- Prompt targets and samples use opaque refs. Captured prompt bytes omit the
  target provider, model id, model version, maker, raw-artifact id, lineage, and
  provenance. Anonymous sample DTOs expose only question/task excerpts, grade,
  and selected reason strings.
- Every provider call has `runId: null`, an evaluator subject item, evaluator
  lane/call site, and a consumer-owned maximum of two provider attempts. The
  selected catalog model and pinned evaluator maker are re-authorized before
  persistence, and provider isolation is asserted immediately before each call.
- Added on-demand and post-aggregate worker entry points. Outputs are append-only
  and versioned by prompt version plus aggregate snapshot hash.
- Added migration 0028 for global consumer-refresh receipts. A product run id is
  never fabricated for aggregate refresh. Preflight, claim, success, failure,
  current, in-flight, and retry-limit outcomes are typed and append-only.
- Claim arbitration uses `pg_try_advisory_xact_lock` only in a short transaction.
  No database client or advisory lock spans the provider call; three concurrent
  refreshes produced one call and two typed in-flight skips.
- The selected consumer can interpret its own row, but that row remains a
  code-computed profile/rank input. Malformed, numeric, routing, identity-mismatched,
  or hostile model output cannot write `consumer_output` or any numeric table.
- No BOUND state, live routing/dispatch reader, API key, cloud endpoint, board
  mutation, push, merge, or sibling seat-share/allocator change was introduced.

## Changed files

- `.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-09.md`
- `apps/evaluator-worker/src/index.ts`
- `migrations/0028_evaluator_consumer_refresh.sql`
- `packages/evaluator/README.md`
- `packages/evaluator/src/consumer.ts`
- `packages/evaluator/src/consumer-postgres.ts`
- `packages/evaluator/src/index.ts`
- `tests/integration/evaluator-consumer-database.test.ts`
- `tests/integration/evaluator-database.test.ts`
- `tests/unit/evaluator-consumer.test.ts`

Allowed-scope evidence: all changes are consumer-reader implementation,
consumer-specific persistence/documentation/tests, or the evaluator foundation
inventory assertion updated for the new table. No lane-10 allocator file changed.

## RED -> GREEN evidence

RED after the new consumer contract tests were written first:

```text
pnpm exec vitest run tests/unit/evaluator-consumer.test.ts
Test Files  1 failed (1)
Tests       6 failed (6)
Representative failures:
  buildEvaluatorConsumerPrompt is not a function
  runEvaluatorConsumerRefresh is not a function
```

The preceding worktree dependency check first reported `vitest` unlinked. An
offline frozen install reused 387 packages from the existing content-addressable
store, downloaded zero packages, and changed no lockfile. The behavioral RED
above was then captured.

GREEN focused consumer verification:

```text
pnpm exec vitest run tests/unit/evaluator-consumer.test.ts \
  tests/integration/evaluator-consumer-database.test.ts
Test Files  2 passed (2)
Tests       11 passed (11)
```

After adding the selected-model authorization case, the unit suite is 7/7 and
the consumer total is 12 tests. The real PostgreSQL path proves versioned writes,
on-demand idempotency, post-aggregate refresh, append-only guards, hostile-output
refusal with no corruption, retry ordinal 1 -> 2, null-run artifact authorization,
own-model numeric ownership, and concurrent in-flight behavior.

The first evaluator regression run exposed one expected inventory assertion:
`consumer_refresh_receipt` was new but absent from the exact evaluator-table
list. Updating that assertion and trigger count produced 20/20 GREEN in
`tests/integration/evaluator-database.test.ts`; the subsequent full repository
run is GREEN.

## Exact verification

```text
pnpm generate:contract && pnpm typecheck
PASS (tsc --noEmit)

pnpm run audit:architecture
edgeRowsChecked: 27; violations: []

pnpm run audit:source
blocking: []

pnpm test -- --maxWorkers=1
Test Files  98 passed (98)
Tests       706 passed (706)

pnpm exec vitest run --maxWorkers=1 tests/integration/evaluator-database.test.ts
Test Files  1 passed (1)
Tests       20 passed (20)
Includes FR-0.6 AC5 byte-identical panel membership and agent_count differential.

bash tests/render-templates.sh
PASS — templates rendered

bash tests/lint-templates.sh
PASS

git diff --check
PASS
```

The full suite includes the lane-04 tagger, lane-05 harvest, lane-06 add-on,
lane-07 profile/rank, null-run isolation, settlement/Q59 separation, provider
isolation, selector-unbound, and evaluator panel-membership differentials.

## Risks and review focus

- Refresh STARTED receipts are intentionally durable. If a worker process dies
  after claim and before its terminal receipt, that exact snapshot stays
  in-flight rather than risking duplicate model work; operational stale-claim
  recovery is not invented in this lane.
- Domain names and question/task excerpts are allowed semantic input. Structured
  identity and joinable lineage are excluded; no claim is made that natural text
  can never mention a person's or system's name.
- Consumer language remains collect-only. Ticket 11 may expose it in the dev
  menu, but this lane adds no product dispatch or binding consumer.

Comments read through: not ticketed; packet and issue remain the latest authority
as of the handoff on 2026-08-15.

READY FOR PEER REVIEW: codex/eval-09-consumer
