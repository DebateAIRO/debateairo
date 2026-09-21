# GUIDE_HARNESS_REVIEW6 self-report

## Identity and result

- Node: `GUIDE_HARNESS_REVIEW6`
- Ticket/run: `t_70110160` / `161`
- Agent path: `/root/baseline`
- Native reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`
- Verdict: `REWORK_BOUNDED_DIAGNOSTIC_SHAPE`

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and reviewer-role instructions retained from this reviewer session

## Review result

FIX6 resolves the original pre-assert evidence-loss boundary for API, session, DOM, diagnostic-throw, and result-predicate paths. It keeps attempted and completed accounting separate and preserves the required privacy boundary, exact matrix, production selector, final revision, KB, digest, and adapter custody.

One diagnostic shape remains permissive: attributed status plus candidate count succeeds even when the producer record/category or fixed counts are missing or malformed. The projector turns those defects into null fields, and the assertion treats the stage as successfully attributed. The narrow correction is status-dependent strict diagnostic validation with actual staged-consumer negatives for partial malformed shapes.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The expensive pattern was testing only the extreme malformed value (`null`) while the implementation normalized partially malformed fields to null. That leaves a large middle class untested: a valid outer status with missing inner evidence. The improvement is to define a status-by-field schema table first and generate both the projector and negative cases from it. Every status should state required, forbidden, and nullable fields, plus the exact attribution invariant.

A stronger one-prompt harness request should require a mechanical partition of every input schema: absent object, wrong outer type, unknown status, missing required nested record, unknown enum, missing count, wrong count type, inconsistent count, and valid shape. The evidence pack should then list each partition against its expected last safe phase and closed code. This is shorter and more reliable than discovering one malformed family per review pass.

## Limits

No heavy lease was requested. No harness, test, probe, browser, runtime, HTTP, DB, Support, model, capacity, lifecycle, product, KB, Git, or private-data action occurred. The old LIVE3 cause remains unknown. Forgot remains unresolved/actionless, and no readiness or acceptance is claimed.
