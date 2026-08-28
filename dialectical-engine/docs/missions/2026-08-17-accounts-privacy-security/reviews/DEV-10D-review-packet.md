# DEV-10D review packet — trusted local HTTPS readiness

Status: **LOCAL IMPLEMENTATION GREEN; LIVE TRUST AND EXTERNAL REVIEW BLOCKED**

## User-level target

Completion means one real local browser registers with mandatory MFA, logs out
and back in with mandatory MFA, creates and reloads its debate, then deletes the
account and observes the ruled private/public debate result. DEV-10D owns only
the trusted HTTPS readiness prerequisite.

## Change under review

- `pnpm dev:auth:tls-front-door` refuses every existing listener on
  `127.0.0.1:3000`; it never adopts or stops one.
- It requires the exact private `/login` identity and exact proxied anonymous
  session `401` at port `3001` before starting the existing loopback proxy.
- Public readiness uses Node's normal trust store against
  `https://localhost:3000`. No custom CA or `rejectUnauthorized` override is
  passed. Both login and proxied session identities must match exactly.
- Invalid identity, trust failure, or timeout closes only the owned front door.
  The readiness line is printed only after the attested receipt returns.

## Evidence

- RED: focused readiness `0/5`; orchestrator and trusted public probe absent.
- GREEN: focused readiness `5/5`.
- Combined existing proxy + readiness + architecture: `10/10` GREEN.
- Root typecheck: GREEN.
- Architecture/source lint: 28 edges, zero violations, zero blockers.
- Real CLI: `DEV_TLS_PUBLIC_PORT_OCCUPIED`; existing PID `96795` unchanged.

## Mutation evidence

Applied one at a time and restored:

1. skip public-port guard → existing service adopted, RED;
2. accept any public response → wrong app/session accepted, RED;
3. omit failure cleanup → owned proxy left open, RED.

Restored SHA-256:

- `deploy/dev-auth/tls-front-door.mjs`:
  `bac7f5b3c34e6c1b9b6fd3a92e33b178889804c95342c7445d4fd69317128fb9`
- `deploy/dev-auth/tls-front-door.d.mts`:
  `200939cd310b44b96f50ac38c8dc9de79d30953f756b7f7f39a23b289ba52ac9`
- `tests/integration/dev-tls-readiness.test.ts`:
  `848c1b2adbcb254e50a7f905cca8bf1379aaf0ac68251bb633eae3b6e609e085`

## Required reviewer verdict

Return exactly `GREENLIGHT`, or `BLOCK` with concrete P0/P1 file/line evidence.
Claude Opus 5.0 is not callable here, so no substitute verdict is recorded.

## Open gates

- Docker Desktop still stops before Compose because Rosetta emulation cannot be
  installed; the data plane and API/UI chain are not live.
- Trusting the local CA requires explicit owner authorization for
  `mkcert -install`.
- Runner orchestration and the full user-defined browser journey remain `✗`.
