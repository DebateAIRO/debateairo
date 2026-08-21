# LOAD-01 Codex handoff

Ticket `t_4020ac7b` · worker session `019ff813-cfdc-7e12-aa4a-11864e128012` · shared repository workdir · no commit (Git is V-gated).

## Outcome

V's POST `/new` → `/debate/<run_ref>` flow no longer asks the answer resource to distinguish every 404. A new asker-owned `GET /v1/runs/{id}` projection carries the real question and one closed state (`QUEUED | CLAIMED | RUNNING | FAILED`). SSR now resolves an absent answer against that projection:

- live run → V2 `generating` view with the real question card and existing stream progress;
- typed `FAILED` run → V2 failed view plus the recorded terminal reason, including XREV-01's loud mid-review stop;
- absent run → Next `notFound()` and an honest 404;
- transport failure → retryable pending state, not a fabricated terminal.

## Rev2 rework outcome

The dual-lens rev1 blockers are closed in the original worker session:

- GROK-B1: the production Hatchet task now catches any runner throw, records the matching work item `FAILED` through `WorkItemRepository.recordTerminalFailure`, uses a public typed reason (`RUNNER_EXECUTION_FAILED:<domain-code>` or `UNEXPECTED_ERROR`), and only then rethrows. `apps/runner/src/main.ts` supplies the real repository.
- OPUS-B1: `DebateDetail.run_state` preserves `QUEUED | CLAIMED | RUNNING | FAILED`. An open run with no streamed child work renders the exact state label and an indeterminate strip; it has no percentage track and no invented “Models arguing 40%”. Real streamed nodes may still show progress computed from their actual terminal node count.
- OPUS-B2: a failed `run.terminal` now changes the debate status and run state to failed before showing its typed banner. The failed render has neither a live pill nor a generation progress strip, and the existing terminal-state effect closes the stream.
- OPUS-B3: a real migrated PostgreSQL fixture drives the real Fastify route: anonymous is 401, a different token is 404, and the owner is 200/QUEUED. The fixture terminalizes its work item after the assertions so it cannot contaminate later claim tests.
- OPUS-B4: the source regex was removed. The render-layer suite invokes the actual async server page and observes the `notFound()` throw for a typed missing projection.
- Enabler: the root `vitest.config.ts` now uses automatic JSX, the application React installation, the `@/` alias, deterministic Next server stubs, and a `.test.tsx` include. Plain `pnpm test` renders the real `DebatePageClient` and invokes the real server page.

## Inventory

- `packages/contract/src/index.ts`, `packages/contract/src/client.ts` — closed `RunProjection`, client read, and `GET /v1/runs/{id}` route. The ignored generated inventory/OpenAPI were regenerated for verification.
- `packages/db/src/index.ts` — `RunRepository.readLoadingProjection`, scoped by `run.asker_id`; FAILED outranks CLAIMED, which outranks READY/QUEUED, with DONE/no-open-item represented as RUNNING until the served answer exists.
- `apps/api/src/index.ts` — asker-scoped application method and facade route; missing runs return `RUN_NOT_FOUND`.
- `apps/v2-ui/lib/serverApi.ts` — discriminates settled, loading, failed, honestly missing, and transient pending states.
- `apps/v2-ui/lib/v3/adapter.ts` — maps the typed run onto V2's existing root-question/generating vocabulary and preserves failed status.
- `apps/v2-ui/app/debate/[id]/{page.tsx,DebatePageGate.tsx}` — threads loading/failure state to the client and invokes `notFound()` only for a typed missing run.
- `tests/unit/{contract,api,v2ui-data-layer}.test.ts` — wire, route, page-state, question, failure, and missing-id assertions.
- `tests/unit/load01-live-proof.test.ts` — provider-double composition proof covering POST ask → queued run ref → page loading projection.
- `tests/unit/load01-run-projection.test.ts` — persistence ownership/state precedence.
- `tests/unit/load01-production-terminal.test.ts` — production Hatchet throw-to-terminal attachment.
- `tests/render/load01-debate-page.test.tsx`, `tests/render/stubs/*`, `vitest.config.ts` — enforced real client renders and behavioral server-page 404. The dead sidecar config was removed.
- `tests/integration/database.test.ts` — PostgreSQL + real API authentication/ownership boundary.
- `docs/missions/2026-08-06-v3-programming/handoffs/LOAD-01-progress.log` — major-step log.

The repository was heavily dirty before claim. Existing edits in overlapping API, contract, DB, adapter, and UI test files were preserved; unrelated changes remain attributed to their prior lanes.

## TDD RED → GREEN

RED:

```text
$ pnpm vitest run tests/unit/contract.test.ts tests/unit/api.test.ts tests/unit/v2ui-data-layer.test.ts
Test Files  3 failed (3)
Tests       5 failed | 67 passed (72)

Failures proved:
- GET /v1/runs/{id} absent (queued projection returned 404)
- RunProjectionSchema absent
- queued/no-answer classified pending rather than loading
- typed FAILED classified pending rather than failed
- genuinely missing run indistinguishable from a live run
```

GREEN focused + provider-double proof:

```text
$ pnpm vitest run tests/unit/contract.test.ts tests/unit/api.test.ts \
  tests/unit/v2ui-data-layer.test.ts tests/unit/load01-live-proof.test.ts \
  tests/unit/load01-run-projection.test.ts
Test Files  5 passed (5)
Tests       75 passed (75)

$ pnpm -s typecheck
$ tsc --noEmit
```

Provider-double composition proof output:

```text
✓ LOAD-01 provider-double composition proof
  POST /new equivalent -> queued run ref -> debate loading projection keeps the real question
Test Files  1 passed (1)
Tests       1 passed (1)
```

The proof runs the real Fastify facade and generated contract client against a stateful test-layer application double: POST returns `run:load01/QUEUED`; both answer reads honestly 404; `GET /v1/runs/run:load01` supplies the real `Messi or Ronaldo?` question; the SSR seam returns typed `loading`, never 404. No production provider or standing service was touched.

## Mutation-proof assertions

- Remove the new contract route/schema/client read → contract/API/live-proof tests fail.
- Turn all answer 404s into loading → the typed missing-run `not_found` assertion and page `notFound()` guard fail.
- Turn a queued run into not-found/pending → V's exact-flow and provider-double tests fail.
- Drop the real question line or replace it with placeholder copy → adapter and provider-double assertions fail.
- Drop FAILED or its required reason → strict schema, failed SSR result, V2 failed projection, and XREV loud-stop assertions fail.
- Reorder FAILED below CLAIMED/READY → repository state-precedence assertions fail.
- Stop threading `initialError` or remove the failed/loading page branches → typed server-data and render assertions fail.

Rev2 mutations were executed and restored one at a time:

- GROK-B1, replace the production recorder call with `recorded = true`: `expect(recordTerminalFailure).toHaveBeenCalledWith({ runId, workItemId, reason })` failed with `Number of calls: 0`.
- OPUS-B1, restore the fabricated `{ pct: 40, label: "Models arguing" }`: the real-render `expect(html).not.toContain("Models arguing")` failed. The final parameterized assertion covers QUEUED, CLAIMED, and RUNNING.
- OPUS-B2, leave the terminal transition at `status: generating / run_state: RUNNING`: the real-render `expect(html).toContain("Failed")` failed (the received render said Running and retained `progressStrip`).
- OPUS-B3a, add `OR 1=1` to the projection ownership predicate: `expect(foreign.statusCode).toBe(404)` failed because the real route returned 200.
- OPUS-B3b, disable the run-route 401 guard: `expect(anonymous.statusCode).toBe(401)` failed because the real route returned 500.
- OPUS-B4, replace `notFound()` with `if (0) notFound()`: the behavioral `rejects.toThrow("NEXT_NOT_FOUND")` assertion failed because the real page component resolved.

All mutation edits were restored before the GREEN and full-gate runs.

## Full gates

```text
$ pnpm run generate:contract && pnpm test
Test Files  70 passed (70)
Tests       493 passed (493)

$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)

$ pnpm -s typecheck
$ tsc --noEmit

$ pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

$ pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0

$ git diff --check
(no output)
```

Rev2 real output:

```text
$ pnpm vitest run --config vitest.load01-render.config.ts
Test Files  1 passed (1)
Tests       5 passed (5)

$ pnpm test
Test Files  71 passed (71)
Tests       494 passed (494)

$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)

$ pnpm generate:contract
$ tsx packages/contract/src/generate.ts

$ pnpm typecheck
$ tsc --noEmit

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json

$ pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

$ pnpm audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0

$ git diff --check
(no output)
```

The first rev2 full-suite attempt was 493/494 because the new ownership fixture left a READY work item for the later global `claimNext` test. The fixture now records `TEST_FIXTURE_CLEANUP` in `finally`; the clean rerun above is 494/494.

## Rev3 enforcement rework

Opus rev2 confirmed all five product fixes by execution and found two enforcement blockers. Rev3 changes only their test attachment:

- R1: root `vitest.config.ts` includes both `tests/**/*.test.ts` and `tests/**/*.test.tsx` and owns the JSX/React/`@/`/Next-stub configuration. The unreferenced `vitest.load01-render.config.ts` was removed, so there is one enforced runner rather than another sidecar.
- R2: `createDebatePageRunEventConsumer` is now the single consumer passed to `contractClient.streamEvents`. The B2 test creates that real consumer, feeds it a schema-parsed `run.terminal`, captures its `updateDebate` and `writeError` effects, then renders the resulting real client state. It no longer invokes `debateAfterRunTerminalFailure` directly.

Collection proof:

```text
$ pnpm vitest list --filesOnly
...
tests/render/load01-debate-page.test.tsx
...
72 files collected (the rev2 baseline listed 71 and omitted tests/render)
```

Rev3 mutations, each run with the enforced plain command and restored immediately:

```text
$ pnpm test                         # restore fabricated 40% / Models arguing
Test Files  1 failed | 71 passed (72)
Tests       3 failed | 496 passed (499)
Killer: each QUEUED/CLAIMED/RUNNING real-render assertion rejects "Models arguing".

$ pnpm test                         # sever only terminal consumer's updateDebate/transition call
Test Files  1 failed | 71 passed (72)
Tests       1 failed | 498 passed (499)
Killer: event-consumer render expected Failed, received Running plus the live progress strip.

$ pnpm test                         # delete the complete page not_found branch
Test Files  1 failed | 71 passed (72)
Tests       1 failed | 498 passed (499)
Killer: real async page was expected to reject NEXT_NOT_FOUND but resolved DebatePageGate.
```

Clean rev3 gates:

```text
$ pnpm test
Test Files  72 passed (72)
Tests       499 passed (499)

$ pnpm vitest run tests/render/load01-debate-page.test.tsx
Test Files  1 passed (1)
Tests       5 passed (5)

$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)

$ pnpm generate:contract
$ tsx packages/contract/src/generate.ts

$ pnpm typecheck
$ tsc --noEmit

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json

$ pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

$ pnpm audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0

$ git diff --check
(no output)
```

The standing stack remained untouched and no `next build` or Git operation was performed.

The root-provided skeleton gates `tests/render-templates.sh` and `tests/lint-templates.sh` are absent in this checkout, as are `skeleton/`, `VERSION`, and `docs/upgrade-guide.md`; no skeleton template was changed.

## DDD / SOLID / DR-115

- The run aggregate owns the persisted question and lifecycle projection; the UI consumes a typed read model rather than inferring existence from an answer 404.
- Contract, repository, API, server-data, and presentation responsibilities remain separate.
- No progress, question, terminal reason, or fallback content is fabricated. Nonfailed states forbid a terminal reason; FAILED requires one. Transport uncertainty stays typed pending.
- Reads remain asker-scoped end to end.

## Environment tail

- The standing stack was not restarted or modified.
- Full and acceptance gates used their own temporary embedded PostgreSQL instances and shut them down cleanly.
- No `next build`, commit, branch, worktree, push, merge, release, destructive filesystem action, or product-data write was performed.

## Questions for V

None blocking. Visual acceptance remains with V after the dual review diamond; the code-level proof exercises the exact navigation data flow without touching the standing pre-migration stack.
