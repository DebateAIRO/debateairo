# P3-01 independent review packet — production database-principal manifest

## Review contract

- Ticket: `t_c65714af` — `P3-01 · Define the production database-principal manifest`
- Reviewer: Claude Opus 5, read-only; no edits, commits, board mutation, or runtime mutation.
- Required verdict: `GREENLIGHT` or `CHANGES REQUESTED`, with every P0/P1 finding named.
- Scope is specification and architecture only. This ticket **does not provision roles or credentials**.

## Binding ticket outcome

Create one exact machine-readable manifest of service principals, capability
memberships, forbidden memberships, database/schema ownership, and
connection-purpose mapping. The artifact must distinguish current executable
wiring from required-but-unwired and external/JIT consumers, and it must not
claim production provisioning has occurred.

The current Phase-1 security model keeps capability roles `NOLOGIN` and uses
credential-distinct LOGIN wrappers. That is intentionally stronger than the
early Wave-2 shorthand that proposed making capability roles LOGIN directly;
actual-principal startup attestations and Phase-1 separation tests are the
current executable authority.

## Primary files

- `docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json`
- `tests/architecture/p3-production-database-principals.test.ts`
- `packages/register/src/runtime-environment.ts`
- `tests/unit/evaluator-dev-menu-api.test.ts`
- `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`

## Authorities to reconcile

- `docs/missions/2026-08-17-accounts-privacy-security/00-mission-charter.md`
- `docs/missions/2026-08-17-accounts-privacy-security/AMENDMENTS.md`
- `docs/missions/2026-08-17-accounts-privacy-security/wave-2-target-architecture.md`, especially §13.1
- `docs/missions/2026-08-17-accounts-privacy-security/wave-3-phase-1-plan.md`, Phase 3 charter
- Every current role DDL migration, including evaluator-api breadth in `0029`
- Current connection consumers in `packages/register/src/runtime-environment.ts`, `apps/api/src/main.ts`, `apps/runner/src/main.ts`, and `apps/scheduler/src/cli.ts`

## Adjacent gate repairs included in the frozen tuple

Two pre-existing DEV-12E changes made repository-wide gates RED and are included
for review because P3-01 may not close over a red tree:

- `tools/orphan-audit/src/index.ts` declares the real `apps/api -> providers`
  edge used by trusted provider-discovery parsing.
- `apps/runner/src/dev-local-provider.ts` no longer reads `process.env` merely
  to permit an ephemeral loopback port in tests. Production still invokes the
  provider with no override and therefore binds the fixed `127.0.0.1:8791`
  target; the override remains loopback-only.

## Current verification

- Exact focused command:
  `pnpm exec vitest run tests/architecture/p3-production-database-principals.test.ts tests/architecture/dev-runner-provider-set.test.ts tests/unit/dev-auth-stack.test.ts tests/unit/evaluator-dev-menu-api.test.ts --reporter=json --outputFile=/private/tmp/p3-01-r3-focused-final.json`
- That command passes `30/30` tests and `8/8` reported Vitest suites when run
  with localhost permission. The first sandboxed invocation passed `27/30`;
  its three failures were all `DEV_LOCAL_PROVIDER_START_FAILED`/
  `DEV_AUTH_STACK_PROVIDER_FAILED` from blocked loopback listen. No source was
  changed before the identical host-permitted rerun.
- P3 restored exact file: `2/2` tests.
- Root `pnpm typecheck`: exit `0`.
- `pnpm lint`: architecture `28` edges, zero violations; source audit zero blockers.
- `git diff --check` and `git diff --cached --check`: exit `0`.
- A read-only query of the current migrated development database found all
  governed capability/observability roles with the expected LOGIN/NOLOGIN,
  inheritance, membership, schema-owner, and view-owner shapes. It found `0`
  of the fourteen `debateai_prod_*` wrapper roles, which independently confirms
  the production wrappers. The manifest now records this exact split as
  `MIXED_PROVISIONING_STATE` instead of applying one false blanket status.

## Mutation evidence

Each mutation was applied alone, made the exact P3 gate RED, and was restored
before the next mutation:

1. False `status: PROVISIONED`: `0/2` passed, `2/2` failed.
   Receipt SHA-256 `1c57792936e87d9bedfb6080f752f7d6cc91c84b7177f0fffca538f2cb337939`.
2. Removed `pg_*` from one service's forbidden memberships: `1/2` passed,
   `1/2` failed. Receipt SHA-256
   `9e2c3b58ac42469963a320622c845d33533da445d3bd20608233a43bfe365093`.
3. Falsely changed the migration connection from `WIRED` to
   `REQUIRED_NOT_WIRED`: `1/2` passed, `1/2` failed. Receipt SHA-256
   `8d759d525591e90a7525792e08f03ed6c2c2d57e565f426b54c57cf6b78e680c`.
4. Assigned the API runtime principal to the external `hatchet` database:
   `1/2` passed, `1/2` failed. Receipt SHA-256
   `abb96848dd3e0ad30febfa537a40468414c1bd9daa9a678017d14e2c33232b6b`.
5. Disabled inheritance on a capability-bearing API wrapper: `1/2` passed,
   `1/2` failed. Receipt SHA-256
   `35790f0e52645b5ab4a87f363dd8606c28624351030dce87d27d8652bb630aca`.
6. Added a source-only `CREATE ROLE` while leaving the manifest unchanged:
   `1/2` passed, `1/2` failed. Receipt SHA-256
   `2d84ebe898b9ad07c9921a1d2c40b0e956dd0250d78d1e557e6025bbd47c93f5`.
7. Added a source-only `SOURCE_DRIFT_DATABASE_URL` while leaving the manifest
   unchanged: `1/2` passed, `1/2` failed. Receipt SHA-256
   `d1d8229d5f825e2e9b08609c1970244a2a4a6f4ec4909867c782f3e1fc81fef7`.
8. Reverted the evaluator-menu guard to production-string-only refusal:
   `4/6` passed, `2/6` failed. Receipt SHA-256
   `70f11860a14e7f13cbe280c51776ea5971dde391c47e024b2dfd44279529830d`.
9. Changed the `debateai_content_provision` capability role from `NOINHERIT`
   to `INHERIT`: `1/2` passed, `1/2` failed. Receipt SHA-256
   `56b18e5e42881665d421a1c562021a81a0c8c47bee13e9df12cd8e1d0067dad1`.
10. Granted membership with `ADMIN OPTION`: `1/2` passed, `1/2` failed.
    Receipt SHA-256
    `9bc60355d7bbae2819ab2169a72f1b94440000ad06520d0a920d25028eecd313`.
11. Aliased the runner and API runtime credential identities: `1/2` passed,
    `1/2` failed. Receipt SHA-256
    `ee02ac0301b7176cdc5d840b0105d99cf86ffca1f93b07ad05f81b5f2f81a5f1`.
12. Restored final focused receipt: `30/30` passed across `8/8` reported
    suites, SHA-256
    `bf21e6a3e2b4490843d0bfa592904018256688bb92ffee97d1ebf7707803ebc7`.
13. Removed one executable superuser-credential consumer from the manifest:
    `0/2` passed, `2/2` failed. Receipt SHA-256
    `df0328da50ed7c460cf289a71a37fbd005151b9e2f309193ea22460f4d1e05a3`.
14. Reintroduced the false blanket `SPECIFIED_NOT_PROVISIONED` status:
    `0/2` passed, `2/2` failed. Receipt SHA-256
    `83fb1067c7153c5d7b329151954c6630f3b546a203a4fdff541210593c1f5fae`.
15. Marked one migration-provisioned observability principal unprovisioned:
    `1/2` passed, `1/2` failed. Receipt SHA-256
    `9cf504bab242b91e265cd56f18c17bc44b8a1e8967f8ca83b82008386cd6917f`.
16. Falsely bound the explicitly unbound evaluator dev-menu connection:
    `1/2` passed, `1/2` failed. Receipt SHA-256
    `48f5f0db1a3874a1919fa43f1f65b8c4a2c4f811b23facf65a332ed8dc607785`.
17. Added a fifth role to the migration's dynamic observability role/password
    loop: `1/2` passed, `1/2` failed. Receipt SHA-256
    `a459e6ef4023444c202f9bfd9c9b6a6d189221429947bba14af1346a532e82a3`.
18. Removed one peer-wrapper deny wildcard: `1/2` passed, `1/2` failed.
    Receipt SHA-256
    `06cc5d984f887d8841c8cf1a0dd4302f8c485b6e189126e6091e473b1ea067fc`.
19. Added an undisclosed evaluator-api cross-schema grant: `1/2` passed,
    `1/2` failed. Receipt SHA-256
    `48d2b0d107fe007726c91b42ebe9d62f85135127180b1220e427f2b4f8821628`.
20. Added a lowercase quoted role-creation form: `1/2` passed, `1/2` failed.
    Receipt SHA-256
    `477f4dc483acc06ed1b27ac2b431e0a3e5819a80b26669d6d66a4b081f96023c`.
21. Added a source-only schema ownership obligation: `1/2` passed,
    `1/2` failed. Receipt SHA-256
    `58b0364d6c176898f707de02f92dcc4193e9c2f0e02268b6d025824a1f1c417c`.
22. Final third-round restored receipt: `30/30` passed across `8/8` reported
    suites, SHA-256
    `53a8d96d99097d839efbd380e7776ecd28804ab3fdbf99a7d9062f88a22496c4`.

## First-review repairs

Claude Opus 5's first pass returned `CHANGES REQUESTED`. Current bytes repair
all three P1s and the five material P2/residual observations:

- the evaluator dev-menu pool is enumerated as `DEVELOPMENT_ONLY`, and enabling
  it now fails closed unless `NODE_ENV=development`;
- the gate enumerates all migration-created roles and executable database URL
  keys in the source→manifest direction as well as manifest→source;
- every capability role records exact `INHERIT`, and every membership grant
  records ADMIN/INHERIT/SET options;
- the persistent migration owner is no longer mislabeled an ephemeral role;
  only its credential is `EPHEMERAL_JIT`;
- publication cleanup is `WIRED_WHEN_ENABLED` with its exact condition;
- credential identity/JIT evidence that P3-01 cannot execute is structured as
  an explicit P3-02 obligation rather than a claimed invariant; and
- the permanent evaluator-api `register` schema/table grants from migration
  `0029` are disclosed and source-pinned.

## Second-review repairs

Claude Opus 5's second pass again returned `CHANGES REQUESTED`. Current bytes
repair every item it identified as blocking and also close its two accepted
follow-up durability findings:

- all three executable `MIGRATION_DATABASE_URL` consumers are distinct
  connection-purpose rows, each with a source file; the gate discovers every
  checked-in `createPool` source-file/key pair and compares it to the manifest;
- provisioning is per principal under `MIXED_PROVISIONING_STATE`: four
  observability LOGIN roles are honestly migration-provisioned with unmanaged
  credentials and a P3-02 hand-off, production wrappers remain unprovisioned,
  and Hatchet remains external;
- the evaluator dev-menu purpose is `DEVELOPMENT_ONLY_UNBOUND`, outside every
  production principal, with the missing development principal named as the
  exact reason it is not deployment-supported;
- role discovery is case-insensitive, supports quoted literal roles, captures
  arbitrary password-loop roles, and fails on any additional unmatched dynamic
  `CREATE ROLE` site;
- every service/human forbidden-membership list includes `debateai_prod_*`, so
  peer-wrapper crossover is machine-readable rather than a bare invariant;
- evaluator-api cross-schema grants are derived from every migration GRANT to
  that role and compared to the manifest, including both `register` and
  `ledger`; and
- source-created schemas and the two special object owners are reconciled to
  manifest ownership in the source→manifest direction.

## Frozen source hashes

- P3 test: `b3aca36d4efb92668e7995db53e0694dc5d6eafaed7d00be04e487461f733a95`
- Manifest: `21f0f1364737f41f1c9c92ce8e6e89ccc4c94cfcddf4f0714ccdfb7e89c1c395`
- Runtime environment: `b2fcec6a3d4b956d9006d0ef63ab1ee1c9ba491da35c609f0b15d58558392af5`
- Evaluator dev-menu test: `3ab27409bc52c75c3a55e53d008c6e223548e637c38272e243980f0af700f321`
- Architecture audit: `565dad56124ad0c653945cf04b046f14b45a98b429623e30e8469cd7714aeda7`
- Local provider: `b6560ed6ab63b07146681bab00d29489c28a7e76e5d40620229a6a15ff5e7c8d`
- Implementation checklist: `8c86129fef2332ffdbe19f9798d27cbe8c32c3aa696d7ff8acf6cf44bed4f81f`

## Questions for the reviewer

1. Does the manifest enumerate the exact current capability/ownership roles and
   every current or required database connection purpose without inventing a
   provisioned deployment?
2. Are direct/effective/forbidden memberships and ownership boundaries strong
   enough to prevent service-to-service escalation and predefined `pg_*` role
   crossover?
3. Is each `WIRED`, `WIRED_WHEN_ENABLED`, `DEVELOPMENT_ONLY`,
   `DEVELOPMENT_ONLY_UNBOUND`,
   `REQUIRED_NOT_WIRED`, `EXTERNAL_COMPONENT`, and `JIT_HUMAN`
   classification supported by source and honest about missing work?
4. Do the exact tests fail closed against false completion, privilege drift,
   missing roles, duplicate service identities, and connection-purpose drift?
5. Do either adjacent gate repair broaden a production trust boundary or weaken
   the deterministic-provider contract?
