# GUIDE_LIVE5 — zero-traffic failure report

## Result

- Node/ticket/session: `GUIDE_LIVE5` / `t_ad9d20bc` / `/root/preview`
- Revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (clean)
- Verdict: `FAIL_PRETRAFFIC_OPERATOR_INVOCATION`
- Actual capture: not started
- Actual Support/model requests: 0/0

## Completed pretraffic work

The restored supervisor PID/PGID `20420`, PPID `1`, remained healthy at the exact revision. All 12 owned listeners and the measured unrelated-listener baseline were preserved. Ordinary system TLS `https://localhost:3100/help` returned HTTP 200 without a custom CA or bypass.

All 56 GUIDE9 capture paths were absent. One authorized capacity measurement completed: one supported status GET and one identifier-free aggregate read. It reported zero session/message/call usage, no cooldown or waiter, and relay `AVAILABLE` under the frozen limits. A new gate was materialized by adding only `runtimeCapacityPath` and `runtimeCapacitySha256` to the frozen template.

## Failure

The row-proof adapter was invoked as plain `node replay-row-proofs.mjs ...`. The reviewed command required `node --import tsx replay-row-proofs.mjs ...` because the adapter dynamically imports the product TypeScript graph. Plain Node tried to resolve the source import `packages/support-kb/src/catalog.js` from `index.ts` and exited with `ERR_MODULE_NOT_FOUND`.

The adapter wrote a sealed failure receipt with rows `[]`, zero browser sessions, zero Support requests, and zero model requests. This is an operator invocation error. It is not a failed row proof and does not establish a product, matrix, harness, source-policy, or runtime defect. Per the one-shot/no-retry contract, GUIDE_LIVE5 did not correct the command, rerun the proof, or start the capture.

Postfailure custody again confirmed supervisor `20420`, all 12 listeners, clean product custody, and ordinary TLS HTTP 200. The runtime remains detached and healthy.

## Limits

No rows, screenshots, replies, origins, actions, navigations, language transitions, or capture sessions exist. Owner testability and a manual walkthrough cannot be derived. Historical LIVE3/LIVE4 causes remain unknown. Forgot remains unresolved/actionless; no readiness, acceptance, or checkpoint claim is made.
