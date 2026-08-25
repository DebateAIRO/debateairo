# T1 rework 3 — final Sol peer-review packet

## Role and custody

You are a fresh, independent, read-only GPT-5.6 Sol xHigh reviewer. Do not edit repository files, run tests, update Kanban, stage, commit, push, or invoke any model. Review the actual frozen candidate in:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Review HEAD is `9801f85d97e4263a7c8311304e29d6a03c4a6d15`; parent/prior T1 base is `694b8c06d7194ef5f3c3da5dee745beae847e605`. The index must remain empty. A repository-reorganization commit captured much of T1, so working-tree diff alone is not the complete T1 surface.

Unrelated user/other-lane dirt is quarantined and must not be touched: root `.claude/launch.json`, root `.gitignore`, `logs/run-claude-seat.sh`, and `docs/missions/2026-08-21-observability-loop/**`.

## Frozen final manifest

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
1f1ee2b636a7769b04aa84f676cadd03d679c3787f478eaf32d8a0ed9d7f04b9  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
e92f2ab13667a705d12e617ede7ede773c7d56f4e14e3210125450f02c7ea72c  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
f78fc4210cfbf68dfd99240a16356d47c74c3abb600102f09593d983dfe137ce  tests/architecture/t1-argon2-worker-contract.test.ts
4605ee61ddcbfecbe7ac0c54ebe610e122e33837eb312613c019c1cbb2686865  docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-rework3-packet.md
```

Claude Opus visible author session `8c4d12fe-ff5a-4b02-a1a2-7d24c0dafce8` exited cleanly. Its result and full durable narrative are:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework3-claude-result.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework3-progress.log`
- `/tmp/t1r3/vr10.py`
- `/tmp/t1r3/vr10-results.json`

Rework-3 changed only four contracted files: `argon2-worker-pool.ts`, `registration.ts`, the pool unit test, and the T1 architecture test. `tests/unit/registration.test.ts` remained exact.

## Blocking findings reworked

### A. Late authoritative worker-death confirmation

The rejected candidate permanently settled retirement as `unconfirmed`; a later explicit exit or later successful termination retry was discarded. The new design separates a persistent per-handle physical-death record from each bounded observation. Review:

- only explicit `exit` or fulfilled termination releases custody;
- timeout/rejection/throw never releases custody or permits overlap;
- late exit reconciles truthful live/retiring stats but does not reopen the fail-closed breaker or spawn replacement;
- close makes a fresh termination attempt and fresh bounded observation without double-accounting a handle;
- all races remain bounded, exactly-once, and no queued secret dispatches after CLOSING.

### B. Shutdown refusal-audit write loss

The rejected candidate finalized/deleted the limiter aggregate, swallowed repository failure, deleted pending state, and reported drained. The new design retains `unpersisted` aggregates until their write succeeds, propagates explicit drain failure, and coalesces concurrent drain attempts. Review:

- ordinary request still returns the same opaque typed 429 and never awaits background persistence;
- shutdown drain fails promptly on persistence failure and prevents hasher/pool teardown;
- last retryable aggregate copy is retained and later recovery writes exactly once;
- concurrent drains cannot double-write;
- successful path remains prompt/idempotent and preserves exact route/window/count/source content;
- **adversarially inspect window rollover**: when a new refusal window supersedes an older entry before the old timer finalized it, or while the old flush is in flight, no old limiter aggregate/promise may be orphaned, overwritten, double-finalized, or falsely reported drained. Do not assume the new carry-forward comments prove this.

## Frozen broader T1 contract

The full candidate must still preserve: one process-owned two-worker pool; 32 credential / 96 audit / 128 total outstanding; no main-thread fallback; exact password-response m/t/p/salt/digest binding and lawful failure code; CLOSING dispatch barrier; mail/audit drain before pool close; auth opacity/error mapping; KDF-before-transaction; historical N*=2 unchanged; current versioned N*=3, 45 ms, 430 ms, 35 ms, exact capacity 103; N*=4 not claimed; 2 MiB hermetic retention gate.

No 256/320/1024 MiB operator ceiling may be approved. Observed ~317.9 MiB remains a fact only; the operator-RSS waiver is a separate Router/V decision.

## Evidence under review

Author reports:

- frozen-byte RED 1: two failures (late explicit exit, close-time fulfilled retry);
- frozen-byte RED 2: three failures plus one passing public-response preservation control;
- final relevant suites: 3 files / 167 tests pass;
- typecheck, lint, and diff-check exit 0;
- rework2 regression filters R1/R2/R3/R4: 5/2/17/5 pass;
- new VR-10 delta: 9/9 intended mutants RED, zero survivors, hashes restored; first M8 survivor was not waived and was killed after adding a concurrent-drain barrier test;
- prior rework2 gates/VR-10/B4/S3b remain on unchanged bytes.

Important evidence caveat: the pre-fix RED command output is transcribed in `T1-rework3-progress.log`; there is no separate `/tmp` RED log. Determine independently whether the narrative plus exact behavior, final tests, and non-equivalent mutant receipts are sufficient. Do not silently upgrade a self-report into an external receipt.

The repository-wide `pnpm test` remains intentionally unrun and is reserved for a fresh visible Claude final-custody seat after peer approval.

## Deliverable

Return exactly one primary verdict: `APPROVED` or `CHANGES REQUESTED`.

For every blocker, provide severity, exact file/line evidence, failing trace, and smallest safe correction. Separate product blockers, evidence/test blockers, and residual risks. Recheck HEAD, empty index, and all 12 candidate hashes before finalizing. Do not rely on another reviewer.
