# DEV-03 Grok 4.6 review packet

## Scope

Review only Kanban `t_c8f9990a`, **DEV-03 · Provision isolated development database LOGIN principals**.

Owned implementation/test changes:

- `.gitignore` (`.local/dev-auth/` only)
- `package.json` (`dev:auth:provision-principals` only)
- `apps/runner/src/dev-database-principals.ts`
- `apps/runner/src/dev-database-principals-cli.ts`
- `tests/integration/dev-database-principals.test.ts`
- `tests/architecture/dev-database-principals.test.ts`
- DEV-03 reconciliation in `DEV-01-local-auth-topology.{md,json}` and its exact architecture test

Ignore unrelated dirty-tree files. Do not edit, provision the standing database, create a worktree, commit, or push.

## Required outcome

- One admin-only, post-migration, idempotent command provisions eight credential-distinct application LOGIN wrappers: runtime, content provision, erasure, authorization, publication cleanup, replay, liveness, and settlement.
- Each wrapper has the exact direct migration-owned NOLOGIN capability membership. Authorization's capability deliberately inherits runtime; liveness deliberately has runtime capability but a distinct login.
- Wrappers are `LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, have unlimited connection count, no per-role configuration, no application ownership, no unexpected direct membership, and no membership admin option.
- Capability role drift, wrapper privilege/membership drift, non-superuser callers, symlinked/non-file custody, or invalid credentials fail closed.
- Passwords are random, distinct, SCRAM-SHA-256, and stored only in ignored `.local/dev-auth/database-principals.env` with root mode `0700` and file mode `0600`.
- No password, credentialed URL, or admin URL enters argv or command output. The CLI path is fixed; it cannot be redirected into a tracked repository path.
- This does not claim the complete local auth stack exists.

## Design details

The command requires `MIGRATION_DATABASE_URL`, connects through the existing database layer, and attests `session_user=current_user` plus `rolsuper` before reading or writing the credential file. It requires all seven unique capability roles to exist, remain NOLOGIN/non-superuser, have no inherited `pg_*` role, and have exactly the one migration-owned capability-to-capability edge (`debateai_authorization_runtime -> debateai_runtime`).

The file is created once with `wx`/`0600` below a non-symlink mode-`0700` root. Its eight generated 32-byte base64url passwords are converted to URL userinfo by `URL`; subsequent valid runs reuse the exact file. Password DDL is produced by server-side `format(%I,%L)` and never printed. The DDL transaction sets `password_encryption='scram-sha-256'`, creates only absent fixed names, grants exact membership options, and rejects—rather than silently repairs—any existing wrapper drift. A valid rerun reapplies the same plaintext credential (and therefore may refresh the server's SCRAM salt) while leaving the operator file and effective access unchanged.

The real-PG test connects as all eight distinct LOGINs, checks exact attributes/direct and effective capability matrices, and runs the production content-provision, account-erasure, publication-separation, and publication-cleanup boot attestations against the generated credentials. It also proves drift refusal, valid-state idempotency, service-principal refusal, actual CLI execution, file modes, distinct SCRAM verifiers, and zero credential text in stdout/stderr.

## TDD and verification

- RED: focused integration suite could not import the absent provisioning module (`ERR_MODULE_NOT_FOUND`).
- Intermediate RED: the first implementation silently repaired privilege drift; the topology contract required fatal drift. Final bytes reject `DEV_DATABASE_PRINCIPAL_DRIFT` and prove an unchanged credential file.
- Intermediate test-only REDs: PostgreSQL array parser shape and macOS `/var` versus `/private/var` canonical path expectations; no production relaxation.
- Grok review BLOCK: the first implementation could race between absent-file `lstat` and exclusive creation. A 16-way fresh invocation reproduced both `EEXIST` and concurrent role-DDL failures. The command now serializes the entire file/DDL ceremony under one database transaction advisory lock, treats `EEXIST` as a re-read only after revalidating the final path as a regular file, and the same 16-way actual-PG title is GREEN.
- GREEN actual embedded PostgreSQL: `5/5`.
- GREEN DEV-01 + DEV-03 architecture: `4/4`.
- GREEN root `pnpm typecheck`.
- GREEN `git diff --check`.
- The first sandboxed PG attempt failed `listen EPERM`; the identical host-permitted run is the claimed receipt.
- Docker remains unavailable, so no standing Compose database or full-stack account is claimed.

Current SHA-256:

- `.gitignore`: `1665513198db3f3d9dc12e15ee55344d41a62f9e74510eb4446dd8b17e566088`
- `package.json`: `9b92cbc9a2464d4d5447a3ccf5d49d4166073f85cd6d04931d7769277ce748e6`
- principal library: `e17b2a68f504524b2ae71467e987c9d12d401b27a796b30deb2bb04b3b73d8c8`
- CLI: `363604e5939147e24da4638d6d258fb5c3a4aa587a721d7e21b23c6260ecc1dd`
- actual-PG test: `5a0887fca013baf2597495e0c427031a05c5ca8fc06e099f9e93451a909604a6`
- DEV-03 architecture: `3616f9a16f2d4c1a90436e9dac37f63b0afb21ce272493a47c239312b993b2b2`
- DEV-01 architecture: `78a9c9e3f2193341b3dd586bb8a578746d12925ed2709113e4b7702381d18ab5`
- topology prose: `f569f7730d467e5b223dbef17cca6e4cd018f7db1eac3b7e6250c4d5680b52c7`
- topology JSON: `b8c8c7a8f8723dd8798e61b1c7c485576818025f15a1a85cddf77805a7f035e9`

## Requested verdict

Return exactly `GREENLIGHT`, or `BLOCK` with file/line evidence and the smallest repair. Prioritize P0/P1 concerns in credential custody, SQL construction, role closure, ownership, idempotency, drift behavior, CLI output, actual-role non-vacuity, and topology honesty.
