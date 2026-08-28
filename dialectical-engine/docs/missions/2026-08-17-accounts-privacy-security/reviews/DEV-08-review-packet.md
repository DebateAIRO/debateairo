# DEV-08 review packet — local-auth data plane

Status: **LOCAL IMPLEMENTATION GREEN; RUNTIME AND EXTERNAL REVIEW BLOCKED**

## User-level target

This is the first bounded ticket toward the current wave acceptance scenario:

1. register through the real mail-verification and MFA flow;
2. log in with MFA through the Secure-cookie origin;
3. create and durably recover the user's debate; and
4. schedule/delete the account and verify the ruled debate outcome.

DEV-08 does not claim that journey. It owns only the persistent data plane that
must exist before the API can start.

## Change under review

- `pnpm dev:auth:data-plane` resolves an executable Docker CLI and separately
  requires a responsive engine.
- It generates the existing Compose environment and starts only missing
  `postgres` and `hatchet-lite` services.
- It waits for PostgreSQL, applies migrations, provisions the eight isolated
  application LOGIN wrappers, seals the exact development register, verifies
  persistent key/store custody, and preflights the private mail spool without
  writing a message.
- Child output is bounded and never relayed. The fixed receipt contains no URL,
  credential, password, key, token, captured mail, or filesystem path.
- If a later step fails, only services newly started by this invocation are
  stopped, in reverse dependency order. Reused services are not stopped.
- The command does not start API/UI/TLS, issue a Hatchet application token,
  seed an account, reset data, or advertise `dev:auth:up`.

## Evidence

- Reproduce-first: focused unit import failed because
  `apps/runner/src/dev-auth-data-plane.ts` was absent.
- Restored focused gate: 6 files / 15 tests GREEN.
- Root `pnpm typecheck`: GREEN.
- `git diff --check`: GREEN.
- Real host invocation: fixed refusal
  `DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE`.
- Docker host log: virtualization engine stopped because Rosetta installation
  failed before Compose. No service/custody state was created.

## Mutation evidence

Each mutation was applied alone and restored before the next:

1. skip Docker-engine attestation → orchestration order test RED (2 failures);
2. stop services in startup order instead of reverse order → cleanup test RED;
3. let `--preflight` read stdin as a mail message → real executable test RED.

## Custody hashes

- `apps/runner/src/dev-auth-data-plane.ts` — `99d12acd66ce5bafa65ce709101353014d17ea3988d42eeabd6c2a544fdb7585`
- `apps/runner/src/dev-auth-data-plane-cli.ts` — `959d9d6cc601b79ba1fe1f9df33ac73c716be19f3ca65c70ebdc0ae6b8450f83`
- `deploy/dev-auth/sendmail-capture.mjs` — `c61ed0fddbd0a94bb6526f702b5a8a557d73868f9807f87a3c090dcb46dc13c9`
- `tests/unit/dev-auth-data-plane.test.ts` — `c433b2f2d76481625d0b32ba85e9c671620a171a3f536ad8eca1bd33253f7c1c`
- `tests/architecture/dev-auth-data-plane.test.ts` — `61926e2f39120e541a26acccdac970083d9a25c66ab56e44917410fe64c73989`
- `tests/integration/dev-mail-capture.test.ts` — `8e84783fe700ad93b6535706471199e2295b7ba14224df75e3c5616423002574`

## Required reviewer verdict

Review the orchestration and failure/custody boundaries. Return exactly one of:

- `GREENLIGHT` — no P0/P1 and evidence is sufficient for this bounded scope;
- `BLOCK` — list concrete P0/P1 findings with file/line evidence.

Claude Opus 5.0 was requested by the user, but no Claude reviewer/tool is
available in this workspace. No substitute verdict has been fabricated.

## Open gates and residuals

- The real data plane has not reached GREEN on this workstation. The operator
  must disable Docker Desktop's Rosetta integration or explicitly install
  Rosetta, then rerun the same command.
- Docker/Compose startup, migration/principal/register behavior on this exact
  persistent stack, Hatchet token/workflow readiness, API/UI/TLS lifecycle, and
  the complete account/debate journey remain unproved.
- The current status row therefore remains `✗`.
