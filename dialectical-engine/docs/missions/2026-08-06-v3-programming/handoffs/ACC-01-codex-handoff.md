# ACC-01 Codex handoff — DR-126 acceptance harness

Ticket: `t_0dc09131`  
Worker session: thread `019fe5bd-f053-7661-810f-f11954c4d47a` / Kanban run 52  
Assignment: rework; run 51 was zombie-guard reclaimed after its killed PTY and
the V-directed DR-137/138 resume continued in the same durable thread  
Git: V-owned shared working tree only; no commit, push, branch, merge, reset, or
other Git write operation was performed.

## Outcome

ACC-01 adds an acceptance-only mechanism under `acceptance/` that provisions a
standing embedded PostgreSQL database through the shipped mmap seam, seeds the
V-approved register, exposes a fixed codex-CLI OpenAI-compatible relay, boots a
strict Hatchet-free API composition with a no-op dispatcher, drives one ask
through `WalkingSkeletonRunner`, and prints the run/answer/UI references.

DR-136 is seeded byte-faithfully as:

```json
{
  "kind": "CONVERGENCE_STOP_DEFAULTS",
  "members": {
    "maxRounds": 3,
    "stopWhenDeltaBelowEpsilon": true
  }
}
```

Its source is exactly `acceptance:DR-136:V-approved`; all DR-133 rows retain
`acceptance:DR-133:V-approved`.

DR-135 is the live acceptance terminal policy. With zero outstanding WAIT rows
it returns an empty resolution list. With any outstanding WAIT row it throws
`ACCEPTANCE_TERMINAL_WAIT_ROWS_UNRESOLVED` before the runner calls the database
drain, leaving every WAIT activation untouched. The blanket-INACTIVE resolver
is still available only through a `NODE_ENV=test`-guarded test argument; it is
never live configuration.

The outside-sandbox dry-run gate is GREEN. Live ceremony 2 also proved the
fresh register, DR-137 admission and a schema-valid real GPT-5.6 judge call.
Its actual ledger contained `JUDGEMENT_SCHEDULED`, one `MODEL_CALL`, and
`PROPAGATION`; composition and conformance did not run because the default
question honestly failed the restatement gate. DR-135 then refused settlement
with all 64 WAIT rows untouched, exactly as ruled. This wording incorporates
the orchestrator's `2026-08-09 16:59` correction and does not repeat its earlier
overclaim.

Live ceremony 1 reached the real model through the shim and then failed loud at
the unchanged strict judge parser because the production prompt did not declare
its output schema. Under the narrow authorization in ticket comment 317, the
prompt now declares every ruled field, type and closed enum. A provider double
reproduced the observed wrong `fallacy` shape RED before the prompt correction
made it GREEN. The judge hash changed from `8ac50429892a19372c7d5fa2b362872ffb1c5dbf292695be5738045600771de0`
to `8e071c51400ea15f8876cfe206559aa32baad40f9050e6dd9ea53541e783e102`;
the acceptance seed's post-conflict comparison rejects a standing stale hash.

Claude review rev 1 then found acceptance-local maker and run-envelope rule
substitutions. B1 is corrected: the composition now calls shipped
`readDeploymentMakerCapability`, `readRunCostEnvelopePolicy`, and
`resolveRunCostEnvelopeBasis`; the hardcoded capability and summed attempt cap
are gone.

DR-137 resolves B2. The seeded provider row continues to state the honest one
OpenAI maker and shipped critique derives capability from it. Casual and
standard runs admit a capable single-maker deployment; high-stakes admission
independently retains the two-distinct-maker floor. No capability literal or
waiver exists in the acceptance root.

DR-138 resolves B3. `runCostEnvelope` is now the exact shipped member row for
the default acceptance ask: `{depth_params:{depth:1}, risk_tier:"standard",
max_model_attempts:9}`, with source exactly
`acceptance:DR-138:V-approved`. The value is never summed or stamped with
DR-133 provenance. DR-133's already-approved per-organ call bounds remain in
the acceptance-only `acceptanceOrganCostBounds` row, so no ruled value is lost
and the shipped run-level reader remains schema-exact.

The `2026-08-09 17:47` browser finding is also corrected. V3 now has its own
same-origin `/api/[...path]` proxy, adapted to the V3 `/v1/...` contract without
importing the kept V2 implementation. Browser calls are prefixed with `/api`,
while SSR and the proxy alone read the server-only `DIALECTICAL_API_BASE`.
The proxy forwards the method, encoded path, query, body and received headers
(including `x-user-dev-token`), removes only transport-owned `host`/`expect`,
and returns the upstream `ReadableStream` directly for SSE.

## Inventory

- `acceptance/standing-db.ts`: persistent default `acceptance/.pgdata`,
  operator-supplied fixed port, mmap init/start flags, already-running reuse,
  migrations, database creation, and loud provisioning failure.
- `acceptance/seed-register.ts`: bootstrap plus ruled acceptance rows,
  per-row provenance, at-seed-time contract hashing, transactional idempotent
  insert, and exact persisted-value/provenance/version verification.
- `acceptance/runtime-policy.ts`: strict readers for cost, composition,
  confidence ceiling, provider and hashes. The way-of-knowing map uses the
  shipped `Partial<Record<WayOfKnowing, number>>` shape and never pads absent
  shares. Per-organ bounds come from the acceptance-only DR-133 row; run-level
  envelope selection delegates to the shipped DR-138 register reader and
  resolver rather than deriving a total locally.
- `acceptance/model-shim.ts`: fixed ChatGPT codex binary, fixed
  `gpt-5.6-sol`, true maker `OpenAI`, closed stdin, prompt-echo stripping,
  configurable port/deadline, and loud nonzero/timeout behavior with no choice
  fabrication.
- `acceptance/main.ts`: strict acceptance environment, `NoopDispatcher`,
  canonical risk, maker-capability and envelope wiring through shipped rules,
  shipped API/provider/runner composition, and the lawful live DR-135 refusing
  evaluator.
- `acceptance/run-acceptance.ts`: strict required token and asker arguments,
  DB/seed/shim/API boot, real POST, work lookup, direct execute, same-token
  answer read, and run/answer/UI output.
- `acceptance/ceremony.test.ts`: real embedded-PG dry run with only test-layer
  provider and blanket evaluator doubles; failures print response status/body.
- `acceptance/model-shim.test.ts`, `seed-register.test.ts`,
  `refusing-evaluator.test.ts`, `runtime-policy.test.ts`, and
  `run-acceptance.test.ts`: focused TDD fixtures.
- `acceptance/test-fixtures/fake-codex-cli.mjs`: test-only CLI process.
- `acceptance/README.md`, `.gitignore`, `tsconfig.json`, and
  `vitest.config.ts`: operation, audit-scope, persistence and isolated-check
  documentation.
- `docs/missions/2026-08-06-v3-programming/handoffs/ACC-01-progress.log` and
  `ACC-01-gate{1,2,3}.log`: durable timeline and outside-sandbox evidence.
- `packages/judgement/src/index.ts` and `tests/unit/judgement.test.ts`: narrowly
  authorized production judge schema declaration and its live-shaped RED/GREEN
  regression.
- `packages/critique/src/index.ts` and `tests/unit/critique-s08.test.ts`:
  narrowly authorized DR-137 tier-aware maker admission, including standard
  one-maker admission and retained high-stakes refusal.
- `package.json` and `pnpm-lock.yaml`: root workspace link to the shipped
  `@debateai/critique` public API used by the acceptance composition.
- `web/app/api/[...path]/route.ts`: V3-owned same-origin proxy with strict
  `DIALECTICAL_API_BASE`, request forwarding and streaming response passthrough.
- `web/lib/api.ts` and `web/lib/serverApi.ts`: browser `/api` adapter around the
  unchanged generated client and direct server-only upstream configuration.
- `web/app/api/[...path]/route.test.mjs`,
  `web/app/api/proxyHeaders.source-test.mjs`, `tests/unit/s14-ui.test.ts`, and
  `tests/architecture/s14-contract.test.ts`: proxy/client behavior and S14
  structure coverage.
- `web/.env.local`: `NEXT_PUBLIC_API_BASE=/api` and
  `DIALECTICAL_API_BASE=http://127.0.0.1:8790` for the acceptance operator run.

No API application, migration, parser, provider gateway, or product data was
changed. The production-package delta is limited to the exact judge-prompt
declaration authorized by comment 317, the critique admission edit authorized
by DR-137/comment `2026-08-09 15:45`, and the V3 web-only proxy/base correction
authorized by comment `2026-08-09 17:47`. The pre-existing modified
`../.claude/launch.json`, modified decisions ledger, untracked mission
acceptance draft, and reviewer artifacts remain owned by their authors.

## Fixture-by-fixture status

| Fixture / requirement | Result | Evidence |
|---|---|---|
| Shim request → CLI, closed stdin, response/model/maker shaping, echo removal | GREEN | `model-shim.test.ts` |
| CLI nonzero and timeout produce HTTP 5xx/504 without choices or fallback | GREEN | `model-shim.test.ts` |
| DR-133 supplied values and DR-136 exact row/provenance | GREEN | `seed-register.test.ts` |
| Five hashes independently recomputed from shipped ruled texts | GREEN | `seed-register.test.ts` |
| Partial way-of-knowing cuts preserve absent LOOKED_UP/RAN | GREEN | `runtime-policy.test.ts`; Gate 1 correction |
| DR-135 zero-WAIT empty result and any-WAIT typed refusal | GREEN | `refusing-evaluator.test.ts` |
| Canonical asker-vs-policy risk authority | GREEN | `refusing-evaluator.test.ts`; Gate 2 correction |
| Shipped maker/envelope delegation; no local capability or summed cap | GREEN | `runtime-policy.test.ts`; Claude B1; DR-137/138 |
| Standard one-maker admission and retained high-stakes two-maker floor | GREEN | `critique-s08.test.ts`, 15/15 |
| Exact ruled run-level cap 9 with DR-138 provenance | GREEN | `seed-register.test.ts`; shipped `readRunCostEnvelopePolicy` wiring |
| Real model receives the full strict judge schema | GREEN locally and live | `judgement.test.ts`; `ACC-01-live-ceremony2.log` |
| Token required; asker-input defaults; unknown args rejected | GREEN | `run-acceptance.test.ts` |
| DB/migrations, seed rerun no-op, POST, execute, owner read, foreign denial | GREEN | `ACC-01-gate3.log`, 1/1 |
| Production reachability/orphan honesty | GREEN | `acceptance/README.md`; source audit `blocking: []` |
| Same-origin browser proxy: method/path/query/body/token + SSE | GREEN locally | route tests 5/5; S14 focused 18/18; Next build exposes `ƒ /api/[...path]` |
| Browser Settings Verify + debate read | PENDING LIVE RE-PROOF | Orchestrator owns per ticket comment `2026-08-09 17:47` |
| Real codex CLI → settle → same-token rendered UI | PENDING TERM-01/DONE GATE | Live ceremony 2 reached the ruled DR-135 refusal with 64 WAIT rows untouched |

## TDD RED → GREEN

Initial implementation RED:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/model-shim.test.ts acceptance/seed-register.test.ts
Test Files 2 failed (2)
Cannot find module './model-shim.js'
Cannot find module './seed-register.js'

$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/run-acceptance.test.ts
Test Files 1 failed (1)
Cannot find module './run-acceptance.js'
```

DR-135/136 RED after the V rulings:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/seed-register.test.ts acceptance/refusing-evaluator.test.ts
Test Files 2 failed (2)
Tests 3 failed (3)
convergenceStopDefaults: received undefined
resolveAcceptanceTerminalActivations is not a function
```

Outside-sandbox Gate 1 RED and focused correction:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files 1 failed (1); Tests 1 failed (1)
ZodError: minimumShares.LOOKED_UP and minimumShares.RAN expected number, received undefined

$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/runtime-policy.test.ts
Test Files 1 failed (1); Tests 1 failed (1)
parseAcceptanceRuntimeRows is not a function
```

The correction uses `z.partialRecord` and retains the ruled JSON unchanged.

Outside-sandbox Gate 2 RED and focused correction:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files 1 failed (1); Tests 1 failed (1)
POST /v1/asks: expected 202, received 500
PostgreSQL: new row for relation "run" violates check constraint "run_check"

$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/refusing-evaluator.test.ts
Test Files 1 failed (1); Tests 1 failed | 2 passed (3)
resolveAcceptanceRisk is not a function
```

The correction delegates to shipped `resolveEffectiveRiskTier`: equal
standard/standard stays `ASKER`; deployment provenance is recorded only when
policy raises the tier. The ceremony now throws status plus body on a future
POST failure.

Live ceremony 1 and prompt-declaration RED/GREEN:

```text
$ ./node_modules/.bin/tsx acceptance/run-acceptance.ts --token <same-ui-token>
TypedDomainError / JUDGE_SCHEMA_FAILURE
fallacy.severity missing; fallacy.fatalFlags missing
unrecognized fallacy keys: detected, type, explanation

$ ./node_modules/.bin/vitest run tests/unit/judgement.test.ts
RED: Test Files 1 failed (1); Tests 1 failed | 3 passed (4)
GREEN: Test Files 1 passed (1); Tests 4 passed (4)
```

Claude B1 shipped-rule delegation RED/GREEN:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/runtime-policy.test.ts
RED: Test Files 1 failed (1); Tests 1 failed | 1 passed (2)
missing readDeploymentMakerCapability delegation
GREEN: Test Files 1 passed (1); Tests 2 passed (2)
```

DR-137 tier-aware maker admission RED/GREEN:

```text
$ ./node_modules/.bin/vitest run tests/unit/critique-s08.test.ts
RED: Test Files 1 failed (1); Tests 2 failed | 13 passed (15)
- requiredDistinctMakers=1: CONFIGURED_PROVIDER_SET_INVALID
- high-stakes one-maker availability: expected throw, but it did not throw
GREEN: Test Files 1 passed (1); Tests 15 passed (15)
```

DR-138 ruled run-envelope seed RED/GREEN:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/seed-register.test.ts acceptance/runtime-policy.test.ts
RED: Test Files 2 failed (2); Tests 2 failed | 1 passed (3)
- acceptanceOrganCostBounds row absent
- strict runtime parser did not recognize the separated acceptance bounds
GREEN: Test Files 2 passed (2); Tests 3 passed (3)
```

Same-origin UI proxy RED/GREEN:

```text
$ node app/api/'[...path]'/route.test.mjs
RED: Tests 3 failed (3) — route.ts absent
GREEN: Tests 3 passed (3)

$ node app/api/proxyHeaders.source-test.mjs
RED: ENOENT app/api/[...path]/route.ts
GREEN: Tests 2 passed (2)

$ ./node_modules/.bin/vitest run tests/architecture/s14-contract.test.ts tests/unit/s14-ui.test.ts
RED: Test Files 2 failed (2); Tests 2 failed | 16 passed (18)
- route.ts ENOENT
- createBrowserContractClient is not a function
GREEN: Test Files 2 passed (2); Tests 18 passed (18)
```

Final local GREEN:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/model-shim.test.ts acceptance/seed-register.test.ts acceptance/refusing-evaluator.test.ts acceptance/runtime-policy.test.ts acceptance/run-acceptance.test.ts
Test Files 5 passed (5)
Tests 12 passed (12)

$ ./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json
exit 0

$ ./node_modules/.bin/tsc --noEmit -p web/tsconfig.json
exit 0
```

## Exact repository checks

```text
$ ./node_modules/.bin/vitest run tests/unit tests/architecture
Test Files 44 passed (44)
Tests 259 passed (259)

$ pnpm run typecheck
$ tsc --noEmit
exit 0

$ pnpm run lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm --filter dialectical-engine-web build
Compiled successfully; type validation passed
Route: ƒ /api/[...path]
```

## Outside-sandbox database gate history

- Gate 1: RED at runtime-policy parsing; full output in `ACC-01-gate1.log`.
- Gate 2: RED at run insertion after advancing through DB, seed and runtime;
  full output in `ACC-01-gate2.log`.
- Gate 3: GREEN, real embedded PostgreSQL:

```text
$ ./node_modules/.bin/vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
✓ seeds idempotently, submits through the real API root, settles, and reads through the same token
Test Files 1 passed (1)
Tests 1 passed (1)
Duration 1.53s
```

Gate 3 proved migrations, idempotent seed, POST 202, runner `COMPLETED`, owner
answer 200 and foreign-token 404.

## AC / design-pattern evidence

- AC-76/DR-039: only V-stated register values are materialized. Absent WOK keys
  remain absent; DR-136 is the only convergence source; the run-level `9` has
  DR-138 provenance and is not synthesized from the three organ caps.
- DR-115: runtime model output comes only from the real codex process; failures
  stay failures. The fake command and blanket resolver are rejected outside
  `NODE_ENV=test`. DR-135 returns no fabricated rows.
- P3/P8: `main.ts` is a thin composition root; dispatcher substitution is
  through the existing interface, with no product-mode conditional. Maker
  admission and envelope basis now call the same shipped rules as production.
- P13: the harness consumes recorded order/artifacts through shipped packages;
  it does not re-derive replay structure.
- P17: no DDL or migration was added; register contents use existing tables and
  idempotent inserts.
- Reachability: acceptance imports product APIs; product roots never import
  acceptance. The production orphan walk excludes these explicitly documented
  non-production entry points instead of falsely claiming `ATTACHED`.

## Ask-input defaults

All are caller inputs and overrideable by their named flag:

- question: `What is the strongest case for adopting this proposal?`
- risk tier: `standard`
- tier provenance: `acceptance:cli-default`
- composition budget tier: `low`
- depth: `{"depth":1}`
- agent count: `1`
- decision/action owners: `acceptance-user`
- decision scope: `prototype-acceptance`
- `as_of`: invocation time, ISO-8601
- steering presets/annotations: `[]`

## Environment tail / UI wiring

The operator supplies the fixed DB/API/shim ports, API host, stranger sample
rate, battery version, settlement-watch handle, and same UI ownership token.
No Hatchet key exists in the acceptance schema.

```text
NEXT_PUBLIC_API_BASE=/api
DIALECTICAL_API_BASE=http://127.0.0.1:<ACCEPTANCE_API_PORT>
```

```text
./node_modules/.bin/tsx acceptance/run-acceptance.ts --token <same-ui-token>
```

Live ceremony 2 confirmed that the shipped ask creates 64 initial WAIT rows and
that the real DR-135 evaluator refuses without changing them. It also exposed
that the old default question is not self-contained enough to pass the honest
restatement gate; ceremony 3 will supply an explicit complete question. The
orchestrator must still report lawful settlement plus the real Settings Verify
and same-token rendered debate evidence before DONE.

Live ceremony 2 must use fresh `acceptance/.pgdata`: version 1 now carries the
new judge hash and exact DR-138 row shape/provenance. Reusing old sealed state
must fail loud through `ACCEPTANCE_REGISTER_CONFLICT:<row_key>`; it must never
silently rewrite a sealed value.

## Acknowledged deferrals

- TERM-01 owns the real product terminal-activation evaluator and is held by
  ruling; ACC-01 contains only the lawful acceptance refusal.
- The full DR-023 convergence-parameter sitting may revise DR-136 at a later
  register version; version 1 uses the provisional value exactly as ruled.
- DR-121-r reaffirms that Docker and Hatchet remain deferred through this
  acceptance pass.
- The browser proxy correction satisfies ACC-01 contents item 6. All other S14
  carry-forwards remain outside scope.

## QUESTIONS FOR V — asked and ruled

1. B2 / maker floor — **RULED by DR-137.** Mono-model runs are lawful at casual
   and standard; high-stakes retains the two-maker floor. Implemented through
   the shipped capability row and critique admission, with no literal waiver.
2. B3 / run envelope — **RULED by DR-138.** The exact run-level
   `max_model_attempts` is 9 for `{depth:1, standard}`, sourced from
   `acceptance:DR-138:V-approved`; no sum or borrowed provenance remains.

No ACC-01 value question remains open. The 64-WAIT product-truth risk remains
owned by TERM-01/the live DONE gate and is not permission to use the test
blanket.
