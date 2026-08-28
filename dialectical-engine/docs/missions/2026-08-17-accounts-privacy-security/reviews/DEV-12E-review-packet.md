# DEV-12E independent review packet

## Requested verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 defect in this bounded local provider/runner lifecycle and the repairs required to complete one real QA debate.
- `BLOCK` — at least one concrete P0/P1 defect, with the exact source path, failure sequence, and smallest structural repair.

Read-only review. Do not edit files, stop the running stack, mutate the QA database, disclose local credentials, or broaden this ticket into production provider deployment.

## Ticket and current state

Kanban: `auth-front-door` / `t_8428a0d5`  
Title: `DEV-12E · Own deterministic provider and runner lifecycles`  
State: implementation and live product proof GREEN; Claude Opus 5 round-1
`BLOCK` repairs are GREEN; terminal round-2 review pending.

The local supervisor must own one loopback OpenAI-compatible deterministic QA provider and the production runner. It starts the provider before API discovery, starts the runner after the API/register environment, reports exact readiness, supervises API/UI/provider/runner exit, and stops only its owned resources in reverse order. The real browser must be able to create a debate that the real runner settles and the owner publishes.

## Frozen review paths

- `apps/runner/src/dev-auth-stack.ts`
- `apps/runner/src/dev-auth-stack-cli.ts`
- `apps/runner/src/dev-local-provider.ts`
- `apps/runner/src/dev-runner-process.ts`
- `apps/runner/src/dev-api-environment.ts`
- `apps/runner/src/dev-api-process.ts`
- `apps/runner/src/dev-deployment-register.ts`
- `apps/runner/src/main.ts`
- `apps/runner/src/provider-topology.ts`
- `apps/runner/src/runner-startup-reconciliation.ts`
- `apps/api/src/provider-discovery.ts`
- `apps/api/src/main.ts`
- `apps/api/src/index.ts`
- `apps/api/src/publications.ts`
- `migrations/0048_provider_probe_capability.sql`
- `migrations/0049_terminal_recorded_facts.sql`
- `packages/battery/src/terminal.ts`
- `apps/ui/lib/v3/census.ts`
- `tests/unit/dev-auth-stack.test.ts`
- `tests/unit/dev-runner-process.test.ts`
- `tests/unit/dev-runner-reconciliation.test.ts`
- `tests/unit/api-provider-discovery.test.ts`
- `tests/unit/ui-census.test.ts`
- `tests/architecture/dev-runner-provider-set.test.ts`
- `tests/architecture/dev-runner-terminal-evaluator.test.ts`
- `tests/architecture/dev-deployment-register.test.ts`
- `tests/integration/settlement-database.test.ts`
- `tests/integration/dev-api-environment.test.ts`
- `tests/integration/dev-api-process.test.ts`
- `tests/integration/dev-database-principals.test.ts`
- `tests/integration/dev-deployment-register.test.ts`
- `tests/unit/s8-publication-http.test.ts`
- `tests/integration/s8-publication-database.test.ts`
- `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`

## Intended boundary

- The provider binds only `127.0.0.1:8791`, accepts only `POST /v1/chat/completions`, validates the exact development model and bounded message body, and implements only the sealed runner prompts. Unsupported input is a typed 4xx, never an ambient model call.
- `dev:auth:up` starts data → token/env → provider → API → runner → UI → TLS. It owns every newly started handle, rejects occupied public port 3000, and unwinds the started prefix in exact reverse order.
- The runner is the real `apps/runner/src/main.ts`, receives only an explicit environment, loads sealed register v3, validates every configured provider target, reconciles bounded ready work before its IPC-ready receipt, and sends one exact `DEBATEAI_RUNNER_READY` message.
- Provider discovery re-probes a recovered `ABSENT` target and writes probe evidence only through the narrow runtime capability in migration 0048.
- Terminal evaluation reads its bounded recorded facts through the narrow runtime capability in migration 0049; runtime has no direct evidence-table read grant.
- The UI census treats the final reduced judgement as judged while keeping derived-standing precedence and set-aside exclusivity.
- Local publication is enabled only through the already isolated publication authorization/cleanup principals and independent publication-key custody. No public snapshot is created without owner step-up.

## Reproduce-first live failures repaired

1. The first real runner reached terminal evaluation and failed with PostgreSQL `permission denied for schema evidence`; migration 0049 replaced the broad read with one bounded runtime capability.
2. The next run failed typed `TERMINAL_ACTIVATION_UNRESOLVED` because the development register lacked liveness policy; additive sealed register v3 supplies the exact policy and the runner selects it explicitly.
3. The settled run then crashed the page with `CENSUS_PARTITION_INVALID`; the final-strength census rule was repaired and regression-tested.
4. Publication was initially disabled in the local API environment; enabling it with the existing isolated publication principals and independent corpus key/store made the real owner step-up publication succeed.

## Restored verification

```text
pnpm exec vitest run \
  tests/unit/dev-auth-stack.test.ts \
  tests/unit/dev-runner-reconciliation.test.ts \
  tests/architecture/dev-runner-provider-set.test.ts \
  tests/architecture/dev-runner-terminal-evaluator.test.ts
```

Result: `4/4` files, `27/27` tests GREEN.

The adjacent repaired gate was also run:

```text
pnpm exec vitest run \
  tests/unit/ui-census.test.ts \
  tests/unit/battery-terminal.test.ts \
  tests/unit/dev-runner-reconciliation.test.ts \
  tests/architecture/dev-runner-terminal-evaluator.test.ts \
  tests/architecture/dev-deployment-register.test.ts \
  tests/integration/dev-secret-files.test.ts \
  tests/integration/dev-api-environment.test.ts \
  tests/integration/dev-api-process.test.ts \
  tests/unit/api-provider-discovery.test.ts \
  tests/unit/api-operational-error.test.ts
```

Result: `10/10` files, `43/43` tests GREEN. `pnpm typecheck` and `git diff --check` are GREEN.

## Live product proof — 2026-08-27T14:54:56Z

- Listeners: TLS `3000`, private UI `3001`, API `8790`, provider `8791`.
- Exact provider discovery request: HTTP `200`, model `qa-deterministic-v1`, one choice, content `OK`.
- Anonymous public-origin session probe: HTTP `401`, body `{"error":"SESSION_REQUIRED"}`.
- Production runner process is live as `apps/runner/src/main.ts` under the supervisor.
- Run `507222d6-6789-44a0-adce-bad923864205`: `agent_count=1`, `register_version=3`, exactly one answer, `serve_state=COMPOSED`, terminal `DOWNGRADED`.
- Owner step-up publication `d89b38a4-f188-4840-94bd-a2dece92f275` references that exact run and renders through the anonymous public route.

`DOWNGRADED` is honest product state for one configured local lineage; this ticket proves every responder is included, not that multiple external makers are configured.

## Non-vacuous exit supervision mutants

The final test now resolves each API, UI, provider, and runner exit independently and requires the exact component tag.

1. Provider exit mislabeled as API → exact focused test RED (`expected API to equal PROVIDER`), receipt `/private/tmp/dev12e-provider-exit-mutant-red.log`.
2. Runner exit mislabeled as UI → exact focused test RED (`expected UI to equal RUNNER`), receipt `/private/tmp/dev12e-runner-exit-mutant-red.log`.
3. Both production mutations were restored; `apps/runner/src/dev-auth-stack.ts` SHA-256 is `4e65fc44a0416f6dc0a9fd62f17c28f368f93e6914254fd5c743ef176b967e54`, and the restored four-file gate is `27/27` GREEN.

## Claude Opus 5 round-1 BLOCK and repairs

Round 1 is preserved in
[`DEV-12E-claude-opus-5-round-1.md`](./DEV-12E-claude-opus-5-round-1.md).
Both P1 findings were reproduced behaviorally before repair.

1. **Provider post-listen fault supervision.** The real listening provider first
   threw the injected server fault outside supervision. It now retains a
   post-listen server-error observer, settles its exact `exited` receipt with
   code `1`, and the supervisor performs the six-resource reverse unwind. The
   request handler also contains its asynchronous rejection. Removing the
   post-listen settlement made the exact title hang at the forbidden exit; the
   mutant process was terminated only after RED, the source was restored, and
   the exact title passed.
2. **Run-scoped scorecard facts.** The original PostgreSQL witness observed
   `[2,2]` because both runs saw the global scorecard count. The capability now
   counts only scorecard cells whose recorded `derivation_input` references an
   `answer_outcome_id@at_seq` belonging to the subject run. Restoring the global
   predicate made the exact actual-role title RED as `[1,1]`; the restored
   result is `[1,0]`.

Round-1 P2 requests were also closed:

- `debateai_runtime` is proved unable to INSERT `core.provider_probe` by both
  catalog inspection and an actual `SET ROLE debateai_runtime` statement that
  fails `42501`.
- One exported `DEVELOPMENT_LOCAL_PROVIDER_TARGET` now drives provider bind,
  API discovery environment/validation, deployment register, and runner. The
  stack rejects a mismatched start receipt before API start and unwinds its
  owned prefix.
- Provider discovery now has resolver-scoped single-flight. Twelve concurrent
  stale callers produce one read, one HTTP probe, and one durable observation.
- The review scope now directly includes `apps/api/src/index.ts` and
  `apps/api/src/publications.ts` plus the HTTP and actual-PostgreSQL publication
  gates.

## Current frozen verification after round-1 repair

All commands below ran on the bytes sent for round 2:

```text
pnpm exec vitest run \
  tests/unit/dev-auth-stack.test.ts \
  tests/unit/dev-runner-process.test.ts \
  tests/unit/dev-runner-reconciliation.test.ts \
  tests/unit/api-provider-discovery.test.ts \
  tests/unit/ui-census.test.ts \
  tests/architecture/dev-runner-provider-set.test.ts \
  tests/architecture/dev-runner-terminal-evaluator.test.ts \
  tests/unit/s8-publication-http.test.ts
```

Result: `16/16` suites, `47/47` tests GREEN. Receipt
`/private/tmp/dev12e-unit-arch.json`, SHA-256
`892b257c0c87ed009ca3b7061d150f69b94c7a15192d65fa9160d25cf54a7688`.

```text
pnpm exec vitest run \
  tests/integration/dev-api-environment.test.ts \
  tests/integration/dev-api-process.test.ts \
  tests/integration/dev-deployment-register.test.ts
```

Result: `6/6` suites, `16/16` tests GREEN. Receipt
`/private/tmp/dev12e-dev-env.json`, SHA-256
`38ce1d33d3867c60b1affbae16a54da03a1387ef54504172ca2318731f0baa9e`.

```text
pnpm exec vitest run \
  tests/integration/settlement-database.test.ts \
  tests/integration/dev-database-principals.test.ts
```

Result: `4/4` suites, `11/11` tests GREEN on isolated PostgreSQL. Receipt
`/private/tmp/dev12e-pg-core.json`, SHA-256
`8afddc56095a56eb09f218aac8ab4e21c0246fdc88e9e366b647906e11ef0feb`.

```text
pnpm exec vitest run tests/integration/s8-publication-database.test.ts
```

Result: `2/2` suites, `26/26` tests GREEN on isolated PostgreSQL. Receipt
`/private/tmp/dev12e-s8-pg.json`, SHA-256
`efce2a281e111df0bdbc5dace4b89eddecdb599928a1346e076f5f7ac062fce8`.

```text
pnpm exec vitest run \
  tests/unit/battery-terminal.test.ts \
  tests/architecture/dev-deployment-register.test.ts
```

Result: `4/4` suites, `13/13` tests GREEN. Receipt
`/private/tmp/dev12e-adjacent.json`, SHA-256
`065280adae60206406ffd618e1f0a241cdba874b81e3101e824b9698edcd72fa`.

`pnpm typecheck` and `git diff --check` both exit `0`.

## Review questions

1. Can any occupied/wrong listener be adopted, replaced, or falsely reported ready?
2. Can provider or runner exit leave the rest of the owned stack running, or can cleanup affect a reused dependency?
3. Can the deterministic provider reach external network, accept an unbounded body, execute an unsupported prompt, or expose a credential?
4. Can the runner report ready before policy/provider validation and startup reconciliation complete?
5. Can a recovered provider remain excluded because stale `ABSENT` evidence is treated as authoritative?
6. Do migrations 0048/0049 grant broader table/schema access than the exact capabilities require?
7. Can the census repair double-count a derived/set-aside node or make an unjudged node look judged?
8. Is publication reachable without the existing owner step-up and isolated publication custody?
9. Is any live or test claim broader than the demonstrated single configured local responder?

## Honest residuals

- This is a deterministic local QA provider, not a production model deployment and not evidence of multi-maker availability.
- The answer is intentionally reasoning-only and `DOWNGRADED`; no external research source was invented.
- The complete repository suite has not been rerun after this narrow live-repair tranche; proportional gates and the live path above are the current evidence.
- Q56 intentionally sees only scorecard cells recorded from the subject run's
  own answer outcomes. No cross-run scorecard class mapping or threshold was
  invented in this ticket; broader historical comparison remains absent until
  its policy/data contract is separately specified.
- Account erasure is a separate active ticket. The request is scheduled for the production seven-elapsed-day deadline; no clock bypass or destructive completion is claimed here.
- The source worktree is uncommitted and shared. This packet freezes the named paths by hash for review; it is not a commit/push receipt.

Exact frozen source tuple: [`DEV-12E-freeze.sha256`](../logs/DEV-12E-freeze.sha256).
