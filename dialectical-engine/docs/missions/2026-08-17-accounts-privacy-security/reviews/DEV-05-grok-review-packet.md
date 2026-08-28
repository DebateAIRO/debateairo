# DEV-05 Grok 4.6 review packet

## Scope

Review only Kanban `t_aa0cb545`, **DEV-05 · Seed a complete development deployment register**.

Owned implementation/test changes:

- `package.json` (`dev:auth:seed-register` only)
- `apps/runner/src/dev-deployment-register.ts`
- `apps/runner/src/dev-deployment-register-cli.ts`
- `tests/integration/dev-deployment-register.test.ts`
- `tests/architecture/dev-deployment-register.test.ts`
- DEV-05 reconciliation in `DEV-01-local-auth-topology.md`, `IMPLEMENTATION-STATUS.md`, and the existing topology architecture test

Ignore unrelated dirty-tree files. Do not edit, create a worktree, commit, push, run the command against a standing database, or mutate Kanban.

## Required outcome

- One admin-only development command persists and seals the exact bootstrap, authentication, MFA, session, provider, panel-discovery, structural-bound, and risk rows read before the production API listens.
- A completely empty version is seeded transactionally; an exact sealed version is reused without writes.
- Partial, extra, unsealed, value-drifted, or source-drifted state fails closed and is not completed, repaired, or resealed.
- Concurrent first invocation converges on one exact sealed state.
- A runtime/service principal cannot execute the ceremony.
- Acceptance seed/server code is not imported.
- Success output contains only register version and row count, never the migrator URL or credentials.
- This bounded step does not claim that the complete local auth stack exists.

## Design details

`pnpm dev:auth:seed-register` loads the existing migration-only URL, connects as the exact current superuser session principal, and starts one transaction. A transaction-scoped PostgreSQL advisory lock serializes first invocation. The command derives its bootstrap rows from `loadBootstrapRegister`, reuses the production `AUTH_POLICY_REGISTER_ROWS`, `MFA_POLICY_REGISTER_ROW`, and `SESSION_POLICY_REGISTER_ROW`, and owns only five development deployment rows: `configuredProviderSet`, `panelDiscoveryPolicy`, `riskTier`, `acceptanceOrganCostBounds`, and `runDeathPolicy`.

Before any write, the seeder distinguishes only an entirely empty version or an exact sealed version. Exactness covers row count, row-key set, canonical JSON value, and source reference. It inserts every row and the sealed version in the same transaction, reads the final state back through the same exact validator, and commits. Every error rolls back before the pooled client is released. The provider row is deliberately a local OpenAI-compatible placeholder for the later development runner ticket; DEV-05 does not claim that provider is running.

The CLI prints only `DEV_DEPLOYMENT_REGISTER_READY=<version>:<row-count>` and always closes the pool. No standing or persistent development database was seeded during this ticket; every database test used a fresh disposable embedded PostgreSQL cluster.

## TDD and verification

- Initial RED: the focused integration and architecture contract could not import/read the absent DEV-05 library, CLI, or package script.
- First host run: the first two integration titles passed; the actual-service-principal title exposed only a test SQL parameter typing error. The fixture was corrected with an explicit `::text` cast and the title passed.
- Full-strength production-row mutant: `configuredProviderSet` was changed to `configuredProviderSetMissing`. The fresh database still seeded and sealed, but the actual production `readDeploymentMakerCapability` boot reader went RED with `CONFIGURED_PROVIDER_SET_UNRESOLVED`. The source was restored byte-exactly to SHA-256 `10656497d84fe5262000a20aa5602394fc1714c54359c3e567ef4e71d8f8ca77`.
- GREEN integration plus DEV-05 architecture: `5/5`. This includes all production boot readers, exact idempotency, partial-state refusal, 12 concurrent first invocations, actual runtime-principal refusal, and the real CLI output.
- GREEN DEV-01 topology plus DEV-05 architecture: `4/4`. An initial stale documentation assertion expected `SPECIFIED, NOT IMPLEMENTED`; it was updated to require `SPECIFIED, PARTIALLY IMPLEMENTED` while still proving `dev:auth:up` is absent.
- GREEN root `pnpm typecheck`.
- GREEN `git diff --check`.

Current SHA-256:

- `package.json`: `702fb679b0ef13cfe50b343d3f589a003f6faed4f74cbed83d65fae87eef849a`
- register library: `10656497d84fe5262000a20aa5602394fc1714c54359c3e567ef4e71d8f8ca77`
- CLI: `e981c2d2606e439d6afd8e07b60927c482adec63ebf72fc20c1193b8d853ef06`
- integration test: `a73c28859f9f92ce476fb7bf49478615424f39e2d5c066619edd3b1b0e04a0b9`
- DEV-05 architecture: `44646ddbec7a119030e992d0694bb56040b46cf72133c9ae7f09a612e7d3495b`
- DEV-01 architecture: `9e98ef2181c061f9a8d3f44e8c9509f59b3ca7775202dc7947058db40899a06b`
- topology prose: `b896c675e86c186760679b7a74cd2b7fe00373abf890c6dc6656454ff59384b6`
- status artifact: `4af4acf36eb1716bd7471319eafd5cb852dd1304c61e0b96ff858c553d038714`

## Requested verdict

Return exactly `GREENLIGHT`, or `BLOCK` with file/line evidence and the smallest repair. Prioritize P0/P1 concerns in complete boot-row coverage, sealed-register invariants, exact-idempotent reuse, partial-state handling, concurrent first invocation, actual-principal authority, transaction boundaries, credential/output exposure, acceptance coupling, and topology honesty.
