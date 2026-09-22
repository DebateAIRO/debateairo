# GUIDE_SESSION_TIMES_REVIEW41 — session timestamp correction review

- Ticket: `t_2c340751`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Date: `2026-09-21`
- Verdict: `REWORK_BOUNDED_COMPLETION_TIMESTAMP_PREDICATE`

## Remaining defect

FIX41 removes the two-timestamp truncation and gives producer and composer a sound shared shape validator. One required success-boundary check remains absent.

The real capture response listener calls `recordSessionCreationTime(result.sessionCreationTimesUtc)` after the session-version observation. Its encompassing `catch` converts any timestamp-recording failure into `result.sessionVersionFailure`; it does not throw. The final success predicate checks 21 fresh rows, 21 message responses, three create-session responses and unique membership, but it neither checks `sessionVersionFailure` nor calls `validateRemainingSessionCreationTimes`. It then sets and checkpoints `result.completed=true`. Only afterward does `createComposedManifest` validate the three timestamps.

This leaves a concrete failure path at the exact GCR40-R1 boundary. For example, if the wall clock is equal to or earlier than the previous recorded timestamp after a valid `sessionGate.observe`, the timestamp recorder rejects while the session gate can remain usable. The run can reach its final row/count checks with fewer than three timestamps, publish a transient success receipt, and only then fail composition. The capture catch later changes the receipt back to failed, but a success receipt must never be published before its required timestamp predicate holds.

The 9 producer/composer controls validate the recorder and composer separately. The 13 affected binding controls verify one recorder call exists, but they do not exercise the real capture completion predicate or prove that completion is gated on exact timestamp validation.

### Minimum correction

Before setting `result.completed=true` or writing a success checkpoint, the capture producer must:

1. fail if `sessionVersionFailure` is present;
2. call the shared `validateRemainingSessionCreationTimes` on the actual `result.sessionCreationTimesUtc` and require exactly three records;
3. retain the validated records for the composer; and
4. exercise this actual completion boundary with a valid three-record positive and a caught-recorder-failure/fewer-record negative proving `completed` remains false and no composed manifest is produced.

Only the capture source and resulting dependent hashes/contracts need another binding. No product, KB, matrix, UI, screenshot helper, namespace, session/message/model budget or request behavior change is required.

## Retained passing dispositions

- `session-times.mjs` requires an exact array of three records, exact `ordinal` and `observedAtUtc` keys, ordinals 1–3, canonical millisecond UTC strings and strict chronological order. The producer rejects a fourth record.
- The actual composer uses that validator, accepts the three-record fixture, and emits five ordinals after the immutable retained two. Two, four, malformed, out-of-order and wrong-ordinal inputs reject.
- The corrected producer has one recorder call and no remaining `length < 2` truncation.
- No private session ID or capability is persisted or hashed by the timestamp contract.
- The exact remaining21, retained10, budgets, operational namespaces and immutable composition input are unchanged.
- All seven phase `argv[2]` values select `GUIDE_SESSION_TIMES_FIX41-command-contract.json`; its SHA-256 is `a7bb682a1017593a2f87b64d33689a47c2a0458253bab199dc067fb7bc898492`.
- The operator bytes match `562514a844027212f1c812bc64a2679255c76a38fbcd423e8e50cf52b41f3121`; current/stale digest controls pass before I/O, and operator-owned outputs/logs remain explicit.
- All 115 future operational paths remain unique and absent. All unrelated REVIEW40 and helper39 PASS dispositions remain retained.

The first fixture invocation's path-resolution failure is honestly preserved and did not execute the control module or operational traffic. The corrected absolute-path invocation produced the sealed 9/9 and 13/13 proofs.

Actual remaining21, composed31 quality, current gate and owner availability remain unproved. Forgot remains unresolved. No CP1 readiness, completion or acceptance and no CP2 claim follows.
