# DEV-10B review packet — exact production API host process

Status: **LOCAL IMPLEMENTATION GREEN; RUNTIME AND EXTERNAL REVIEW BLOCKED**

## User-level target

The wave is complete only when one real local browser can register with MFA,
log in with MFA, save and recover its debate, and delete the account with the
ruled private/public debate result. DEV-10B owns only one prerequisite: starting
and identifying the real production API from exact private local custody.

## Change under review

- `pnpm dev:auth:api` reads only `.local/dev-auth/api.env` after owner, mode,
  no-symlink, and single-link checks.
- The file must contain the exact 29-key ordered DEV-09 contract. Production
  environment validation is reused, then local origin, host/port, Hatchet,
  workflow, database principals, and custody paths are pinned again before
  spawn.
- Only the central whitelisted command environment and those 29 keys reach the
  child. The command starts `apps/api/src/main.ts` through the repository's
  pinned `tsx`; child output is discarded.
- Any listener present before spawn is refused. After spawn, readiness requires
  exact `401`, JSON content type, and `{"error":"SESSION_REQUIRED"}` from
  `GET /v1/session`.
- Wrong readiness, bounded timeout, or child exit stops only the child created
  by this command. A successful handle has idempotent stop ownership.

## Evidence

- RED: focused test failed at import because the implementation was absent.
- Focused DEV-10B: `7/7` GREEN.
- Combined DEV-08/09/10A/10B: `19/19` GREEN.
- Root `pnpm typecheck`: GREEN.
- Affected production-environment compatibility gate: `44/44` GREEN.
- `pnpm lint`: GREEN (28 edges, zero violations; zero source blockers).
- `git diff --check`: GREEN.
- Real CLI invocation refused with fixed `DEV_API_PROCESS_CUSTODY_INVALID`
  before spawn because the Docker-blocked prerequisite has not created
  `.local/dev-auth/api.env`; no listener or process was created.

## Mutation evidence

Each mutation was applied alone and restored:

1. skip pre-existing listener refusal → existing service adopted, RED;
2. accept any JSON `401` → wrong service accepted as ready, RED;
3. omit failure cleanup → owned child not terminated, RED.

Restored implementation SHA-256 after the three mutations and the subsequent
failed-spawn cleanup repair:
`b92791d6fd911d2dfb78b937ae13c7bfe0b03562ad18c8f39435bef32dc5fbdf`.

Final CLI SHA-256:
`e261b9038cb61f30711f71fc420a013d561e7f2a5b208a70e568f3390c85bb35`.
Final focused-test SHA-256:
`ad9037f6f0edccb718c66d65d75058e651669b70348efcee91a76ccb914e7d08`.

## Required reviewer verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 and evidence is sufficient for this bounded scope;
- `BLOCK` — concrete P0/P1 findings with file/line evidence.

Claude Opus 5.0 was requested by the user, but no Claude reviewer/tool is
available in this workspace. No substitute verdict has been fabricated.

## Open gates and residuals

- Real process start is dependency-blocked: DEV-08 has not produced custody or
  a running database/Hatchet service because Docker Desktop stops on its failed
  Rosetta installation.
- This host-process contract deliberately does not reinterpret host-loopback
  endpoints and absolute custody paths for a container. The older Compose API
  ticket remains an uncompleted alternative until the topology is explicitly
  changed or superseded.
- UI, trusted TLS, Hatchet runner, browser acceptance, and account/debate
  lifecycle proof remain missing. The overall status is therefore `✗`.
