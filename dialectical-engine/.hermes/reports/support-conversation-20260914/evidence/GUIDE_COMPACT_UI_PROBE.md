# GUIDE_COMPACT_UI_PROBE — zero-Support UI transition result

## Result

- Ticket/session: `t_e9166486` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Verdict: `REWORK_ZERO_SUPPORT_UI_TRANSITION_PREFLIGHT`
- Child exit status: `1` preserved by direct redirection
- Retry: none

## Runtime custody

Before the probe, PID/PGID `77769`, PPID `1`, command/cwd, all 12 owned listeners, the 9-listener unrelated baseline, clean revision, and ordinary system TLS Help HTTP 200 passed. They passed again after the browser closed; every unrelated baseline listener remained present. The existing preview remains running and its private log was neither read nor hashed.

## Transition evidence

The reviewed probe passed fresh full/EN, same-session full/RO, and storage-reset compact/RO at 390x844. The compact transition proved hydration readiness before one toggle interaction, then a visible expanded panel, compact root, and composer. All three completed surfaces had no private controls.

The fourth transition, route-remount full/EN, stopped with `GUIDE_HARNESS_FULL_HYDRATION_TIMEOUT`. The exact readiness predicate waited up to 30 seconds for the first visible EN support-language button to have an own property whose name begins `__reactProps$` and whose value exposes an `onClick` function. The predicate is at `probe-zero-request-ui.mjs:70-75`; the full-surface binding is at lines 145-159, the failed remount at 177-180, and fixed failure checkpointing at `controls.mjs:132-150`.

The retained projection records URL class `HELP`, a single visible full composer, hydration `NOT_READY`, fixed console counts, and every compact count/visibility/state field as `NOT_APPLICABLE`. It does not record React internal property names/counts, handler identity, a public product readiness marker, raw DOM/text, arbitrary exception text, URLs/bodies, or historical LIVE7 state. No fifth compact/EN transition ran. This evidence does not distinguish application hydration, an internal-marker mismatch, or another transition condition and does not relabel LIVE7.

## Traffic boundary

No Support request reached the runtime. The browser made three blocked status attempts and three blocked other-Support attempts; the route guard aborted them and never supplied a response. Create-session and send-message attempts were both zero. No capacity query, Support question, model request, synthetic response, database read, retry, restart, or product/harness edit occurred.

The bounded next scope is only the full-surface remount readiness predicate and its current producer contract. Any harness correction must retain the compact one-click contract, fixed projection, route guard, and five-transition order, receive separate review, and pass one new zero-Support probe before another actual 54-row capture. This evidence does not authorize a product behavior change. Forgot remains unresolved/actionless, and this report makes no readiness, acceptance, or checkpoint claim.
