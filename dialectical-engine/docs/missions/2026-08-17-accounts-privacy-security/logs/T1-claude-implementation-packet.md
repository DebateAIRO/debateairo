# T1 — Claude Opus implementation packet

## Authority and objective

V ordered the mission to continue with visible Claude Opus coding seats and
fresh GPT-5.6 Sol xHigh reviewers. Grok is decommissioned for the current
weekly limit. Hermes and Fable agents/models are retired from this mission;
`~/.local/bin/hermes kanban` is only the local board client.

Implement Kanban ticket `t_b225b2f2`: move every production `hash-wasm`
Argon2 operation off the Node request/event-loop thread into one bounded,
process-owned worker pool, and add the ticket-authorized bounded per-IP audit
KDF cache without weakening privacy, enumeration resistance, durability, or
the accepted registration capacity.

This is a reproduce-first security/performance ticket. You are the
implementation author, not the final reviewer or custodian. Do not stage,
commit, complete the ticket, or push. Hand off an exact uncommitted candidate
for two independent Sol xHigh reviews and a later fresh Claude Opus custody
seat.

## Repository and entry gold

Work only in:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Required entry HEAD:

`694b8c06d7194ef5f3c3da5dee745beae847e605`

The git toplevel is the parent directory and contains many unrelated existing
changes. The index must be empty. Before editing, build a complete
path/mtime/SHA-256 manifest and treat it as the mutation oracle. Never stage
anything and never overwrite unrelated work.

Required entry hashes:

| Path | SHA-256 |
|---|---|
| `packages/crypto/src/index.ts` | `30df2812a9115eb1d6104b821ac349ad349e2cbbec600c7dd98fd6c0349330bd` |
| `packages/db/src/identity.ts` | `1454c7445a127cdf7b2258df1ee7d6875c445cd4a1bbfbc842abfa8d48322c70` |
| `apps/api/src/registration.ts` | `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e` |
| `packages/crypto/package.json` | `e40481c515e6f9641afa0359b0cf944f02cf1a6894702d6cdd5e4d71f09e69fe` |
| `packages/db/package.json` | `da1bb4728c5c578a23fb24baed14768205b9fda9ee9147c8a61c1ee2d67576d3` |
| `apps/api/package.json` | `577cc73d27dfcba9e0541359141b743524d8e96aeb3a144be580e9e606c517ad` |
| `pnpm-lock.yaml` | `71ed6444672f96731fc679d092a6040ae4145296ffb1d0462b9efef0a1492acc` |
| `tests/unit/identity-crypto.test.ts` | `0cf0d0699a99ee201d87da2cfd772f144f71baa32a75ce3297fcab41958fc028` |
| `tests/unit/registration.test.ts` | `aea9f2c650665d3ddda70fd2c31015fef7b5b64de0d7431231d362770516098b` |
| `tests/integration/registration-database.test.ts` | `c0a177397dd95e82b99c633d252d3a7a0e1e7ef0b9f42444682f1a79ede4359f` |

Stop before editing if HEAD, the index, a gold hash, or ticket authority differs.

## Exact write boundary

Allowed product writes:

- `packages/crypto/src/index.ts`
- `packages/crypto/src/argon2-worker.ts` — new
- `packages/crypto/src/argon2-worker-pool.ts` — new
- `packages/db/src/identity.ts`
- `apps/api/src/registration.ts`
- `apps/api/src/main.ts`
- `packages/register/src/auth-policy.ts` — only bounded upper validation for
  the already-ruled Argon parameters; do not change current parameter values

Allowed test writes:

- `tests/unit/identity-crypto.test.ts`
- `tests/unit/registration.test.ts`
- `tests/integration/registration-database.test.ts`
- `tests/unit/argon2-worker-pool.test.ts` — new
- `tests/architecture/t1-argon2-worker-contract.test.ts` — new

Allowed append-only evidence:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-progress.log`

No dependency or lockfile change is expected. Freeze package manifests,
migrations/schema, public API contracts, mail transport, limiter storage and
values, T9 row-lock order, and every other path. Ask Router before widening.

## RED reproduction first

Before product edits, persist a real isolated child-process reproduction using
the shipped policy values:

1. Warm `hash-wasm`.
2. Start a 1 ms interval plus a `setImmediate` heartbeat.
3. Run eight real password Argon2id jobs at 64 MiB, t=3 and the real audit IP
   plus UA derivations at 19 MiB, t=2.
4. Record wall time, heartbeats that fired while work was pending, and maximum
   event-loop gap.

The current direct implementation must demonstrate a substantive event-loop
freeze, including zero in-flight heartbeat progress during a direct Argon2
positive-control interval. Historical evidence is approximately 132–148 ms
for one password KDF and 24.5–27 ms for each audit KDF, with zero timer ticks;
measure rather than hard-code those historical timings.

If three correctly isolated attempts cannot reproduce main-thread blocking,
stop with `T1 REPRODUCTION BLOCKED`; do not manufacture a delay.

## Runtime architecture

Use pinned Node `22.23.1`'s validated strip-only TypeScript worker support:

- The only production file allowed to import `hash-wasm` is
  `packages/crypto/src/argon2-worker.ts`.
- Keep that worker entry strip-compatible TypeScript: no parameter
  properties, enums, namespaces, decorators, or import of `index.ts`.
- Spawn each worker exactly from
  `new URL("./argon2-worker.ts", import.meta.url)` with explicit
  `execArgv: []` and a stable name. Never inherit the parent loader flags and
  never depend on nested `tsx`/Vitest loaders.
- Prove plain Node, `node --import tsx`, and Vitest can boot the actual worker.
- Put typed protocol validation, queue ownership, readiness, faults, and close
  behavior in `Argon2WorkerPool` in `argon2-worker-pool.ts`.
- `apps/api/src/main.ts` creates exactly one process-owned pool before the
  repository and service, waits for every ready handshake before `listen`, and
  injects the same pool/executor into both consumers. No module singleton,
  pool-per-request, pool-per-repository, or second physical pool.

Move password hash, password verify, audit IP hash, and audit UA hash through
the pool. Normal wrong/malformed passwords may return `false`; worker failure,
timeout, or capacity exhaustion must remain a typed infrastructure failure,
never become `false` or a weaker hash. Never fall back to caller-thread Argon2,
a fast hash, or an unaudited write.

The existing logical `maxConcurrentRegistrationHashes=32` remains frozen.
It is not the worker count. Preserve its accepted request/capacity behavior,
including the existing bounded registration/mail admission. Avoid retaining
the same plaintext in two queue nodes: transfer and clear ownership at each
handoff, and document the single live owner. If a queue refactor would lower
the accepted approximately-103 registration capacity, stop instead of
reinterpreting the 32-policy value.

## Provisional engineering bounds

Implement against these explicit candidate bounds, but label them provisional
until Router obtains V ratification after measured evidence:

- physical workers: `2`
- credential-lane outstanding cap: `32`
- audit-lane outstanding cap: `96`
- total queued/running jobs: never more than `128`
- per-running-job timeout: `10_000 ms`, measured from dispatch, not enqueue
- worker restart breaker: at most `3` failures in rolling `60_000 ms`
- audit-IP cache: `4_096` total entries, absolute TTL `60_000 ms`

Do not encode these as a new persisted register row in this ticket: changing
an already-sealed deployed register version would require a wider migration/
version decision. Keep named, typed construction bounds adjacent to the pool,
make tests inject smaller values, publish measurements, and require the V
checkpoint before final custody. Do not use 32 physical workers: 32 x 64 MiB
would create an approximately-2-GiB Argon allocation risk.

Existing Argon parameters remain exact. Add finite upper validation at the
current supported maxima so a syntactically valid but hostile register cannot
defeat the resource bound. Never lower memory, time, parallelism, hash length,
domains, salt sizes, output encoding, or golden digests.

## Queue, fairness, faults, and close contract

- One in-flight job per worker.
- Separate credential and audit lanes with the caps above and an explicit
  starvation bound (round-robin or equivalent). A registration burst may not
  indefinitely delay delivery/refusal audits, and audit traffic may not
  indefinitely delay credentials.
- Reject before retaining a payload when either its lane or total capacity is
  full, using a typed, constant, secret-free retryable error.
- Messages have unpredictable job IDs and validated operation/result shapes.
  Never log or interpolate password, IP, UA, salt, hash, or encoded credential.
- Transfer mutable byte arrays where practical; zero every sender/worker copy
  in `finally`. Remove queued plaintext references on cancellation, dispatch,
  settlement, fault, and close.
- A crash or timeout rejects the active job exactly once and does not retry
  that secret-bearing job. Replace the worker only for later queued work.
- Enforce the rolling restart budget; when tripped, fail the pool closed and
  settle every queued/new promise with the generic typed infrastructure error.
- `close()` is idempotent `OPEN -> CLOSING -> CLOSED`: reject new work, drain
  to a bounded deadline, reject leftovers, terminate workers, settle every
  promise, clear cache/key/salt material, and return promptly.
- Register close behavior with Fastify's `onClose` path and make workers not
  keep a terminating process alive. Do not add process signal orchestration or
  the complete background refusal/mail drain here; Kanban T3
  `t_de2be7d1` owns graceful signal shutdown and must later consume this close
  primitive.

## Audit transaction placement

Today `appendAudit` computes two Argon KDFs inside open PostgreSQL
transactions. Refactor every repository mutation so source normalization and
both worker-backed audit derivations finish before `pool.connect()`, `BEGIN`,
row locks, or the audit-chain advisory lock. Pass only prepared digests into
the transactional append helper.

Preserve atomic audit insertion, advisory serialization, chain payloads,
occurredAt, decisions, justifications, actor selection, and all database
mutation order. New and duplicate registration must perform equivalent audit
KDF work. A worker failure must occur before any durable identity mutation.

## Per-IP cache privacy contract

Cache only the normalized audit source-IP derivation. UA derivation uses the
worker but is not cached; T1 authorizes a per-IP cache, not broader retained UA
state. Never cache passwords, password verification, tokens, email, UA,
request IDs, or raw IP values.

- Own the cache beside an injected audit-context hasher for one salt/parameter
  epoch.
- Use a fresh random 32-byte process-local HMAC key and a domain-separated
  canonical input including normalized IP, a salt fingerprint, and the full
  KDF parameter tuple. A map key must never be plaintext or an unkeyed digest.
- Store only opaque HMAC keys, the already-persistable Argon digest or
  coalesced promise, and monotonic expiry/LRU metadata. The HMAC locator must
  never be persisted as the audit digest.
- Count in-flight entries toward the 4,096 cap. Coalesce identical misses.
  Never cache an error. If capacity is entirely in-flight, bypass insertion
  rather than exceed the cap.
- Absolute TTL never extends on hits. Evict settled LRU entries lazily without
  per-entry timers. Clear entries and zero the HMAC key and salt copy on close.
- Cache hit output is byte-identical. Salt, parameters, or domain changes must
  miss and retain existing VR-7 domain separation and rotation behavior.

## Non-vacuous GREEN gates

1. **Runtime matrix:** actual worker boots under plain Node, tsx, and Vitest;
   assert its URL and empty `execArgv` behavior.
2. **Responsiveness:** after warming real workers, actual 64 MiB/t=3 password
   work and actual 19 MiB/t=2 audit work allow multiple heartbeats while each
   returned promise is still pending. The isolated direct `hash-wasm`
   positive control records zero in-flight heartbeats. For the eight-password
   pool run, require measured p99 event-loop gap `<=50 ms` without reducing
   Argon work.
3. **Deterministic capacity:** a barrier fake proves exactly two active,
   exact 32/96 lane caps, total <=128, the next job's typed rejection,
   cancellation cleanup, one settlement, and the stated fairness bound.
4. **Real resource bound:** isolated child warms both real workers with maximum
   64-MiB jobs, proves two distinct non-main `threadId`s, records peak RSS,
   queue occupancy and close latency, and exits promptly. Do not treat
   `resourceLimits` as a WASM/RSS proof. Round an honest operator bound upward
   by the mission's existing 32-MiB rule and return it for V ratification.
5. **Database ordering:** a barrier-controlled injected audit executor proves
   `pool.connect()` and `BEGIN` remain untouched until both derivations finish.
6. **Faults:** fixtures crash before ready, during active work, and with queued
   work; prove bounded replacement, breaker, no hung promises, no double
   settlement, generic errors, and no secret logs.
7. **Cache privacy/bounds:** deterministic clock/executor tests prove hit,
   absolute expiry, true LRU, exact capacity, in-flight coalescing/error
   deletion, IP-vs-UA/domain separation, salt/parameter rotation, and no
   password cache. A forced-GC child builds unique dynamic IP sentinels, drops
   request references, and proves cache structures do not retain plaintext;
   keep a positive-control sentinel so the scan cannot pass vacuously.
8. **Functional invariants:** password encoding and correct/wrong/malformed
   verification, audit golden vectors, raw-IP/raw-UA absence, audit chain,
   registration/resend exact public responses, T9 zero-deadlock order, rate
   limiting, and delivery truth all remain unchanged.
9. **Capacity/enumeration:** retain N=1/4/8 timing gates and current null-q99
   method; AUC <=0.80, median gap <=100 ms, and minimum response >=580 ms.
   Healthy-MTA 100/100 commit and 128/160 observation must accept at least the
   established approximately 103 requests. Do not loosen thresholds or claim
   a higher capacity without evidence.

## VR-10 mutation campaign

Run each mutant alone, require RED, restore byte-identically, and hash-check:

1. import/call `hash-wasm` on the main production path;
2. inherit parent `execArgv` or rely on the tsx/Vitest loader;
3. permit a third active worker;
4. exceed either lane cap or the total 128 cap;
5. remove fairness so one lane starves;
6. silently fall back to main-thread or fast hashing on capacity/fault;
7. omit the salt fingerprint, parameters, or domain from the IP cache key;
8. use plaintext IP or an unkeyed digest as a cache key;
9. disable expiry/eviction or retain a rejected in-flight cache entry;
10. cache password hashes, detected by loss of fresh-salt outputs;
11. move audit KDF preparation back after `pool.connect()`/`BEGIN`;
12. leave an active/queued promise or worker alive after crash/close;
13. allow infinite worker replacement;
14. reduce any Argon parameter or change an audit golden digest.

Any GREEN mutant is a harness defect and blocks handoff.

## Gates, evidence, and handoff

Run in order:

1. durable RED reproduction;
2. focused worker/cache/unit GREEN;
3. database ordering and real PostgreSQL auth regressions;
4. runtime, responsiveness, resource and close children;
5. every VR-10 mutant RED and byte-restored;
6. three consecutive clean focused T1 batteries;
7. adjacent B1/B3 queue-slack, B4 availability, S3 opacity/capacity, T9
   lock-order, audit-chain and rate-limit gates;
8. `pnpm typecheck`, `pnpm lint`, `git diff --check`;
9. complete SHA/mtime scope and mutation-residue audit;
10. sole-heavy `pnpm test`, followed by the static and scope gates again.

Append exact commands, timestamps, raw exit codes, metrics, mutants, hashes,
and residuals to `logs/T1-progress.log`. Full-suite runtime is known to exceed
25 minutes: do not start it inside a Claude Bash call capped below 35 minutes.
After every pre-full-suite gate is green, post `ROUTER FULL SUITE REQUIRED`
with exact candidate hashes and stop; Router will run the exclusive durable
visible lane and resume this same session to consume it.

Refresh T1 before phase transitions and emit Kanban heartbeats at least every
10 minutes. Claim/assign the card as `claude-opus` in this shared checkout, not
its empty scratch workspace. On a fully green pre-review candidate, post
`READY FOR PEER REVIEW` with exact changed paths/hashes and evidence. Do not
stage, commit, complete, or push. Return `T1 CLAUDE READY FOR PEER REVIEW`.

Stop and return `T1 CHANGES REQUESTED` if scope must widen, main-thread
Argon remains, worker runtime is not stable across the matrix, a secret is
retained/logged, any KDF begins after `BEGIN`, fairness/fault/close promises
cannot be proven, an audit digest changes, the approximately-103 capacity or
opacity regresses, a threshold/value must be loosened, a mutant stays green,
or any frozen path changes.

Before final custody, Router must obtain V's explicit ratification of the
measured worker count/queue/cache/TTL and operator RSS bound. Implementation
may proceed against the provisional 2/32/96/4096/60s values; they are not
pre-existing ruled policy.
