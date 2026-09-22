# GUIDE_CONTEXT_FIX self-report

## SKILLS LOADED

Retained actual BODY reads from the original Sol author session: `superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `superpowers:receiving-code-review`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion`.

## Result

- Node/ticket/session: `GUIDE_CONTEXT_FIX` / `t_8a5af2ff` / `/root/requirements`
- Base/final: `3d0ad7acaab0ff90bd783a6948bf99f117d74fe2` / `8fb8e407`
- Change: one fixture line, `crosscap alpha beta gamma` to `crosscap`
- RED/GREEN: 14 failed + 17 passed, then 114/114 passed in the required three-file frame
- Product: clean; no production file changed; heavy and Git leases released

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The failure was a stale test precondition, not a production defect. A stricter relevance rule landed without mechanically validating every synthetic caller. Fourteen downstream assertions then failed at the same early `NO_SOURCE` branch, producing a large-looking incident from one fixture string.

The upgrade is dependency-aware fixture contracts. Synthetic helpers should declare the selector rule they rely on, and selector changes should automatically run every helper that constructs requests. A small assertion that the shared fixture selects its intended source before downstream tests would have localized this immediately.

Token cost came from interpreting fourteen symptoms separately before identifying the common early return. Failure clustering should group tests by first divergent branch, spy-call count, and outcome. The orchestrator could then generate a single diagnosis packet with the shared helper and affected assertions.

For a better one-prompt workflow, compile acceptance rows into explicit preconditions and effects. Verify preconditions first, execute the dependency closure once, preserve the first failure, and resume at the next unrun command after a bounded fix. Editorial, security, and owner gates remain human decisions; receipt generation and test selection should be automatic.

Limit: this node proves only the fixture correction. It does not establish whole-suite, typecheck, evaluation, live-quality, or checkpoint readiness.
