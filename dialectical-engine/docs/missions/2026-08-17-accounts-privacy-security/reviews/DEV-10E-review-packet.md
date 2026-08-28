# DEV-10E review packet — owned data-plane lifecycle

Status: **LOCAL IMPLEMENTATION GREEN; LIVE STACK AND EXTERNAL REVIEW BLOCKED**

## User-level target

The actual finish line remains a real browser register+MFA → logout/login+MFA →
saved/reloaded debate → account deletion journey with correct private/public
debate semantics. DEV-10E closes only one supervisor cleanup prerequisite.

## Change under review

- `startDevelopmentAuthDataPlane()` executes the same ordered DEV-08 bootstrap
  and returns the existing non-secret attestation receipt plus `stop()`.
- The lifecycle captures only `startedServices` returned by this invocation.
  `stop()` passes that exact set in reverse order to the existing bounded
  Compose cleanup operation.
- `stop()` is idempotent, including concurrent/repeated callers. A fully reused
  dependency set performs no stop operation.
- Startup failure retains DEV-08's existing exact cleanup. The legacy
  `bootstrapDevelopmentAuthDataPlane()` delegates to the lifecycle and returns
  only its receipt, preserving the standalone leave-running command.

## Evidence

- RED: focused data-plane suite `2/5`; lifecycle export absent.
- GREEN: focused data-plane suite `5/5`.
- Root typecheck: GREEN. Architecture/source lint: 28 edges, zero violations,
  zero blockers. Diff-check: GREEN.

## Mutation evidence

Applied one at a time and exact-restored:

1. remove reverse ordering → exact shutdown-order assertion RED;
2. remove memoized stop promise → cleanup invoked twice, RED;
3. invoke cleanup for an empty owned set → reused-service no-op assertion RED.

## Required reviewer verdict

Return exactly `GREENLIGHT`, or `BLOCK` with concrete P0/P1 file/line evidence.
The requested external reviewer is not callable here; no substitute verdict is
fabricated.

## Open gates

- Docker Desktop still fails before Compose on its Rosetta configuration.
- Trusted local CA installation still needs explicit owner authorization.
- `dev:auth:up`, runner lifecycle, and the real browser journey remain `✗`.
