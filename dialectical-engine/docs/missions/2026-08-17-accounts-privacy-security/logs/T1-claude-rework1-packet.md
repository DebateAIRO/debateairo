# T1 Claude Opus rework 1 packet

## Authority and custody

- Ticket: `accounts-phase1` / `t_b225b2f2` (T1).
- Author seat: visible local Claude Opus terminal only.
- Review authority: fresh GPT-5.6 Sol xHigh reviewers; the author must not self-approve.
- Entry HEAD must remain `694b8c06d7194ef5f3c3da5dee745beae847e605`; index must be empty.
- Work only in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.
- Grok is decommissioned for the weekly limit. Do not invoke Grok, Hermes, Fable, or local model agents. `hermes kanban` is board-client-only.
- Do not stage, commit, complete, or push. Preserve unrelated user work.
- Read this packet in full, compute its SHA-256, claim the ticket for 43,200 seconds, and post a `REWORK1 WORKER CLAIM` with the session id, packet hash, HEAD, empty-index result, and all entry candidate hashes before editing.

## Stable entry candidate

The following exact bytes were restored and independently rechecked after the abandoned baseline experiment:

| Path | SHA-256 |
|---|---|
| `apps/api/src/main.ts` | `bb838089b7be0ecbc45eaa4193c7b7364fcc978bd7cde389f7dbdc10277de5fd` |
| `apps/api/src/registration.ts` | `d38f9422e75ed69243e30d24b1cfa9a13f0feecd325b63376a958246c71a5ac6` |
| `packages/crypto/src/index.ts` | `075c295e990f25459ac53fce419dbc05a9b10f27aab727f5eb06544004af83da` |
| `packages/crypto/src/argon2-worker.ts` | `97958c52f671bf81b3f20974a4e1da3c5e0fc9b6637d775f1eb1905ad7bd6044` |
| `packages/crypto/src/argon2-worker-pool.ts` | `0c91df059b41c3741d3cbafca3801e2013186bc1f9f23b102f8f0df747c58424` |
| `packages/db/src/identity.ts` | `2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f` |
| `packages/register/src/auth-policy.ts` | `8888ada84634d545ca1750a8e10f3f9004c61bb5e7cf326bdb66673650e35d04` |
| `tests/integration/registration-database.test.ts` | `0f9dc2c9632421df2a93b316a89dbf4da76f108fef4fb22dc3e1e288b587adc1` |
| `tests/unit/registration.test.ts` | `c5f9c93789732921c32572719a780e08532f60b4b164cbf12908a9eebe9bd51b` |
| `tests/unit/argon2-worker-pool.test.ts` | `bbc69e5d1b796bfc53f2b8f761c6791fa69b267710cdc273eb798882519a3f90` |
| `tests/architecture/t1-argon2-worker-contract.test.ts` | `792008e3e32e4fd40ab28c1bc886bd15cae52b86b946c202daae14f274fb353e` |

Stop on any mismatch and report it; do not repair it by checkout, reset, or another baseline/candidate swap.

## Binding reviewer findings

### P1 — verification must distinguish invalid credentials from infrastructure failure

Reviewer location: `packages/crypto/src/argon2-worker.ts:119-138` and `packages/crypto/src/index.ts:499-505`.

Current verification catches every `argon2Verify` exception and returns `false`. This misclassifies WASM/runtime/OOM failures as a bad password. It also sends the stored encoded hash to the worker without parsing and bounding its embedded Argon2 `m`, `t`, `p`, and output length, so corrupted or hostile stored data can exceed the ruled resource envelope.

Required behavior:

- Parse and validate the encoded Argon2id string before expensive verification.
- Enforce exact supported algorithm/version and bounded parameters consistent with the accepted password policy and pool resource envelope.
- Return `false` only for malformed/unsupported encodings and genuine password mismatch.
- After pre-validation, allow computation/runtime failures to become the worker protocol's generic failure and the caller's typed retryable infrastructure error. Never leak secrets or raw worker errors.
- Add non-vacuous tests for malformed encoding, hostile encoded cost parameters, wrong password, and a valid encoding whose compute path throws. The final case must not become `false`/401.

### P1 — replacement must never exceed the physical worker/RSS bound

Reviewer location: `packages/crypto/src/argon2-worker-pool.ts:571-580` and `:599-615`.

Current replacement starts after calling, but not awaiting, `dead.terminate()`. The old 64 MiB worker can remain alive while a replacement starts, transiently exceeding the ruled two-worker physical and RSS bounds. Retiring handles are not part of close settlement.

Required behavior:

- Track every retiring worker handle.
- Await confirmed termination before spawning the replacement for that slot.
- Make replacement races idempotent and one-settlement-only.
- `close()` must await both active and retiring handles and settle all jobs within its ruled deadline.
- Add a deterministic fake-worker barrier where `terminate()` remains pending. Prove no replacement is constructed until release; prove `close()` waits/forces the retiring handle and leaves zero workers/jobs.

### P1 — construction and startup failure must fail closed without hangs

Reviewer location: `packages/crypto/src/argon2-worker-pool.ts:257-265` and `ready():303-331`.

A synchronous `Worker` construction failure records one failure and abandons the slot, allowing `ready()` and queued jobs to hang. A worker that never sends the ready handshake also lacks a bounded startup failure path.

Required behavior:

- Retry/replace a construction-failed slot under the same bounded restart budget and breaker.
- Add a bounded ready-handshake timeout; route expiry through the same terminate-before-replace path.
- When the breaker opens, reject readiness and all affected queued work exactly once with the generic typed unavailable/capacity infrastructure error.
- Add deterministic tests for synchronous constructor throw, crash before ready, never-ready handshake, active-job crash, and queued-job crash/continuation or rejection according to the packet policy. No promise may hang.

### P1 — complete the required acceptance gates

The initial packet requires exact production caps and failure/privacy proofs; small analog queues alone are insufficient.

- Prove the exact `2 active / 32 credential queued / 96 audit queued / 128 total` contract, including `N+Q+1` typed rejection and queued cancellation/removal with no retained payload.
- Add the forced-GC dynamic-IP sentinel cache test with a deliberately retained positive-control sentinel. Never persist or log the raw sentinel.
- Measure peak RSS while real maximum-cost jobs are in flight, not only after all jobs settle. Capture distinct worker thread IDs, actual peak, maximum observed queue occupancy, exact worker count, and close latency.
- Add an operation-bound response validator: exact response shape/type for hash, verify, and audit. Reject wrong-operation or arbitrary string payloads as protocol faults; cover mutants.

### P2 — TTL/LRU semantics and mutation receipts

- Use monotonic expiry metadata for the audit cache; avoid `Date.now()` for TTL correctness under wall-clock jumps.
- Make LRU ordering deterministic even for same-tick hits; do not rely on millisecond timestamp uniqueness.
- Explicitly recognize `Argon2InfrastructureError` at every auth-route boundary. Password, audit, verify, resend, and provisioning pool failures must share one constant secret-free retryable `503` envelope while retaining the typed cause internally. Do not let the generic `500` handler expose an internal `ARGON2_*` message. Add route-level tests for every occurrence.
- Mutation receipts must name the expected failing assertion/test, retain sufficient stdout/stderr to prove the intended mechanism, and reject zero-test/filter mistakes rather than treating any nonzero process exit as a successful RED.
- Final manifests must include candidate paths, hashes, sizes, and mtimes before/after each mutation battery.

## Router evidence ruling — preserve the 2 MiB threshold

This is a test-hermeticity repair, not a V threshold change. Do not raise or delete the `2.000 MiB` plateau limit.

Evidence:

- exact pre-T1 full-suite baseline: `logs/T9-router-full-suite-attempt2.log`, integration hash `c0a177397dd95e82b99c633d252d3a7a0e1e7ef0b9f42444682f1a79ede4359f`, plateau `0.094 MiB`, null envelope `0.109 MiB`;
- candidate isolated gate: plateau `0.359 MiB <= 2.000 MiB`;
- direct 240-job pool probe: `0.6 MiB` drift, `0.1 MiB` final plateau, zero restarts, empty queues;
- the lone `103.219 MiB` result exists only after contaminated full-file process history.

Required smallest correction:

- Execute the unchanged 2 MiB plateau detector in a fresh isolated child with one production-configured pool, deterministic warm-up, in-flight peak capture, explicit `close()`, and prompt child exit.
- Add a separate isolated positive-control child that deliberately retains more than 2 MiB and proves the detector goes RED for the intended assertion.
- Keep the flat-heap and N-independent retained-object proofs as complementary gates, not replacements.
- Correct the progress/board record: blocker 2 does not require a V threshold ruling.

## Still-frozen V decisions

Do not edit these values in rework 1. Measure and report them for Router/V:

1. Prefer a new versioned register/calibration row with `maximumClampAbsorbedRegistrationConcurrency = 3`, not a monotone `>=` reinterpretation. First produce three isolated candidate repeats. Keep the 45 ms clamp and prove the accepted approximately-103 capacity on every repeat.
2. Provisional runtime bounds remain provisional: 2 workers; queue lanes 32/96; total 128; cache 4096; TTL 60 s; timeout 10 s; breaker 3 per 60 s.
3. `256 MiB` is only a provisional isolated pool-host ceiling. Do not label it a whole-process/operator limit until a matched baseline/API peak measurement proves the scope and margin.

## Required gate order and stop conditions

1. Append `REWORK1 BEGIN`, custody, entry hashes, and reproduced failing tests/mutants to `logs/T1-progress.log` and Kanban.
2. Implement the smallest fixes above. No schema, migration, dependency, lockfile, public API, auth response, 45 ms clamp, or accepted ~103-capacity widening.
3. Run typecheck, lint, diff-check, relevant unit/architecture/integration focused batteries, and the isolated RSS detector plus positive control.
4. Run a VR-10 mutation battery on exact final bytes. Each mutant must fail for the expected mechanism; restore and verify hashes/sizes/mtimes after every mutant.
5. Run three consecutive isolated candidate calibration repeats for N*=3 and ~103 capacity. Do not edit the sealed register.
6. Do not run the full suite yourself. When all pre-full-suite gates except the explicitly frozen V decisions are green, post `REWORK1 ROUTER DECISION READY` with exact hashes, receipts, findings disposition, and the three concise V choices; then stop.
7. On any product/test blocker, post `T1 REWORK1 CHANGES REQUESTED`, preserve the exact tree, and stop. Never stage, commit, complete, or push.
