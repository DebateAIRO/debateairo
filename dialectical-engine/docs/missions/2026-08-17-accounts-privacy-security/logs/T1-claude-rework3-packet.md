# T1 rework 3 — Claude Opus coding-seat packet

## Authority and role

You are the fresh visible Claude Opus coding seat for Kanban ticket `accounts-phase1/t_b225b2f2` (T1). Codex is Router and will perform peer review and final custody. Read this packet in full before any action; it is your only scope authority.

Mandatory RED -> GREEN -> REFACTOR. Reproduce each exact blocker on the frozen bytes before product edits. Do not self-approve, update Kanban state, stage, commit, push, run the repository-wide `pnpm test`, or invoke Grok/Hermes/Fable/local-model agents. `hermes kanban` is board-client-only and Router owns it.

## Entry custody

Repository:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Expected HEAD: `9801f85d97e4263a7c8311304e29d6a03c4a6d15`; parent: `694b8c06d7194ef5f3c3da5dee745beae847e605`; git index empty.

Frozen entry manifest:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
c2f8b8dedc1bd8814ae8933af638faf70a6f9b5079237d59c3f61a5815395caa  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
ec334d38bd54880cd291f675f1bd79b4933334103732906a369bd6e5e296d247  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
b7476cf01461c6c49cd0fbc2057e0957b07d54e56035685c82bcf3e6f278cf85  tests/unit/argon2-worker-pool.test.ts
07bd2d320bd06ba250017843b30e638cbcf35f5322029595f7061c285e133ae9  tests/architecture/t1-argon2-worker-contract.test.ts
7443702a59f187db300199d1fef135ba434bb5aa970ffbdbfdd482f4d8ceb285  docs/missions/2026-08-17-accounts-privacy-security/logs/T1-sol-rework2-final-review-packet.md
```

Verify all hashes and the empty index before edits. Stop as `CODEX BLOCKED (custody)` on any mismatch.

Existing unrelated dirt is quarantined and must not be touched: root `.claude/launch.json`, root `.gitignore`, `logs/run-claude-seat.sh`, and `docs/missions/2026-08-21-observability-loop/**`.

## Touch-only contract

Product:

- `packages/crypto/src/argon2-worker-pool.ts`
- `apps/api/src/registration.ts`

Tests, only as required for the two blockers:

- `tests/unit/argon2-worker-pool.test.ts`
- `tests/architecture/t1-argon2-worker-contract.test.ts`
- `tests/unit/registration.test.ts` only if the architecture fixture cannot non-vacuously exercise retry without weakening the real service contract

You may append only to `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework3-progress.log`. Temporary runners/receipts belong under `/tmp/t1r3` only. Do not edit any other repository file. If the smallest correct fix needs another path, stop and document the exact widening request before touching it.

All previously accepted T1 properties are frozen: 2 workers; 32 credential / 96 audit / 128 total outstanding; 45 ms cadence; current decision N*=3 / 430 ms / 35 ms / exact capacity 103; historical N*=2 unchanged; N*=4 not claimed; 2 MiB hermetic retention gate; auth opacity/error mapping; KDF-before-transaction; queue fairness; cache bounds; exact worker response binding; CLOSING dispatch guard. Do not publish an operator RSS ceiling.

## RED 1 — bounded observation permanently disables late authoritative death confirmation

Two independent fresh GPT-5.6 Sol xHigh reviewers found the same High blocker.

Current `retire()` calls `finish("unconfirmed")` at its deadline. That sets one permanent `settled` guard. Any explicit worker `exit` after the deadline is ignored, the handle stays forever in `retiring`, and a later successful close-time `terminate()` is also discarded because `close()` awaits the already-settled `"unconfirmed"` promise. The pool can remain `CLOSING` and report retiring custody forever after physical death was authoritatively confirmed.

Reproduce with two non-vacuous, short, ruled-timeout tests before changing product code:

1. Initial `terminate()` rejects; no `exit` before the injected confirmation deadline; assert no replacement overlap and typed fail-closed behavior; then emit a **late explicit exit after the deadline**. It must reconcile retiring/live custody truthfully. Once the remaining handles are confirmed, a subsequent close must be capable of reaching `CLOSED` with zero live/retiring handles. Breaker fail-closed state need not reopen or spawn a replacement.
2. Initial `terminate()` rejects and the deadline expires; a later close-time termination retry **resolves**. That fulfilled retry must confirm death and allow truthful bounded closure, not reuse a stale unconfirmed verdict.

Repair rule: separate the persistent physical-death confirmation latch from each caller's bounded observation/deadline. Only explicit `exit` or a fulfilled termination attempt may release/delete physical custody. A deadline may return a bounded unconfirmed result to the replacement or close attempt, but must never disable later authoritative confirmation. Preserve one physical handle/accounting entry, one replacement maximum, no overlap, no hang, exact settlement, and generic typed errors.

Mutation-test both late-confirmation limbs and the separation between timeout and death latch. Every non-equivalent mutant must go RED through its named mechanism and restore source bytes exactly.

## RED 2 — shutdown refusal-audit failure is logged, deleted, and reported drained

The lifecycle reviewer found a separate High blocker in `scheduleRefusalAuditFlush()` / `drainRateLimitAuditFlushes()`.

Current flow finalizes and deletes the limiter aggregate before awaiting `recordRateLimitRefusal()`. If that repository write rejects, the catch only logs; `finally` deletes the pending entry and resolves completion. The shutdown drain therefore reports success, and `main.ts` can close the Argon2 surface, despite no durable refusal row and no retryable copy.

Reproduce before product edits with a real `RegistrationService` instance and controlled repository seam:

1. Create a real pending refusal aggregate, then make the first shutdown-time `recordRateLimitRefusal` reject.
2. Assert the public refused request remains the same typed/opaque 429 outcome; background audit failure must never rewrite the response.
3. Assert `drainRateLimitAuditFlushes()` rejects promptly (no 60-second wait), teardown-after-drain would not run, and the aggregate/pending work remains retryable rather than discarded.
4. Recover the repository seam and retry the drain. It must write exactly one durable aggregate row, then resolve and clear pending work. Repeated drain must be prompt and idempotent: no double-write.

Repair rule: retain the finalized aggregate in pending flush state until persistence succeeds. The ordinary request path may log asynchronously and preserve the public response, but the explicit shutdown drain must observe/propagate persistence failure and must not claim completion or destroy the last retryable copy. Preserve the existing aggregate content/window/count semantics and successful-path `fireNow()` behavior.

Mutation-test the failure propagation, retained-retryable copy, recovery exactly-once write, and public-response isolation. Each named mechanism must be non-vacuous and byte-restored.

## Required gates and handoff

After both GREEN and refactor:

1. Run the smallest focused RED/GREEN tests first, then the full relevant pool + registration unit and architecture files. No repository-wide `pnpm test` in this author seat.
2. Run `pnpm typecheck`, `pnpm lint`, and `git diff --check` on final bytes.
3. Re-run the existing rework2 R1/R2/R3/R4 focused gates to prove no regression. Heavy PostgreSQL B4/S3b need not be repeated because neither frozen file/path may change in rework3.
4. Run a fresh VR-10 delta campaign for every new assertion and report intended mechanisms, before/after hash+size+mtime manifests, restoration, and residue audit. Preserve the prior 27/27 rework2 receipt; do not rerun unrelated mutants.
5. Record final HEAD, empty index, `git status --short`, and hash/size/mtime for all 12 frozen candidate paths plus this packet. Distinguish entry-identical versus rework3-changed paths.
6. Append exact RED/GREEN/VR-10/custody evidence to `logs/T1-rework3-progress.log` and finish with `REWORK READY FOR PEER REVIEW` or `CHANGES REQUESTED`. Do not stage, commit, complete, push, or run the full suite.

The separate operator-RSS waiver remains a Router/V decision. Continue this rework regardless; do not invent or publish 256/320/1024 MiB.
