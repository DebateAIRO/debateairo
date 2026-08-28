# DEV-10C review packet — exact private UI host process

Status: **LOCAL IMPLEMENTATION GREEN; RUNTIME AND EXTERNAL REVIEW BLOCKED**

## User-level target

The wave is complete only when one real local browser can register with MFA,
log in with MFA, save/recover a debate, and delete the account with the ruled
debate result. DEV-10C owns only the private UI process prerequisite.

## Change under review

- `pnpm dev:auth:ui` requires the exact anonymous `401 SESSION_REQUIRED` from
  the local API before any UI spawn.
- Any listener already on `127.0.0.1:3001` is refused. The command never reads,
  stops, or replaces the unrelated port-3000 process.
- It starts only `apps/ui/server.mjs --dev` with the whitelisted command
  environment plus four fixed non-secret values: host `127.0.0.1`, port `3001`,
  upstream `http://127.0.0.1:8790`, and same-origin client base `/api`.
- Ready requires a 200 HTML login page containing its fixed product identity
  and an exact proxied 401 JSON session denial. A wrong listener, wrong proxy,
  timeout, or early exit cleans up only the owned child.
- Child output is discarded; the CLI reports only host, port, and
  `DENY_DEFAULT_PROXY`.

## Evidence

- RED: focused suite failed at import because the module was absent.
- Focused DEV-10C: `6/6` GREEN.
- Combined DEV-10B/10C: `13/13` GREEN.
- Full apps/ui node inventory: `42/42` GREEN.
- apps/ui and root typechecks: GREEN.
- `git diff --check`: GREEN.
- Real CLI refusal: `DEV_UI_PROCESS_API_UNAVAILABLE`; no child/listener created.

## Mutation evidence

Each mutation was applied alone and restored:

1. skip exact API prerequisite → UI advertised ready without an API, RED;
2. omit login identity check → lookalike UI accepted, RED;
3. omit failure cleanup → owned child left running, RED.

Restored implementation SHA-256:
`0f627094f3c0dc9a733d38c95408dd32a51e974c150beb89f5930e75efdd2278`.

## Required reviewer verdict

Return exactly `GREENLIGHT`, or `BLOCK` with concrete P0/P1 file/line evidence.
Claude Opus 5.0 is not callable in this workspace, so no substitute verdict
has been fabricated.

## Open gates

- Live proof requires the Docker-blocked data plane and DEV-10B API.
- Trusted TLS, the Hatchet runner, one full orchestrator, and browser acceptance
  remain missing. Overall implementation status remains `✗`.
