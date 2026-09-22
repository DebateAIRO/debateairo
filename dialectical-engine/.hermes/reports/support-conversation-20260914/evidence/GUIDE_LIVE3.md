# GUIDE_LIVE3 evidence

- Node: `GUIDE_LIVE3`
- Ticket: `t_eaf4b3eb`
- Session: `/root/preview`
- Product revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- Verdict: `FAILED_CAPTURE_MODEL_RESULT_INVALID`

## Pretraffic gates

The existing owned preview was reused without restart. PID/PGID `65268`, PPID `1`, exact clean revision and cwd, all 12 preview listeners, all nine original listeners, and ordinary system TLS HTTP 200 were verified at `2026-09-17T18:06:52.445Z`. The fixed receipt, all screenshots, and FIX4 profile were absent before capture.

One capacity measurement was taken at `2026-09-17T18:07:24.842Z`, then one new gate was materialized. The reviewed FIX4 adapter passed all 54 row proofs once with zero traffic and harness digest `4768a8b5296ca5838fa6e2588be5cebc537b2613513239e434f0cd60bd7c7c9e`. Capture started on that same fresh gate within the 120-second interval.

## Actual capture

The capture ran once and was not retried. Canonical sequences 1 and 2 completed:

- Sequence 1, full English `Pricing`: HTTP 200, `ANSWER_GROUNDED`, source `app-navigation`, no actions, `MODEL_ACCEPTED_DRAFT`, API/DOM equal.
- Sequence 2, full Romanian `Account`: HTTP 200, `ANSWER_GROUNDED`, source `settings-help-menus`, no actions, `MODEL_ACCEPTED_DRAFT`, API/DOM equal. The language change created the second distinct session.

The third executed request was canonical sequence 7: full Romanian, family `home-library`, prompt `Unde găsesc dezbaterile mele și biblioteca publică?`, MODEL branch, `ALLOW_CLOSED`. It stopped with `GUIDE_HARNESS_MODEL_RESULT_INVALID`. API/DOM equality had already passed, but the sealed harness did not persist the third API response or diagnostic. Its HTTP status, outcome, sources, actions, diagnostic and model-versus-fallback origin are therefore unavailable. The fixed error proves only that one compound MODEL-result predicate failed; it does not identify the predicate or root cause.

At stop there were two completed rows, two created sessions, three message requests, zero forbidden endpoint requests, no navigation, and five fixed-category HTTP 401 console errors. Only two screenshots exist; both passed visual inspection at 1440×1000. No Support or model request occurred after failure.

## Custody and testability

Postfailure custody passed at `2026-09-17T18:11:30.710Z`: the same detached preview remains healthy at exact revision, all original listeners are preserved, and ordinary TLS returns HTTP 200. The owner walkthrough requires two sessions and two messages; captured evidence leaves three of five hourly session slots and seventeen of twenty ten-minute message slots before that walkthrough. `GUIDE_LIVE3-owner-testability.json` labels this a conservative calculation rather than a fresh post-capture read.

The fixed partial receipt, its two screenshots, the adapter proof, gate, capacity, failure projection, screenshot QA, manual, and custody records are preserved. The ongoing private `GUIDE_LIVE2-stack.log` is excluded from sealed artifacts. Heavy lease was released. This failed run makes no full-guide, checkpoint-readiness, or acceptance claim.
