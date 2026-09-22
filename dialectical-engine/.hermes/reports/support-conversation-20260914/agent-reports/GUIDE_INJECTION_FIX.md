# GUIDE_INJECTION_FIX self-report

- Agent/session: `/root/requirements`, original Sol author.
- Ticket: `t_9a52015c`; base `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`; final `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`.
- Verdict: `IMPLEMENTED_REVIEW_REQUIRED`; no readiness or acceptance claim.
- SKILLS LOADED: retained actual BODY reads from this mission session for `superpowers:using-superpowers`, heartbeat protocol/worker contract, `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. No new skill body was loaded in this node.
- Correction: removed the forbidden mutable lock finalizer from route, port, main, repository, fixtures, and eval binding; retained immutable event-derived locking and made status exclude `LOCK` events.
- Regression: actual provisioned restricted role now returns HTTP 200 refusal, stores encrypted messages and hashed abuse evidence, locks at threshold, refuses the next message, and makes zero model calls.
- Verification: final 34 files / 1,699 passed / 1 TODO; typecheck byte-identical to inherited 76-diagnostic baseline; controlled structural 60/60 three times with independent rubric PENDING; strict 44-entry snapshot passed.
- Preserved failures: sandbox listener and snapshot IPC restrictions, actual HTTP 500 RED, stale principal count frames, and intermediate 81-diagnostic typecheck.
- Custody: one exact nine-path product commit; product clean; no preview/runtime/Support/model/status/capacity/private-log action.

Retrospective question, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The costly loop was caused by testing the route against an administrative database pool while production used the restricted capability. The high-value upgrade is a standing route test that provisions and binds the real service principal before any live sample. The second avoidable loop was literal principal counts in tests despite an exported canonical list; deriving every expectation from the list prevents silent fixture drift. Safe fixed diagnostics still need to be captured by the live harness before asserting response details, but this defect no longer needs a live model request to validate.
