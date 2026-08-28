# DEV-01 local-auth topology contract

Status: **SPECIFIED, PARTIALLY IMPLEMENTED**.

This document fixes the topology and security invariants that the DEV tickets implement incrementally. It does not itself start a service, modify the host trust store, or create a test account. The machine-readable authority is [`DEV-01-local-auth-topology.json`](./DEV-01-local-auth-topology.json).

## Operator contract

The supported auth-stack supervisor command is exactly `pnpm dev:auth:up`.
DEV-10F implements the bounded auth and runner stack described below. It is idempotent and either reaches every
included boot attestation or exits nonzero after stopping only what it started.
It may reuse valid persistent state, but it may not silently repair privilege
drift, rotate secrets, weaken HTTPS, or reseed a partially inconsistent
register.

Debate execution is real-CLI-only. At startup the supervisor concurrently
starts the existing Codex, Claude, and Grok CLI relays on fixed private
loopback ports and accepts a maker only after that relay's real model handshake
succeeds. Every successful responder is pinned into the debate in configured
order; an unavailable or logged-out CLI is recorded as absent rather than
replaced by canned output. At least one real maker must answer, otherwise
startup fails before data-plane work. The exact three-member roster is sealed
in register version 4, while the handshake-derived model identities and
ephemeral relay credentials are passed in memory to API discovery and the
runner. There is no operator-maintained provider credential document; the
generated private `api.env` may carry only the current loopback relay tokens so
the API and runner child processes can reach those exact handshakes. The
removed deterministic scaffold is never started.

The future stop command is `pnpm dev:auth:stop`. Stop is non-destructive: Postgres, user DEKs, audit keys, mail, TLS material, and operator credentials remain under `.local/dev-auth`.

DEV-03 now implements only the bounded post-migration principal step as `pnpm dev:auth:provision-principals`. It writes the nine application service URLs to the ignored mode-`0600` `.local/dev-auth/database-principals.env`, prints no URL or password, and refuses privilege drift. It is not the promised full-stack start command.

DEV-04 now implements only the bounded persistent-secret step as `pnpm dev:auth:generate-secrets`. It atomically publishes the absent KEK, blind-index key, and audit-source-IP salt as distinct 32-byte mode-`0600` files, creates the audit-key and user-DEK stores at mode `0700`, reuses only valid existing custody, and prints no key material. It refuses permissive modes, malformed files, symlinks, duplicate material/inodes, and unknown ownership rather than repairing or rotating them. It is not the promised full-stack start command.

DEV-05 now implements only the bounded register step as `pnpm dev:auth:seed-register`. Under the exact migrator/admin principal it serializes first invocation, persists and seals the complete bootstrap, authentication, MFA, session, provider, discovery, structural, and risk register consumed by production API boot readers, and reuses only an exact existing state. A partial, extra, unsealed, or value/source-drifted register is refused rather than repaired or resealed. It does not import acceptance seed code and is not the promised full-stack start command.

DEV-06 now implements the bounded file-only mail sink at `deploy/dev-auth/sendmail-capture.mjs`. The production sendmail adapters invoke it with their existing sendmail-compatible argument shape while `DEBATEAI_DEV_MAIL_CAPTURE_DIR=.local/dev-auth/mail` fixes the private spool. It creates only an absent mode-`0700` spool, refuses symlinked, foreign-owned, or mode-drifted existing custody, bounds stdin at 256 KiB, and atomically publishes one fsynced mode-`0600` UUID-named `.eml` file per send. Success is silent, failures expose only fixed operator codes, and the executable imports no network server. The verification link remains available only in the captured message. This step does not list messages, start the API, or implement the promised full-stack start command.

DEV-08 now implements the bounded data-plane bootstrap as
`pnpm dev:auth:data-plane`. It resolves either a PATH-installed Docker CLI or
Docker Desktop's bundled macOS CLI, requires a responsive engine, generates the
ruled Compose environment, starts only missing `postgres`/`hatchet-lite`
services, waits for PostgreSQL, applies migrations, provisions the exact
application principals, seals the development register, verifies persistent
secret custody, and runs the no-message mail-spool preflight. Child output is
not relayed, and a failed later step stops only services this invocation
started, in reverse dependency order. This command does not start the API, UI,
or TLS front door, issue a Hatchet application token, seed an account, or claim
that the full stack is ready.

The first workstation execution on 2026-08-26 correctly refused with
`DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE`. Docker Desktop was installed,
but its engine failed before Compose because its enabled Rosetta integration
could not install Rosetta. Disabling that Docker Desktop option or installing
Rosetta is an explicit workstation operation; the repository command neither
changes Docker settings nor accepts a software licence for the operator.

Destruction is a separate command: `pnpm dev:auth:reset --confirm DELETE_LOCAL_AUTH_DATA`. It must print the resolved `.local/dev-auth` target, reject symlinks and broad paths, stop the stack first, and require the exact confirmation token. No start/stop path may call reset.

The root package now exposes `dev:auth:up` for the explicitly bounded implemented stack above. The separate `dev:auth:stop` and destructive confirmation-gated reset commands remain future work; the supervisor must not imply that those commands exist.

## Exact network topology

Only the trusted TLS front door is public, and even it binds only to loopback:

| Component | Exact endpoint | Rule |
| --- | --- | --- |
| TLS front door | `https://127.0.0.1:3000` / `https://localhost:3000` | Sole public-loopback listener; owns the browser origin. |
| UI | `http://127.0.0.1:3001` | Private loopback; never opened directly for auth testing. |
| API | `http://127.0.0.1:8790` | Private loopback; UI proxies `/api/*` without changing Origin semantics. |
| Postgres | `127.0.0.1:55432` | Private loopback; contains separate `debateai` and `hatchet` databases. |
| Hatchet | HTTP `127.0.0.1:8888`, gRPC `127.0.0.1:7077` | Private loopback; dev-only insecure transport is never browser-facing. |
| Mail capture | no network listener | The production `SendmailMailSender` invokes a sendmail-compatible capture executable. |

`PUBLIC_APP_URL` is byte-exact `https://localhost:3000`. Plain `http://localhost:3000` is not a fallback. The front-door certificate must already chain to a locally trusted CA and cover `localhost`; `dev:auth:up` may verify trust but may not mutate the OS trust store. A missing trusted local CA is a loud preflight failure with setup instructions, not an excuse to set insecure cookies or relax Origin checks.

## Persistent custody

All local state lives below repository-relative `.local/dev-auth`, after a runtime ticket first adds that root to `.gitignore`. The command must reject a symlinked root. Directories use mode `0700`; credential/key files use `0600`.

The KEK, blind-index key, and audit-source-IP salt are exactly 32 raw bytes. The audit-key and user-DEK stores are persistent directories, not regenerated per boot. Losing or replacing the KEK while retaining the database is an unrecoverable local-account data loss and must be diagnosed rather than auto-healed.

The mail sink writes one durable file per send beneath `.local/dev-auth/mail`, with an opaque message ID and mode `0600`. It receives at most 256 KiB of production mail payload on stdin, never logs it to the terminal, and exposes the verification link only through the captured file. The stack starts with **no seeded account**; the operator uses the real sign-up → captured verification link → TOTP → recovery-code flow.

DEV-10A provisions `.local/dev-auth/hatchet.env` through the supported
`./hatchet-admin token create` binary included in the pinned Hatchet Lite image.
It accepts only the exact local issuer, audience, server URL, gRPC broadcast
address, UUID tenant/token identity, ES256 header, and a non-expiring-soon
credential. Before publication it uses the pinned SDK to read the exact tenant
and list workflows, proving both REST authority and workflow-API reachability.
The private file is atomically created once and every later use is live-attested;
the token never enters terminal output.

DEV-09 then assembles the API's private environment at
`.local/dev-auth/api.env`. It consumes the exact DEV-03 principal file, the
DEV-04 custody paths, the DEV-01 fixed local settings, and DEV-10A's exact
one-line Hatchet credential. The Hatchet tenant UUID is derived from the token;
it is never accepted as a second caller-controlled value. The output is
mode-`0600`, owner-only, single-linked, atomically published, and reused only
when byte-identical. The command returns only a key count and CREATED/REUSED
state; it never prints URLs, passwords, token contents, or key material.

The environment assembler does not mint the Hatchet token, start a process, seed an
account, or relax production environment validation. The fixed local values
are development-only inputs to the existing strict API parser. Token issuance,
and workflow API reachability now have a bounded local implementation, but the
real Docker-backed receipt, API/UI/TLS/runner lifecycle, and browser acceptance
journey remain later gates.

DEV-10B adds only the bounded API process step as `pnpm dev:auth:api`. It reads
the exact owner-only, single-linked `api.env`, revalidates every local endpoint,
principal URL, custody path, and production API value, and starts the real
`apps/api/src/main.ts` entrypoint with only the whitelisted command environment
plus those exact values. It refuses any listener already occupying `8790` and
prints ready only when an anonymous `GET /v1/session` returns the exact
deny-default `401 {"error":"SESSION_REQUIRED"}` contract. Startup timeout,
wrong-service responses, and child exit stop only the child it created. This is
a host-process step because the current private environment deliberately uses
host-loopback database/Hatchet endpoints and absolute host custody paths; it
does not silently reinterpret them as container paths. The command does not
start UI, TLS, or the Hatchet runner and is not the promised full-stack start.

DEV-10C adds only the bounded private UI step as `pnpm dev:auth:ui`. It first
requires the exact anonymous API denial at `127.0.0.1:8790`, refuses every
listener already on `127.0.0.1:3001`, and starts the real `apps/ui/server.mjs
--dev` with exactly `DIALECTICAL_UI_HOST=127.0.0.1`, `PORT=3001`, server-only
`DIALECTICAL_API_BASE=http://127.0.0.1:8790`, and same-origin
`NEXT_PUBLIC_API_BASE=/api`. Ready requires both the actual `/login` page
identity and the exact proxied `/api/v1/session` denial. It does not inspect,
replace, or stop the unrelated listener currently on port 3000, and it does not
start TLS, the API, or the Hatchet runner.

DEV-10D hardens only the existing `pnpm dev:auth:tls-front-door` step. It
refuses any process already bound to public port `3000`, requires the exact
private login-page and proxied anonymous-session identities at port `3001`, and
starts only the loopback HTTPS proxy. It reports ready only after a normal
system-trust request to `https://localhost:3000` proves both paths; no custom CA
or disabled verification is permitted. Failure closes only the proxy it
created. Certificate-authority trust installation remains a manual,
owner-authorized workstation action. This is still a prerequisite rather than
proof of register→MFA→login→saved-debate→account-deletion.

DEV-10E adds no user command and starts no new service. It exposes one
supervisor-facing lifecycle around DEV-08: after successful bootstrap, the
handle retains only the exact Compose services started by that invocation and
can stop them once, in reverse order. Reused services are never stopped. The
existing standalone `pnpm dev:auth:data-plane` command deliberately keeps its
successful dependencies running, preserving its prior contract. This closes a
cleanup-ownership prerequisite for `dev:auth:up`; it is not that supervisor.

DEV-10F supplies the first explicit `pnpm dev:auth:up` supervisor. Before any
side effect it refuses an existing public-port listener. It then composes the
owned data-plane, supported Hatchet token issuance/attestation, exact private
API environment, production API, private UI, and system-trust TLS front door in
that order. Ready is printed only after every existing component attestation
passes. Signal, API/UI exit, or startup failure stops the owned prefix in exact
reverse order; reused Compose services remain running. The receipt explicitly
says `RUNNER_NOT_STARTED`: this command enables registration, MFA, sessions,
durable ask creation, and account controls, but does not claim a settled debate
answer or the real browser acceptance journey.

## Database principals

The local databases have ten wrapper LOGINs. Eight least-privilege application wrappers are provisioned by DEV-03 after migrations create their NOLOGIN capability roles; the migrator and Hatchet database owner remain separate bootstrap concerns.

- `debateai_dev_migrator` is the only elevated principal. It owns the `debateai` database and the migration-created schemas `audit_crypto_internal`, `core`, `evidence`, `identity`, `ledger`, `memory`, `obs`, `register`, `scorecard`, and `serve`, and is used only by principal bootstrap, migrations, and register seeding. Migration 0023 deliberately leaves `evaluator` owned by the NOLOGIN `debateai_evaluator_ddl` role; the migrator applies and replays that migration but must not take evaluator ownership. Its credential is never passed to a long-lived service.
- `debateai_dev_runtime` is `LOGIN INHERIT` and a member only of `debateai_runtime`.
- `debateai_dev_content_provision` is `LOGIN INHERIT` and a member only of `debateai_content_provision`.
- `debateai_dev_erasure` is `LOGIN INHERIT` and a member only of `debateai_erasure_runtime`.
- `debateai_dev_authorization` is `LOGIN INHERIT` and a direct member only of `debateai_authorization_runtime`; that migration-owned capability deliberately inherits `debateai_runtime`.
- `debateai_dev_publication_cleanup` is `LOGIN INHERIT` and a member only of `debateai_publication_cleanup`.
- `debateai_dev_replay` is `LOGIN INHERIT` and a member only of `debateai_replay`.
- `debateai_dev_liveness` is a credential-distinct `LOGIN INHERIT` member only of `debateai_runtime`, matching the liveness repository's existing runtime-governed tables without sharing the API credential.
- `debateai_dev_settlement` is `LOGIN INHERIT` and a member only of `debateai_settlement_watch`.
- `debateai_dev_evaluator_api` is `LOGIN INHERIT` and a member only of `debateai_evaluator_api`; it is the only development principal accepted for the development-only evaluator menu.
- `debateai_dev_hatchet` owns only the separate `hatchet` database and has no application capability membership.

Every service LOGIN is `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, owns no application schema/table/sequence/function, and has no direct/inherited `pg_*` membership. All nine application URLs resolve to credential-distinct current users; runtime and liveness intentionally share only a capability role, never a login. The API still creates separate pool instances for admission and work; a separate pool is not permission to alias the principals.

## Ordered bootstrap

1. **PREFLIGHT:** verify Node/pnpm/container tooling, unused exact ports, non-symlink custody root, existing trusted local CA, and no foreign process masquerading on a required endpoint.
2. **PERSISTENT_PATHS:** create/verify exact modes; refuse unknown ownership or permissive keys.
3. **POSTGRES:** start the pinned Postgres major with persistent data and wait for the exact server identity.
4. **MIGRATIONS_REPLAY:** apply `0000` through the current migration, then replay the current migration to prove idempotency. Capability roles are migration-owned and are never duplicated by the principal command.
5. **APPLICATION_PRINCIPALS:** create or verify the nine exact application LOGINs and their SCRAM passwords; privilege drift is fatal. The migrator and isolated Hatchet owner were created by the PostgreSQL bootstrap.
6. **REGISTER_SEED:** load the private real-provider panel, then persist and seal the production bootstrap, auth, MFA, session, provider, discovery, structural, and risk rows as register version 4. Acceptance-only seed/server code and substitute providers are forbidden.
7. **SECRETS:** generate only absent secrets, verify all existing commitments/modes, and never print key bytes.
8. **HATCHET:** start the pinned local engine against the separate `hatchet` database, then run `pnpm dev:auth:provision-hatchet-token`; it issues once through the image's supported admin binary and live-attests tenant/workflow API authority on every use.
9. **MAIL_CAPTURE:** verify the sendmail-compatible executable and a private writable spool.
10. **API:** start the production `@debateai/api` entrypoint with private content encryption enabled and publication and the evaluator dev menu disabled. Authenticated QA debates therefore exercise the same encrypted private-run path as production.
11. **RUNNER:** start the production runner using only the ordered real-provider panel; it may not start or fall back to a repository-owned model substitute.
12. **UI:** start `apps/ui` privately on port 3001 with same-origin `/api` and server proxy `127.0.0.1:8790`.
13. **TLS_FRONT_DOOR:** publish only `https://localhost:3000`.
14. **BOOT_ATTESTATIONS:** run every check below before printing ready.

## Required boot attestations

- certificate trust and `localhost` identity;
- byte-exact HTTPS `PUBLIC_APP_URL`, static/runtime Secure `__Host-` cookie configuration, and an unauthenticated wrong-Origin/CSRF negative probe that returns no cookie;
- fresh migration plus replay safety;
- complete sealed register with every row the API reads before listen;
- exact runtime CLI-handshake panel with at least one real responder, exact register/target equality, and no substitute-provider process;
- exact runtime/content-provision/erasure/authorization/publication-cleanup/replay/liveness/settlement/evaluator-api current-user and capability isolation, using production witnesses where present plus the DEV-03 actual-login matrix;
- pairwise-distinct application service database principals and URLs, including credential-distinct runtime and liveness wrappers;
- 32-byte/mode-0600 secret files and mode-0700 stores;
- sendmail executable plus private writable capture with no terminal payload;
- Hatchet token, advertised endpoints, tenant, and workflow reachability;
- zero pre-existing identity/account/session/factor rows in a fresh stack. A real Secure-cookie issuance round trip is a post-start operator acceptance step through sign-up, captured mail, TOTP, and login; it is not faked during readiness and is not described as a boot attestation.

The command prints only the public URL, service status, mail-spool path, and non-secret version/commitments. Passwords, tokens, verification links, recovery codes, key bytes, database URLs containing passwords, and captured message bodies never enter command output.

## Explicit non-solutions

- Do not use `acceptance/main.ts` or an in-memory mail sender.
- Do not start an in-process deterministic provider or return canned debate content.
- Do not direct-insert an identity/account to fabricate a login.
- Do not weaken `PUBLIC_APP_URL`, Origin, CSRF, Secure-cookie, role, or secret-file validation.
- Do not share one database LOGIN across runtime, content provision, erasure, migration, or Hatchet.
- Do not place credentials in tracked files, generated compose env, process argv, or logs.
- Do not claim the stack exists until a later ticket publishes the command and an end-to-end sign-up/login receipt passes.
