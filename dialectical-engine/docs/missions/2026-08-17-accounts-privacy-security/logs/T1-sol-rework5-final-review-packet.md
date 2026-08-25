# T1 rework 5 — frozen final-review packet

## Authority

Perform an independent read-only GPT-5.6 Sol xHigh review of the exact T1 candidate in:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Do not modify files, run tests, stage, commit, complete the Kanban ticket, or push. Return exactly `APPROVED` or `CHANGES REQUESTED`. A blocking finding must give priority, exact source/test evidence, a concrete reachable trace, and the smallest safe correction. Recheck HEAD, index, and all 12 hashes immediately before verdict.

Grok is decommissioned. Hermes/Fable models are retired; `hermes kanban` is board client only.

## Frozen custody

- HEAD `9801f85d97e4263a7c8311304e29d6a03c4a6d15`
- T1 parent/base `694b8c06d7194ef5f3c3da5dee745beae847e605`
- Git index empty
- Rework5 code-author session `cb65f99e-1ab7-44e0-92c7-0733f27cd509`, clean exit
- Evidence-correction session `72effeb0-e0c1-4c7d-907d-c7c195600af3`, clean exit
- Code-author packet `T1-claude-rework5-packet.md`, SHA-256 `11fb81c7a484f319a6b25aef027a63d67a3a0d210cddbf6cb6e8d9d726dbf952`
- Evidence-correction packet `T1-claude-rework5-evidence-correction-packet.md`, SHA-256 `ecdc5992d71a8c13cdc82ebc4078e756293f3fe625f74d3666e971f1ad351f73`

Exact 12-path manifest:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
e92f2ab13667a705d12e617ede7ede773c7d56f4e14e3210125450f02c7ea72c  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1  tests/architecture/t1-argon2-worker-contract.test.ts
```

Expected unrelated dirt must remain untouched: repository-root `.claude/launch.json`, repository-root `.gitignore`, `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh`, and `docs/missions/2026-08-21-observability-loop/**`.

## Prior blocker and correction

Rework4 sorted each per-route refusal aggregate by `windowStartedAt`. Its pump selected `queue[0]`, awaited persistence, then blindly `shift()`ed the current head. If the wall clock stepped backward while a newer head write was held, a retrograde window could sort ahead of the in-flight object. Settlement then removed the unwritten retrograde object, rewrote the already-landed newer object, and let shutdown report drained. Dual Sol review classified this High.

Rework5 changes only the pump removal logic:

```ts
const writing = coordinator.queue[0]!;
await this.recordRefusalAggregate(route, writing);
const at = coordinator.queue.indexOf(writing);
if (at >= 0) coordinator.queue.splice(at, 1);
```

Review adversarially:

- exact object identity across every enqueue/write/reject/drain/cleanup interleaving;
- whether `indexOf(writing) === -1` is actually unreachable and whether silently continuing is safe;
- distinct-object guarantees and any same-object duplicate enqueue path;
- rollback ordering, retries after failure, concurrent drains, and queue cleanup;
- no request latency leak, unhandled rejection, duplicate/lost row, false drain, or route-owner loss;
- all earlier T1 worker-pool, shutdown, capacity, opacity, and register decisions remain intact.

## Code/test evidence

Author progress: `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework5-progress.log`.

Raw pre-fix RED:

- `/tmp/t1r5/red/retrograde-RED-final-tests.log`
- Frozen product `def4b254...`; final test bytes `3548b932...`; exit 1 by named `AUDIT_IDENTITY` in milliseconds, not timeout; PRE/POST custody exact.

Final stable GREEN receipts under `/tmp/t1r5/green/`:

- `1-rework5-focused.log`: 2/2, exit 0
- `2-rework4-battery.log`: 5/5, exit 0
- `3-full-battery.log`: three files, 174/174, exit 0
- `4-rework2-filter.log`: 49 passed, exit 0
- `5-rework3-filter.log`: 7 passed, exit 0
- `6-typecheck.log`, `7-lint.log`, `8-git-diff-check.log`: exit 0

Original delta mutation receipt `/tmp/t1r5/vr10/receipt.log`:

- final stable hashes `0b75f99d...` / `3548b932...`
- unsafe blind-shift M9 and positional-splice M9b both RED by `AUDIT_IDENTITY`
- combined no-cancel/no-guard M10 RED by `AUDIT_SUCCESSOR`
- exact restoration after every case
- its aggregate M8 classification is superseded by the correction below.

## M8 classification correction

Progress: `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework5-evidence-correction-progress.log`.

Authoritative raw supplement:

- runner `/tmp/t1r5/m8-classification/supplement.mjs`
- receipt `/tmp/t1r5/m8-classification/receipt.log`
- raw per-case logs `/tmp/t1r5/m8-classification/raw/**`
- 80/80 checks, exit 0, exact PRE/POST bytes/mtime/status/index
- one non-equivalent case, killed 1, survivors 0
- two documented production-equivalent cases

Classification to review skeptically:

1. Guard-only M8: realistic real-timer production test GREEN; direct private-seam defense test RED. Claimed production-equivalent because shipped rollover cancels a not-yet-running timer and synchronous finalization cannot interleave after beginning.
2. Cancellation-only M10a: realistic real-timer test GREEN. Claimed production-equivalent because the exact-active guard makes the late callback a total no-op.
3. Combined M10: realistic real-timer test RED by named `AUDIT_SUCCESSOR` without generic timeout.

Negative controls: `/tmp/t1r5/m8-classification/negative-controls.log` and raw `NC*.log`; five false-claim runner variants each exit 1, name the catching check, and restore bytes. First failed supplement attempt is disclosed and superseded: it incorrectly required candidate paths to be clean against HEAD; the corrected runner compares exact PRE/POST porcelain because T1 is intentionally uncommitted.

## Custody incident

The code-author report discloses an accidental `git checkout -- apps/api/src/registration.ts` after all final green/mutation gates. Because the rework4 entry was uncommitted, this temporarily restored the HEAD blob. Claude restored the byte-exact rework5 file from `/tmp/t1r5/registration.rework5.ts`, reconstructed frozen entry bytes without Git for the second RED, and reverified hashes. Router independently rechecked all 12 hashes, empty index, and `git diff --check` after both Claude sessions exited. Determine whether exact hash restoration is sufficient or whether any receipt must be rerun; do not accept narrative alone.

## Frozen decisions and remaining release work

- two workers, credential/audit/total 32/96/128, no main-thread fallback;
- versioned N*=3 at 45 ms, exact accepted capacity 103, N*=4 not claimed, historical N*=2 sealed;
- strict isolated 2 MiB retention gate;
- no 256/320/1024 MiB operator RSS ceiling is published; waiver/rebaseline remains Router/user decision;
- repository-wide `pnpm test` and heavy PostgreSQL battery are reserved for a fresh visible Claude final-custody seat after peer approval.

## Verdict format

Start `APPROVED` or `CHANGES REQUESTED`, then state:

1. product findings;
2. test/evidence findings, including M8 correction and custody incident;
3. non-blocking residuals;
4. final HEAD/index/12-hash custody.

