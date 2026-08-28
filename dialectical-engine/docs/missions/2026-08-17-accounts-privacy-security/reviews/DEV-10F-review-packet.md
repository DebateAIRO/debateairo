# DEV-10F review packet — bounded local auth-stack supervisor

Status: **LOCAL IMPLEMENTATION GREEN; LIVE STACK AND EXTERNAL REVIEW BLOCKED**

## User-level target

DONE remains one real browser register+MFA → logout/login+MFA → saved/reloaded
debate → account deletion journey with correct private/public debate semantics.
DEV-10F supplies the bounded auth-stack supervisor, not that acceptance result.

## Change under review

- `pnpm dev:auth:up` refuses an occupied public port before any side effect.
- It composes existing exact operations in this order: owned data plane,
  supported Hatchet token, exact API environment, production API, private UI,
  and system-trust TLS.
- Startup failure unwinds only the started prefix. Signal, API/UI exit, or a
  rejected runtime promise stops TLS → UI → API → owned Compose resources. All
  shutdown paths are idempotent and continue across individual cleanup errors.
- Ready is emitted only after the TLS operation returns its exact public
  attestation. The non-secret receipt explicitly records `RUNNER_NOT_STARTED`.
- The command does not install trust, change Docker settings, seed an account,
  start model workers, or accelerate the seven-day erasure grace period.

## Evidence

- RED: focused suite could not import the absent supervisor module.
- First GREEN: `10/10`; rejected-runtime cleanup gap then found in self-review.
- Focused regression RED: supervisor function absent; restored DEV-10F `11/11`.
- Combined DEV-10F + data-plane unit/architecture: `17/17` GREEN.
- Real command: `DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED`; existing PID `96795`
  unchanged before/after and Docker not touched.
- Final bounded gates: DEV-10F + data-plane unit/architecture `17/17`
  GREEN; root typecheck GREEN; lint checked 28 architecture edges with zero
  violations and zero blocking source findings; `git diff --check` GREEN.

## Mutation evidence

Applied one at a time and exact-restored:

1. skip public-port refusal → existing listener adopted, RED;
2. stop resources in startup order → reverse-order assertions RED;
3. remove stop-promise memoization → repeated cleanup RED;
4. omit trusted TLS start → readiness and TLS-failure assertions RED.

## Required reviewer verdict

Return exactly `GREENLIGHT`, or `BLOCK` with concrete P0/P1 file/line evidence.
Grok is logged out and Claude Opus 5.0 is unavailable here, so no substitute
verdict is fabricated.

## Open gates

- Docker Desktop fails before Compose on the Rosetta configuration.
- Local CA trust installation needs explicit owner authorization.
- The runner, real account, browser journey, and practical seven-day erasure
  completion ceremony remain `✗`.
