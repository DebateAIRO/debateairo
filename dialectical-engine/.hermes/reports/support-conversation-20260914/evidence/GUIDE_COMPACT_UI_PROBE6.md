# GUIDE_COMPACT_UI_PROBE6 evidence

- Ticket/session: `t_ee28b8d7` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `PASS_ZERO_SUPPORT_UI_TRANSITIONS`
- Child status: `0`
- Attempts: `1`; no retry

## Result

The exact reviewed PROBE6 command completed all five transitions in order: fresh full English, same-session full Romanian, storage-reset compact Romanian, route-remount full English, and storage-reset compact English. Each transition reached `READY`, exposed one visible composer, passed its private-control check, and completed the fixed post-READY state machine.

The result retained 12 bounded surface observations and 40 post-READY records. For every transition, `COOKIE_SETTLING`, `LOCALE_SELECTION`, `PRIVATE_CONTROL_CHECK`, and `TRANSITION_COMPLETION` each recorded `ENTERED` then `PASSED`. Failure is null.

The route guard blocked three status attempts and three page-case-list reads. Create-session, send-message, other-Support, and actual forwarded Support counts were zero. Fixed console categories were HTTP 401: 7, HTTP 404: 0, JS/hydration: 0, and OTHER: 6. No synthetic Support response, capacity read, chat question, model request, database access, product change, Git change, or service change occurred.

## Custody

Before and after the probe, detached supervisor PID/PGID `77769`, PPID `1`, retained exact clean revision `152eed4da1cd3e66b74d8301159ba76427552409`. All 12 preview listeners remained present, the nine recorded unrelated listeners were preserved, and ordinary system TLS `GET https://localhost:3100/help` returned HTTP 200 without a custom CA or insecure mode. The ongoing private runtime log was neither read nor hashed.

## Boundary

This PASS proves only public opening and locale transitions under an all-Support-aborted route guard. It does not prove Support backend answer quality or current capacity. A separately authorized fresh-capacity LIVE8 run remains required. Forgot remains unresolved and actionless; no readiness, acceptance, or checkpoint claim is made.
