# GUIDE_COMPACT_UI_PROBE2 evidence

- Ticket: `t_6790e21d`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `REWORK_EXECUTION_CONTRACT`
- Child exit: `1`
- Fixed failure: `GUIDE_UI_PROBE_ARGUMENTS_INVALID`

## Result

The exact reviewed invocation ran once and stopped before browser launch. The sealed probe validates the output basename at lines 16–20 before it constructs the result object, temporary browser profile, Playwright context, or route guard. It accepts `GUIDE_UI_TRANSITION_PROBE-run-*`, while both its separately reviewed contract and the frozen operational packet require the collision-safe new path `GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json`.

The required output remains absent. Browser transition attempts were 0, blocked browser Support attempts were 0, and actual Support requests forwarded were 0. No status, case-list, session, message, model, capacity, or database request occurred. This result does not exercise or characterize product UI behavior.

## Custody

Before and after the failed child, the exact clean product revision was retained by detached supervisor PID/PGID `77769`, PPID `1`, from the expected product worktree. All 12 expected preview listeners remained present, all 9 unrelated listener records were preserved, and ordinary system TLS `GET https://localhost:3100/help` returned HTTP 200 without a custom CA or insecure mode. The ongoing private stack log was neither read nor hashed.

## Smallest correction

Bind the reviewed executable's basename allow-list to the already reviewed PROBE2 output contract, then rerun under a separately authorized one-shot node. The correction belongs to the evidence harness only; no product or runtime change is supported by this failure.

## Evidence limits

The sandboxed preflight first failed at `ps` with EPERM. The identical authorized read-only custody check then passed before execution. The failed attempt was not retried, and this report makes no readiness or acceptance claim.
